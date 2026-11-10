import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Auth, CurrentUser, Public } from '../common/decorators';
import { ErrorCode } from '../common/errors';
import { GoogleAuthGuard } from '../common/guards';
import type { Request, Response } from 'express';
import { User } from '../users/users.entity';
import { AuthService } from './auth.service';
import { AccessTokenDto } from './dto/auth-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { EmailDto } from './dto/email.dto';
import { LoginDto } from './dto/login.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { REFRESH_TOKEN_COOKIE } from './constants/auth.constants';
import { GoogleProfile } from './google.strategy';
import {
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from './utils/refresh-cookie.util';

@ApiTags('Auth')
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Create an account. A 6-digit code is emailed to verify it.',
  })
  @ApiCreatedResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiConflictResponse({ description: 'Email is already registered' })
  register(@Body() dto: RegisterDto): Promise<MessageResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify the email address with the 6-digit code' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({
    description:
      'Invalid or expired code (5 wrong attempts invalidate the code)',
  })
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<MessageResponseDto> {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @Post('resend-verification-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a new verification code',
    description:
      'Always returns the same response. A code is only sent for an existing, unverified account, and at most once every 60 seconds.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  resendVerificationOtp(@Body() dto: EmailDto): Promise<MessageResponseDto> {
    return this.authService.resendVerificationOtp(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Log in and get an access token. The refresh token is set as an httpOnly cookie.',
  })
  @ApiOkResponse({ type: AccessTokenDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiForbiddenResponse({ description: 'The email is not verified yet' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenDto> {
    const { refreshToken, ...body } = await this.authService.login(dto);

    setRefreshTokenCookie(res, refreshToken, this.config);

    return body;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the refresh token cookie and get a new access token',
  })
  @ApiOkResponse({ type: AccessTokenDto })
  @ApiUnauthorizedResponse({
    description:
      'Missing, invalid, expired or reused refresh token (reuse revokes the whole session family)',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenDto> {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;

    if (!token) {
      throw new UnauthorizedException({
        code: ErrorCode.REFRESH_TOKEN_MISSING,
        message: 'Missing refresh token',
      });
    }

    const { refreshToken, ...body } = await this.authService.refresh(token);

    setRefreshTokenCookie(res, refreshToken, this.config);

    return body;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke the current session and clear the refresh token cookie',
  })
  @ApiOkResponse({ description: 'Always succeeds (idempotent)' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<null> {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;

    if (token) {
      await this.authService.logout(token);
      clearRefreshTokenCookie(res, this.config);
    }

    return null;
  }

  // Google

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Start Google sign-in (redirects to Google)' })
  googleLogin(): void {}

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({
    summary:
      'Google OAuth callback, returns the access token and sets the refresh token cookie',
  })
  @ApiOkResponse({ type: AccessTokenDto })
  async googleCallback(
    @Req() req: Request & { user: GoogleProfile },
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenDto> {
    const { refreshToken, ...body } = await this.authService.loginWithGoogle(
      req.user,
    );

    setRefreshTokenCookie(res, refreshToken, this.config);

    return body;
  }

  // Password

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Email a password reset code',
    description:
      'Always returns the same response, whether or not the email exists.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  forgotPassword(@Body() dto: EmailDto): Promise<MessageResponseDto> {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password with the reset code',
    description: 'Revokes all refresh tokens of the user.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid or expired code, or validation failed',
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    const result = await this.authService.resetPassword(dto);

    clearRefreshTokenCookie(res, this.config);

    return result;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Auth()
  @ApiOperation({
    summary: 'Change the password of the logged in user',
    description:
      'Revokes every other session of the user. The current session (identified by the refresh token cookie) stays signed in. Accounts that only use Google sign-in have no password yet and must use "forgot password" to set one.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({
    description: 'Wrong current password, or the new one is the same',
  })
  changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<MessageResponseDto> {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
      string | undefined;

    return this.authService.changePassword(user, dto, refreshToken);
  }
}
