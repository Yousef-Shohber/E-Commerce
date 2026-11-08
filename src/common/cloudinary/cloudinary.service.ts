import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';
import type { ImageRef } from './image-ref.interface';

export type CloudinaryUploadResult = ImageRef;

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });
  }

  /**
   * Upload one image (from memory) to a Cloudinary folder.
   * Images bigger than 2000x2000 are scaled down before they are stored.
   */
  public async uploadImage(
    file: Express.Multer.File,
    folder = 'profile-images',
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (error, result) => {
          if (error || !result) {
            return reject(this.toHttpError(error));
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  public async deleteImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }

  private toHttpError(error: unknown) {
    const httpCode = (error as { http_code?: number } | undefined)?.http_code;
    this.logger.error(
      `Cloudinary upload failed: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
    );

    // Cloudinary answers 400 when the file is not a real image
    if (httpCode === 400) {
      return new BadRequestException('The file is not a valid image');
    }
    return new ServiceUnavailableException(
      'The image service is not available, please try again later',
    );
  }
}

/**
 * Delete an image when losing it is not a reason to fail the request
 * (clean-up after an error, or after the row that pointed to it is gone).
 */
export async function deleteImageQuietly(
  cloudinaryService: Pick<CloudinaryService, 'deleteImage'>,
  publicId: string,
  logger: Logger,
): Promise<void> {
  try {
    await cloudinaryService.deleteImage(publicId);
  } catch (error) {
    logger.warn(
      `Could not delete image ${publicId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
