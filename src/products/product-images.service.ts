import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CloudinaryService, deleteImageQuietly } from '../common/cloudinary';
import { rowsOf } from '../common/utils';
import { ProductImage } from './product-image.entity';

export const MAX_IMAGES_PER_PRODUCT = 8;
const CLOUDINARY_FOLDER = 'products';

@Injectable()
export class ProductImagesService {
  private readonly logger = new Logger(ProductImagesService.name);

  constructor(
    @InjectRepository(ProductImage)
    private readonly imagesRepository: Repository<ProductImage>,
    private readonly dataSource: DataSource,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Add images to a product.
   *  1. cheap checks first (the product exists, there is room for the files),
   *  2. upload to Cloudinary (slow, so it is done outside the transaction),
   *  3. in one transaction: lock the product row, check the limit again (two
   *     admins uploading at the same time) and save the rows.
   * If anything fails after step 2, the uploaded files are deleted again.
   */
  public async add(productId: number, files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const existing = await this.countFor(productId);
    this.assertRoom(existing, files.length);

    const results = await Promise.allSettled(
      files.map((file) =>
        this.cloudinaryService.uploadImage(file, CLOUDINARY_FOLDER),
      ),
    );

    const uploaded = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const failed = results.find((result) => result.status === 'rejected');

    if (failed) {
      await this.discard(uploaded.map((image) => image.publicId));
      throw failed.reason;
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        const locked = rowsOf<{ id: number }>(
          await manager.query(
            `SELECT "id" FROM products WHERE "id" = $1 FOR UPDATE`,
            [productId],
          ),
        );
        if (locked.length === 0) {
          throw new NotFoundException(`Product with id ${productId} not found`);
        }

        const [{ count, next }] = rowsOf<{ count: number; next: number }>(
          await manager.query(
            `SELECT COUNT(*)::int AS "count", COALESCE(MAX("position") + 1, 0)::int AS "next"
                FROM product_images WHERE "productId" = $1`,
            [productId],
          ),
        );
        this.assertRoom(count, uploaded.length);

        await manager.save(
          uploaded.map((image, index) =>
            manager.create(ProductImage, {
              productId,
              url: image.url,
              publicId: image.publicId,
              position: next + index,
            }),
          ),
        );
      });
    } catch (error) {
      await this.discard(uploaded.map((image) => image.publicId));
      throw error;
    }

    return this.list(productId);
  }

  /**
   * Remove one image of a product (database row + Cloudinary file)
   */
  public async remove(productId: number, imageId: number) {
    const image = await this.imagesRepository.findOne({
      where: { id: imageId, productId },
    });

    if (!image) {
      throw new NotFoundException(
        `Image with id ${imageId} not found for product ${productId}`,
      );
    }

    await this.imagesRepository.remove(image);
    await deleteImageQuietly(
      this.cloudinaryService,
      image.publicId,
      this.logger,
    );

    return this.list(productId);
  }

  /**
   * Delete files from Cloudinary after their rows are gone
   * (for example when the whole product is deleted). Never throws.
   */
  public async discard(publicIds: string[]) {
    await Promise.all(
      publicIds.map((publicId) =>
        deleteImageQuietly(this.cloudinaryService, publicId, this.logger),
      ),
    );
  }

  public list(productId: number) {
    return this.imagesRepository.find({
      where: { productId },
      order: { position: 'ASC', id: 'ASC' },
    });
  }

  private countFor(productId: number) {
    return this.imagesRepository.count({ where: { productId } });
  }

  private assertRoom(existing: number, adding: number) {
    if (existing + adding > MAX_IMAGES_PER_PRODUCT) {
      throw new BadRequestException(
        `A product can have at most ${MAX_IMAGES_PER_PRODUCT} images (it has ${existing})`,
      );
    }
  }
}
