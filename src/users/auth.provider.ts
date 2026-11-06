import { MailService } from './../mail/mail.service';
import { LoginDto } from './dtos/login.dto';
import { User } from './users.entity';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegisterDto } from './dtos/register.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenType, JwtPayloadType } from '../utils/types';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ResetUserPasswordDto } from './dtos/reset-password.dto';
import { pgErrorCode } from '../utils/db-errors';
import { safeEqual } from '../utils/safe-equal';

// Used so login takes the same time whether or not the email exists
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthProvider {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  // Authentication

  public async register(dto: RegisterDto) {
    const userExist = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (userExist) {
      throw new BadRequestException('User Already Exist');
    }

    const hashPassword = await this.hashPassword(dto.password);

    let newUser = this.userRepository.create({
      email: dto.email,
      username: dto.username,
      password: hashPassword,
      verificationToken: randomBytes(32).toString('hex'),
    });

    try {
      newUser = await this.userRepository.save(newUser);
    } catch (error) {
      // two requests with the same email at the same time
      if (pgErrorCode(error) === '23505') {
        throw new BadRequestException('User Already Exist');
      }
      throw error;
    }

    const link = this.generateVerifyLink(
      newUser.id,
      newUser.verificationToken!,
    );

    try {
      await this.mailService.sendVerificationToken(newUser.email, link);
    } catch (error) {
      // Partial failure: user saved but the email failed. Remove the user so
      // the person can simply try to register again.
      await this.userRepository.delete(newUser.id);
      throw error;
    }

    return {
      message:
        'Verification Token Has Been Sent To Your Email, Please Verify Your Account',
    };
  }

  public async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    // Google-only accounts have no password, so they can't log in here
    const isPasswordMatch = await bcrypt.compare(
      dto.password,
      user?.password ?? DUMMY_HASH,
    );

    if (!user || !user.password || !isPasswordMatch) {
      throw new BadRequestException('Invalid Email or Password');
    }

    if (!user.isAccountVerified) {
      let verificationToken = user.verificationToken;

      if (!verificationToken) {
        verificationToken = randomBytes(32).toString('hex');
        user.verificationToken = verificationToken;

        await this.userRepository.save(user);
      }

      const link = this.generateVerifyLink(user.id, verificationToken);

      await this.mailService.sendVerificationToken(user.email, link);

      return {
        message:
          'Verification Token Has Been Sent To Your Email, Please Verify Your Account',
      };
    }

    const accessToken = await this.generateJwt({
      id: user.id,
      userType: user.userType,
    });

    return { accessToken };
  }

  // Email Verification

  public async verifyEmail(userId: number, verificationToken: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User Not Found');
    }

    if (!verificationToken) {
      throw new BadRequestException('No Verification Token Provided');
    }

    if (!safeEqual(user.verificationToken, verificationToken)) {
      throw new BadRequestException('Invalid Verification Token');
    }

    user.isAccountVerified = true;
    user.verificationToken = null;

    await this.userRepository.save(user);

    return {
      message: 'Email Verified Successfully',
    };
  }

  // Password Reset

  public async sendResetPasswordLink(email: string) {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (user) {
      user.resetPasswordToken = randomBytes(32).toString('hex');
      user.resetPasswordExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await this.userRepository.save(user);

      const link = this.generateResetPasswordLink(
        user.id,
        user.resetPasswordToken,
      );

      try {
        await this.mailService.sendResetPassword(email, link);
      } catch {
        // already logged by MailService; the response stays the same so we
        // don't reveal whether the email exists
      }
    }

    return {
      message:
        'If an account exists for this email, a password reset link has been sent.',
    };
  }

  public async getResetPasswordLink(
    userId: number,
    resetPasswordToken: string,
  ) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User Not Found');
    }

    if (!resetPasswordToken) {
      throw new BadRequestException('No Reset Token Provided');
    }

    if (
      !safeEqual(user.resetPasswordToken, resetPasswordToken) ||
      !user.resetPasswordExpiresAt ||
      user.resetPasswordExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Invalid Or Expired Reset Token');
    }

    return {
      message: 'Valid Reset Password Link',
    };
  }

  public async resetPassword(dto: ResetUserPasswordDto) {
    const { userId, resetPasswordToken, newPassword } = dto;

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User Not Found');
    }

    const password = await this.hashPassword(newPassword);

    const result = await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({
        password,
        resetPasswordToken: null,
        resetPasswordExpiresAt: null,
      })
      .where('id = :userId', { userId })
      .andWhere('"resetPasswordToken" = :resetPasswordToken', {
        resetPasswordToken,
      })
      .andWhere('"resetPasswordExpiresAt" > now()')
      .execute();

    if (!result.affected) {
      throw new BadRequestException('Invalid Or Expired Reset Token');
    }

    return {
      message: 'Password Reset Successfully, Please Login',
    };
  }

  public async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  // Google

  public async validateGoogleUser(data: {
    googleId: string;
    email?: string;
    username: string;
  }) {
    if (!data.email) {
      throw new BadRequestException('Your Google account has no email');
    }

    const email = data.email.trim().toLowerCase();

    let user = await this.userRepository.findOne({
      where: { googleId: data.googleId },
    });

    if (user) return user;

    user = await this.userRepository.findOne({ where: { email } });

    if (user) {
      user.googleId = data.googleId;

      if (!user.isAccountVerified) {
        // Someone may have registered this email with a password they chose
        // before the real owner signed in with Google. Google proves the
        // email is theirs, so we drop the old password and tokens.
        user.isAccountVerified = true;
        user.password = null;
        user.verificationToken = null;
        user.resetPasswordToken = null;
        user.resetPasswordExpiresAt = null;
      }

      return this.userRepository.save(user);
    }

    user = this.userRepository.create({
      googleId: data.googleId,
      email,
      username: data.username,
      isAccountVerified: true,
    });

    try {
      return await this.userRepository.save(user);
    } catch (error) {
      // two Google logins at the same time created the same user
      if (pgErrorCode(error) === '23505') {
        return this.userRepository.findOneOrFail({
          where: { googleId: data.googleId },
        });
      }
      throw error;
    }
  }

  public async loginWithGoogle(user: User): Promise<AccessTokenType> {
    const accessToken = await this.generateJwt({
      id: user.id,
      userType: user.userType,
    });

    return { accessToken };
  }

  // Helpers

  private async generateJwt(payload: JwtPayloadType): Promise<string> {
    return this.jwtService.signAsync(payload);
  }

  private generateVerifyLink(userId: number, verificationToken: string) {
    return `${this.config.get<string>(
      'DOMAIN',
    )}/api/users/verify-email/${userId}/${verificationToken}`;
  }

  private generateResetPasswordLink(
    userId: number,
    resetPasswordToken: string,
  ) {
    return `${this.config.get<string>(
      'DOMAIN',
    )}/api/users/reset-password/${userId}/${resetPasswordToken}`;
  }
}
