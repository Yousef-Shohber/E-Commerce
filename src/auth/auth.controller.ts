import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { GoogleAuthGuard } from '../common/guards';
import type { Request } from 'express';
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
import { GoogleProfile } from './google.strategy';

@ApiTags('Auth')
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  @ApiOperation({ summary: 'Log in and get an access token' })
  @ApiOkResponse({ type: AccessTokenDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiForbiddenResponse({ description: 'The email is not verified yet' })
  login(@Body() dto: LoginDto): Promise<AccessTokenDto> {
    return this.authService.login(dto);
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
  @ApiOperation({ summary: 'Google OAuth callback, returns the access token' })
  @ApiOkResponse({ type: AccessTokenDto })
  googleCallback(
    @Req() req: Request & { user: GoogleProfile },
  ): Promise<AccessTokenDto> {
    return this.authService.loginWithGoogle(req.user);
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
  @ApiOperation({ summary: 'Set a new password with the reset code' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid or expired code, or validation failed',
  })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Auth()
  @ApiOperation({ summary: 'Change the password of the logged in user' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({
    description: 'Wrong current password, or the new one is the same',
  })
  changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    return this.authService.changePassword(user, dto);
  }
}
