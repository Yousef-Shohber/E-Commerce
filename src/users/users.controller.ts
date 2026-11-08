import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  SerializeOptions,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../common/decorators';
import { UserType } from '../common/enums';
import { imageUploadOptions } from '../common/upload';
import { ImageUploadedDto } from './dtos/image-upload.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { User } from './users.entity';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Current User

  @Get('current-user')
  @SerializeOptions({ groups: ['self'] })
  @Auth()
  public getUser(@CurrentUser() user: User) {
    return user;
  }

  @Put()
  @SerializeOptions({ groups: ['self'] })
  @Auth()
  public updateUser(@CurrentUser() user: User, @Body() body: UpdateUserDto) {
    return this.usersService.updateUser(user, body);
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
    @CurrentUser() user: User,
  ) {
    if (!file) {
      throw new BadRequestException('No File Found');
    }

    return this.usersService.uploadProfileImage(user, file);
  }

  @Delete('profile-image')
  @SerializeOptions({ groups: ['self'] })
  @Auth()
  public deleteProfileImage(@CurrentUser() user: User) {
    return this.usersService.removeProfileImage(user);
  }

  // Admin

  @Get()
  @SerializeOptions({ groups: ['admin'] })
  @Auth(UserType.ADMIN)
  public getAllUser() {
    return this.usersService.getAllUser();
  }

  @Delete(':id')
  @Auth()
  public deleteUser(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.usersService.deleteUser(id, user);
  }
}
