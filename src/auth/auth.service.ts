import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '../common/errors';
import { durationToSeconds } from '../common/utils';
import { MailService } from '../mail/mail.service';
import { User } from '../users/users.entity';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { EmailDto } from './dto/email.dto';
import { LoginDto } from './dto/login.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { OtpPurpose } from './enums/otp-purpose.enum';
import { GoogleProfile } from './google.strategy';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { AccessToken, AccessTokenPayload } from './types/token.types';

const INVALID_OTP_MESSAGE = 'Invalid or expired verification code';
const OTP_SEND_MESSAGE =
  'If the account exists, a verification code has been sent to the email address';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Registers a new user and emails a verification code.
   * @param dto Email, password and optional username
   * @returns A message asking the user to verify the email
   * @throws ConflictException If the email is already registered
   */
  async register(dto: RegisterDto): Promise<MessageResponseDto> {
    if (await this.usersService.findByEmail(dto.email)) {
      throw new ConflictException({
        code: ErrorCode.EMAIL_ALREADY_REGISTERED,
        message: 'Email is already registered',
      });
    }

    const user = await this.usersService.create({
      email: dto.email,
      username: dto.username,
      password: await this.passwordService.hash(dto.password),
    });

    await this.sendOtp(user.email, OtpPurpose.EMAIL_VERIFICATION);

    return {
      message: 'Account created successfully. Please verify your email.',
    };
  }

  /**
   * Verifies the email address with the code that was emailed.
   * @throws BadRequestException If the code is wrong, expired or used
   */
  async verifyEmail(dto: VerifyEmailDto): Promise<MessageResponseDto> {
    const valid = await this.otpService.verify(
      OtpPurpose.EMAIL_VERIFICATION,
      dto.email,
      dto.otp,
    );

    const user = valid ? await this.usersService.findByEmail(dto.email) : null;
    if (!user) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_OTP,
        message: INVALID_OTP_MESSAGE,
      });
    }

    await this.usersService.makeEmailVerified(user.id);

    return { message: 'Email verified successfully. Please log in' };
  }

  /**
   * Emails a new verification code (always the same answer, so it does not
   * tell whether an email is registered).
   */
  async resendVerificationOtp(dto: EmailDto): Promise<MessageResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);

    if (user && !user.isAccountVerified) {
      await this.sendOtp(user.email, OtpPurpose.EMAIL_VERIFICATION);
    }

    return { message: OTP_SEND_MESSAGE };
  }

  /**
   * Logs a user in with email and password.
   * A password check also runs when the email does not exist, so the answer
   * takes the same time and does not tell whether the email is registered.
   */
  async login(dto: LoginDto): Promise<AccessToken> {
    const invalid = new UnauthorizedException({
      code: ErrorCode.INVALID_CREDENTIALS,
      message: 'Invalid email or password',
    });

    const credentials = await this.usersService.findCredentialsByEmail(
      dto.email,
    );

    // Google-only accounts have no password, so they can't log in here
    if (!credentials?.password) {
      await this.passwordService.verifyDummy(dto.password);
      throw invalid;
    }

    if (
      !(await this.passwordService.verify(credentials.password, dto.password))
    ) {
      throw invalid;
    }

    if (!credentials.isAccountVerified) {
      throw new ForbiddenException({
        code: ErrorCode.EMAIL_NOT_VERIFIED,
        message: 'Please verify your email before logging in',
      });
    }

    return this.issueAccessToken(credentials.id);
  }

  /**
   * Logs a user in with Google. Links Google to the account that has the same
   * email, or creates a new account.
   */
  async loginWithGoogle(profile: GoogleProfile): Promise<AccessToken> {
    let user = await this.usersService.findByGoogleId(profile.googleId);

    if (!user) {
      const existing = await this.usersService.findByEmail(profile.email);

      user = existing
        ? await this.usersService.linkGoogleAccount(existing, profile.googleId)
        : await this.usersService.createFromGoogle(profile);
    }

    return this.issueAccessToken(user.id);
  }

  /**
   * Emails a password reset code (always the same answer, whether or not the
   * email is registered).
   */
  async forgotPassword(dto: EmailDto): Promise<MessageResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);

    if (user && user.isAccountVerified) {
      await this.sendOtp(user.email, OtpPurpose.PASSWORD_RESET);
    }

    return { message: OTP_SEND_MESSAGE };
  }

  /**
   * Sets a new password with the code that was emailed.
   * @throws BadRequestException If the code is wrong, expired or used
   */
  async resetPassword(dto: ResetPasswordDto): Promise<MessageResponseDto> {
    const valid = await this.otpService.verify(
      OtpPurpose.PASSWORD_RESET,
      dto.email,
      dto.otp,
    );

    const user = valid ? await this.usersService.findByEmail(dto.email) : null;
    if (!user) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_OTP,
        message: INVALID_OTP_MESSAGE,
      });
    }

    await this.usersService.updatePassword(
      user.id,
      await this.passwordService.hash(dto.newPassword),
    );

    return {
      message: 'Password has been reset. Please log in with your new password',
    };
  }

  /**
   * Changes the password of the logged in user.
   * @throws BadRequestException If the account has no password, the current
   * password is wrong, or the new password is the same. A 400 (not 401) is
   * used so clients do not mistake it for an expired token.
   */
  async changePassword(
    user: User,
    dto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    const credentials = await this.usersService.findCredentialsById(user.id);

    if (!credentials?.password) {
      throw new BadRequestException({
        code: ErrorCode.NO_PASSWORD_SET,
        message:
          'This account has no password yet. Use "forgot password" to set one',
      });
    }

    if (
      !(await this.passwordService.verify(
        credentials.password,
        dto.currentPassword,
      ))
    ) {
      throw new BadRequestException({
        code: ErrorCode.CURRENT_PASSWORD_INCORRECT,
        message: 'Current password is incorrect',
      });
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException({
        code: ErrorCode.PASSWORD_UNCHANGED,
        message: 'New password must be different from the current password',
      });
    }

    await this.usersService.updatePassword(
      user.id,
      await this.passwordService.hash(dto.newPassword),
    );

    return { message: 'Password changed successfully' };
  }

  // Helpers

  private async sendOtp(email: string, purpose: OtpPurpose): Promise<void> {
    const code = await this.otpService.issue(purpose, email);

    if (code) await this.mailService.sendOtp(email, code, purpose);
  }

  private async issueAccessToken(userId: number): Promise<AccessToken> {
    const payload: AccessTokenPayload = { userId };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: durationToSeconds(
        this.config.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN'),
      ),
      algorithm: 'HS256',
    });

    return { accessToken };
  }
}
