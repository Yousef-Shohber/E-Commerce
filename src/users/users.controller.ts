import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  SerializeOptions,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { JwtPayloadType } from '../utils/types';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';
import { AuthGuard } from './guards/auth.guard';
import { UserService } from './users.service';
import { Roles } from './decorators/user-role.decorator';
import { UserType } from '../utils/enums';
import { AuthRoleGuard } from './guards/auth-role.guard';
import { UpdateUserDto } from './dtos/update-user.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { ForgetPasswordDto } from './dtos/forget-password.dto';
import { ResetUserPasswordDto } from './dtos/reset-password.dto';
import { ApiBody, ApiConsumes, ApiSecurity } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ImageUploadedDto } from './dtos/image-upload.dto';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';

@Controller('/api/users')
export class UsersController {
  constructor(private readonly userService: UserService) {}

  // Authentication

  @Post('auth/register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  public register(@Body() body: RegisterDto) {
    return this.userService.register(body);
  }

  @Post('auth/login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  public login(@Body() body: LoginDto) {
    return this.userService.login(body);
  }

  @Get('verify-email/:id/:verificationToken')
  public verifyEmail(
    @Param('id', ParseIntPipe) id: number,
    @Param('verificationToken') verificationToken: string,
  ) {
    return this.userService.verifyEmail(id, verificationToken);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  public forgotPassword(@Body() body: ForgetPasswordDto) {
    return this.userService.sendResetPassword(body.email);
  }

  @Get('reset-password/:id/:resetPasswordToken')
  public getResetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Param('resetPasswordToken') resetPasswordToken: string,
  ) {
    return this.userService.getResetPassword(id, resetPasswordToken);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  public resetPassword(@Body() body: ResetUserPasswordDto) {
    return this.userService.resetPassword(body);
  }

  // Google Auth

  @Get('auth/google')
  @UseGuards(PassportAuthGuard('google'))
  public googleAuth() {}

  @Get('auth/google/callback')
  @UseGuards(PassportAuthGuard('google'))
  public async googleCallback(@Req() req: any) {
    return this.userService.loginWithGoogle(req.user);
  }

  // Current User

  @Get('current-user')
  @SerializeOptions({ groups: ['self'] })
  @UseGuards(AuthGuard)
  @ApiSecurity('bearer')
  public getUser(@CurrentUser() payload: JwtPayloadType) {
    return this.userService.getCurrentUser(payload.id);
  }

  @Put()
  @SerializeOptions({ groups: ['self'] })
  @Roles(UserType.ADMIN, UserType.USER)
  @UseGuards(AuthRoleGuard)
  @ApiSecurity('bearer')
  public updateUser(
    @CurrentUser() payload: JwtPayloadType,
    @Body() body: UpdateUserDto,
  ) {
    return this.userService.updateUser(payload.id, body);
  }

  // Profile Image

  @Post('profile-image')
  @SerializeOptions({ groups: ['self'] })
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('profile-image'))
  @ApiSecurity('bearer')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ImageUploadedDto, description: 'profile image' })
  public uploadProfileImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() payload: JwtPayloadType,
  ) {
    if (!file) {
      throw new BadRequestException('No File Found');
    }

    return this.userService.uploadProfileImage(payload.id, file);
  }

  @Delete('profile-image')
  @SerializeOptions({ groups: ['self'] })
  @UseGuards(AuthGuard)
  @ApiSecurity('bearer')
  public deleteProfileImage(@CurrentUser() payload: JwtPayloadType) {
    return this.userService.removeProfileImage(payload.id);
  }

  // Admin

  @Get()
  @SerializeOptions({ groups: ['admin'] })
  @Roles(UserType.ADMIN)
  @UseGuards(AuthRoleGuard)
  @ApiSecurity('bearer')
  public getAllUser() {
    return this.userService.getAllUser();
  }

  @Delete(':id')
  @Roles(UserType.ADMIN, UserType.USER)
  @UseGuards(AuthRoleGuard)
  @ApiSecurity('bearer')
  public deleteUser(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() payload: JwtPayloadType,
  ) {
    return this.userService.deleteUser(id, payload);
  }
}
