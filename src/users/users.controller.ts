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
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Auth, CurrentUser, Public } from '../common/decorators';
import { UserType } from '../common/enums';
import type { JwtPayloadType } from '../common/types';
import { imageUploadOptions } from '../common/upload';
import { ForgetPasswordDto } from './dtos/forget-password.dto';
import { ImageUploadedDto } from './dtos/image-upload.dto';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';
import { ResetUserPasswordDto } from './dtos/reset-password.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { User } from './users.entity';
import { UserService } from './users.service';

@ApiTags('Users')
@Controller('/api/users')
export class UsersController {
  constructor(private readonly userService: UserService) {}

  // Authentication

  @Public()
  @Post('auth/register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  public register(@Body() body: RegisterDto) {
    return this.userService.register(body);
  }

  @Public()
  @Post('auth/login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  public login(@Body() body: LoginDto) {
    return this.userService.login(body);
  }

  @Public()
  @Get('verify-email/:id/:verificationToken')
  public verifyEmail(
    @Param('id', ParseIntPipe) id: number,
    @Param('verificationToken') verificationToken: string,
  ) {
    return this.userService.verifyEmail(id, verificationToken);
  }

  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  public forgotPassword(@Body() body: ForgetPasswordDto) {
    return this.userService.sendResetPassword(body.email);
  }

  @Public()
  @Get('reset-password/:id/:resetPasswordToken')
  public getResetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Param('resetPasswordToken') resetPasswordToken: string,
  ) {
    return this.userService.getResetPassword(id, resetPasswordToken);
  }

  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  public resetPassword(@Body() body: ResetUserPasswordDto) {
    return this.userService.resetPassword(body);
  }

  // Google Auth

  @Public()
  @Get('auth/google')
  @UseGuards(PassportAuthGuard('google'))
  public googleAuth() {}

  @Public()
  @Get('auth/google/callback')
  @UseGuards(PassportAuthGuard('google'))
  public async googleCallback(@Req() req: { user: User }) {
    return this.userService.loginWithGoogle(req.user);
  }

  // Current User

  @Get('current-user')
  @SerializeOptions({ groups: ['self'] })
  @Auth()
  public getUser(@CurrentUser() payload: JwtPayloadType) {
    return this.userService.getCurrentUser(payload.id);
  }

  @Put()
  @SerializeOptions({ groups: ['self'] })
  @Auth()
  public updateUser(
    @CurrentUser() payload: JwtPayloadType,
    @Body() body: UpdateUserDto,
  ) {
    return this.userService.updateUser(payload.id, body);
  }

  // Profile Image

  @Post('profile-image')
  @SerializeOptions({ groups: ['self'] })
  @Auth()
  @UseInterceptors(FileInterceptor('profile-image', imageUploadOptions(2)))
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
  @Auth()
  public deleteProfileImage(@CurrentUser() payload: JwtPayloadType) {
    return this.userService.removeProfileImage(payload.id);
  }

  // Admin

  @Get()
  @SerializeOptions({ groups: ['admin'] })
  @Auth(UserType.ADMIN)
  public getAllUser() {
    return this.userService.getAllUser();
  }

  @Delete(':id')
  @Auth()
  public deleteUser(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() payload: JwtPayloadType,
  ) {
    return this.userService.deleteUser(id, payload);
  }
}
