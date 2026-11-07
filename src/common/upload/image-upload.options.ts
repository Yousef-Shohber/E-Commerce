import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

export function imageUploadOptions(maxSizeMb = 5): MulterOptions {
  return {
    storage: memoryStorage(),
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!IMAGE_MIME_TYPES.includes(file.mimetype)) {
        return cb(
          new BadRequestException('Only png, jpeg, webp and gif are allowed'),
          false,
        );
      }
      cb(null, true);
    },
  };
}
