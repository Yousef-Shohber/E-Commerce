import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  SerializeOptions,
  UploadedFile,
  UseInterceptors,
  Body,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ApiPaginated, Auth, CurrentUser } from '../common/decorators';
import { UserType } from '../common/enums';
import { imageUploadOptions } from '../common/upload';
import { ImageUploadedDto } from './dtos/image-upload.dto';
import { ListUsersQueryDto } from './dtos/list-users-query.dto';
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
  @ApiPaginated('A page of users')
  public getAllUser(@Query() query: ListUsersQueryDto) {
    return this.usersService.getAllUser(query);
  }

  @Delete(':id')
  @Auth()
  public deleteUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.usersService.deleteUser(id, user, req.ip);
  }
}
