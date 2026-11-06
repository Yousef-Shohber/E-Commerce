import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiSecurity } from '@nestjs/swagger';
import type { Express, Response } from 'express';
import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FilesUploadDto } from './dtos/upload-multi.dto';
import { FileUploadDto } from './dtos/upload-single.dto';
import { AuthRoleGuard } from '../users/guards/auth-role.guard';
import { Roles } from '../users/decorators/user-role.decorator';
import { UserType } from '../utils/enums';

const IMAGES_DIR = resolve('.', 'images');

// only the names this module generates: no "/", no "..", no hidden files
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

@Controller('api/uploads')
export class UploadsController {
  @Post()
  @UseGuards(AuthRoleGuard)
  @Roles(UserType.USER, UserType.ADMIN)
  @ApiSecurity('bearer')
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: FileUploadDto, description: 'Upload Single Images' })
  public uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return { message: 'File uploaded successfully', filename: file.filename };
  }

  @Post('multiple')
  @UseGuards(AuthRoleGuard)
  @Roles(UserType.USER, UserType.ADMIN)
  @ApiSecurity('bearer')
  @UseInterceptors(FilesInterceptor('images', 10))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: FilesUploadDto, description: 'Upload Multiple Images' })
  public uploadFiles(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0)
      throw new BadRequestException('No files uploaded');

    return {
      message: 'File uploaded successfully',
      files: files.map((file) => ({
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
      })),
    };
  }

  @Get(':image')
  public getImage(@Param('image') image: string, @Res() res: Response) {
    if (!SAFE_FILE_NAME.test(image))
      throw new NotFoundException('Image Not Found');

    return res.sendFile(
      image,
      { root: IMAGES_DIR, dotfiles: 'deny' },
      (err) => {
        if (err && !res.headersSent) {
          res.status(404).json({ statusCode: 404, message: 'Image Not Found' });
        }
      },
    );
  }

  @Delete(':image')
  @UseGuards(AuthRoleGuard)
  @Roles(UserType.ADMIN)
  @ApiSecurity('bearer')
  public async deleteImage(@Param('image') image: string) {
    if (!SAFE_FILE_NAME.test(image))
      throw new NotFoundException('Image Not Found');

    try {
      await unlink(join(IMAGES_DIR, image));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('Image Not Found');
      }
      throw error;
    }

    return { message: 'Image Deleted Successfully' };
  }
}
