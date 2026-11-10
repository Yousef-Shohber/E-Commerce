import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ErrorCode } from '../common/errors';
import { durationToSeconds, safeEqual, sha256 } from '../common/utils';
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
import { RefreshToken } from './entities/refresh-token.entity';
import { OtpPurpose } from './enums/otp-purpose.enum';
import { GoogleProfile } from './google.strategy';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { AuthTokens, RefreshTokenPayload } from './types/token.types';

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
    private readonly dataSource: DataSource,
    private readonly refreshTokenCleanup: RefreshTokenCleanupService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepo: Repository<RefreshToken>,
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
   * Logs a user in with email and password and starts a new session
   * (a new refresh token family).
   * A password check also runs when the email does not exist, so the answer
   * takes the same time and does not tell whether the email is registered.
   */
  async login(dto: LoginDto): Promise<AuthTokens> {
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

    const tokens = await this.issueTokens(credentials.id, randomUUID());

    await this.refreshTokenCleanup.clean();

    return tokens;
  }

  /**
   * Logs a user in with Google. Links Google to the account that has the same
   * email, or creates a new account.
   */
  async loginWithGoogle(profile: GoogleProfile): Promise<AuthTokens> {
    let user = await this.usersService.findByGoogleId(profile.googleId);

    if (!user) {
      const existing = await this.usersService.findByEmail(profile.email);

      user = existing
        ? await this.usersService.linkGoogleAccount(existing, profile.googleId)
        : await this.usersService.createFromGoogle(profile);
    }

    const tokens = await this.issueTokens(user.id, randomUUID());

    await this.refreshTokenCleanup.clean();

    return tokens;
  }

  /**
   * Rotates a refresh token and issues a new access and refresh token pair.
   * The used token is revoked and a new one joins its family. Using a token
   * that was already revoked (a stolen copy, or a replay) revokes the whole
   * family, so the real user and the thief are both signed out.
   * @param token The refresh token sent by the client
   * @throws UnauthorizedException If the token is invalid, expired or reused
   */
  async refresh(token: string): Promise<AuthTokens> {
    const payload = await this.verifyRefreshToken(token);
    const refreshToken = await this.refreshTokensRepo.findOneBy({
      id: payload.jti,
    });

    if (
      !refreshToken ||
      refreshToken.userId !== payload.userId ||
      refreshToken.family !== payload.family
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.REFRESH_TOKEN_INVALID,
        message: 'Invalid refresh token',
      });
    }

    if (
      refreshToken.revoked ||
      !safeEqual(refreshToken.tokenHash, sha256(token))
    ) {
      await this.revokeFamily(refreshToken.family);

      throw new UnauthorizedException({
        code: ErrorCode.REFRESH_TOKEN_REUSED,
        message: 'Refresh token reuse detected, please log in again',
      });
    }

    if (refreshToken.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        code: ErrorCode.REFRESH_TOKEN_EXPIRED,
        message: 'Refresh token expired, please log in again',
      });
    }

    const user = await this.usersService.findById(refreshToken.userId);

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.ACCESS_TOKEN_INVALID,
        message: 'Invalid refresh token',
      });
    }

    // Compare-and-set: of two parallel refreshes with the same token only one
    // wins, the other is treated as a reuse.
    const tokens = await this.dataSource.transaction(async (manager) => {
      const { affected } = await manager.update(
        RefreshToken,
        { id: refreshToken.id, revoked: false },
        { revoked: true },
      );

      if (!affected) return null;

      return this.issueTokens(user.id, refreshToken.family, manager);
    });

    if (!tokens) {
      await this.revokeFamily(refreshToken.family);

      throw new UnauthorizedException({
        code: ErrorCode.REFRESH_TOKEN_REUSED,
        message: 'Refresh token reuse detected, please log in again',
      });
    }

    return tokens;
  }

  /**
   * Logs out: revokes the whole refresh token family of this session.
   * Never throws (a broken or expired token has nothing left to revoke).
   * @param token The refresh token sent by the client
   */
  async logout(token: string): Promise<void> {
    try {
      const payload = await this.verifyRefreshToken(token);

      await this.refreshTokensRepo.update(
        { family: payload.family, userId: payload.userId, revoked: false },
        { revoked: true },
      );
    } catch {
      // Nothing to do
    }
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
   * Sets a new password with the code that was emailed, and revokes every
   * refresh token of the user (all sessions are signed out).
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

    const passwordHash = await this.passwordService.hash(dto.newPassword);

    // New password and "sign out everywhere" happen together or not at all
    await this.dataSource.transaction(async (manager) => {
      await manager.update(User, { id: user.id }, { password: passwordHash });

      await manager.update(
        RefreshToken,
        { userId: user.id, revoked: false },
        { revoked: true },
      );
    });

    return {
      message: 'Password has been reset. Please log in with your new password',
    };
  }

  /**
   * Changes the password of the logged in user and signs out every OTHER
   * session. The session of the refresh token cookie stays valid; if the
   * cookie is missing or is not the user's, all sessions are revoked.
   * @param refreshToken The refresh token cookie of the current session, if any
   * @throws BadRequestException If the account has no password, the current
   * password is wrong, or the new password is the same. A 400 (not 401) is
   * used so clients do not mistake it for an expired token.
   */
  async changePassword(
    user: User,
    dto: ChangePasswordDto,
    refreshToken?: string,
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

    const currentFamily = await this.currentFamilyOf(user.id, refreshToken);
    const passwordHash = await this.passwordService.hash(dto.newPassword);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(User, { id: user.id }, { password: passwordHash });

      const revoke = manager
        .createQueryBuilder()
        .update(RefreshToken)
        .set({ revoked: true })
        .where('"userId" = :userId AND revoked = false', { userId: user.id });

      if (currentFamily) {
        revoke.andWhere('family <> :family', { family: currentFamily });
      }

      await revoke.execute();
    });

    return {
      message: currentFamily
        ? 'Password changed. Your other devices were signed out'
        : 'Password changed. Please log in again',
    };
  }

  // Helpers

  private async sendOtp(email: string, purpose: OtpPurpose): Promise<void> {
    const code = await this.otpService.issue(purpose, email);

    if (code) await this.mailService.sendOtp(email, code, purpose);
  }

  private async currentFamilyOf(
    userId: string,
    token?: string,
  ): Promise<string | null> {
    if (!token) return null;

    try {
      const payload = await this.verifyRefreshToken(token);

      return payload.userId === userId ? payload.family : null;
    } catch {
      return null;
    }
  }

  /**
   * Signs an access token and a refresh token and stores the hash of the
   * refresh token. Pass `manager` to do it inside a transaction.
   */
  private async issueTokens(
    userId: string,
    family: string,
    manager?: EntityManager,
  ): Promise<AuthTokens> {
    const jti = randomUUID();

    const accessTtl = durationToSeconds(
      this.config.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN'),
    );
    const refreshTtl = durationToSeconds(
      this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { userId },
        {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          expiresIn: accessTtl,
          algorithm: 'HS256',
        },
      ),
      this.jwtService.signAsync(
        { userId, jti, family },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: refreshTtl,
          algorithm: 'HS256',
        },
      ),
    ]);

    const repo = manager
      ? manager.getRepository(RefreshToken)
      : this.refreshTokensRepo;

    await repo.insert({
      id: jti,
      userId,
      family,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + refreshTtl * 1000),
    });

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  private async verifyRefreshToken(
    token: string,
  ): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        token,
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          algorithms: ['HS256'],
        },
      );

      if (
        typeof payload.userId !== 'string' ||
        typeof payload.jti !== 'string' ||
        typeof payload.family !== 'string'
      ) {
        throw new Error('malformed payload');
      }

      return payload;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException({
          code: ErrorCode.REFRESH_TOKEN_EXPIRED,
          message: 'Expired refresh token',
        });
      }

      throw new UnauthorizedException({
        code: ErrorCode.REFRESH_TOKEN_INVALID,
        message: 'Invalid refresh token',
      });
    }
  }

  private async revokeFamily(family: string): Promise<void> {
    await this.refreshTokensRepo.update(
      { family, revoked: false },
      { revoked: true },
    );
  }
}
