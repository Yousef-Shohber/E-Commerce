import { ApiProperty } from '@nestjs/swagger';

/** Only used to describe the multipart body in Swagger */
export class UploadProductImagesDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'png, jpeg, webp or gif - up to 5 files, 5MB each',
  })
  images: Express.Multer.File[];
}
