import { JwtModule } from '@nestjs/jwt';
import { BadRequestException, Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomBytes } from 'node:crypto';
import { UsersModule } from '../users/users.module';

// The extension comes from the mimetype, never from the user's file name
// (a file named "x.html" must never be stored and served as html).
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

@Module({
  controllers: [UploadsController],
  imports: [
    UsersModule,
    JwtModule,
    MulterModule.register({
      storage: diskStorage({
        destination: './images',
        filename: (_req, file, cb) => {
          const extension = ALLOWED_IMAGE_TYPES[file.mimetype];
          cb(
            null,
            `${Date.now()}-${randomBytes(8).toString('hex')}${extension}`,
          );
        },
      }),

      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
          return cb(
            new BadRequestException(
              'Only png, jpeg, gif and webp images are allowed',
            ),
            false,
          );
        }
        cb(null, true);
      },

      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  ],
})
export class UploadsModule {}
