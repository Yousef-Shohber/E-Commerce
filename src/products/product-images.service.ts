import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  CloudinaryService,
  deleteImageQuietly,
  ImageRef,
} from '../common/cloudinary';
import { ErrorCode } from '../common/errors';
import { rowsOf } from '../common/utils';
import { Product } from './products.entity';

export const MAX_IMAGES_PER_PRODUCT = 8;
const CLOUDINARY_FOLDER = 'products';

@Injectable()
export class ProductImagesService {
  private readonly logger = new Logger(ProductImagesService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly dataSource: DataSource,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Add images to a product (they are stored in its `images` column).
   *  1. cheap checks first (the product exists, there is room for the files),
   *  2. upload to Cloudinary (slow, so it is done outside the transaction),
   *  3. in one transaction: lock the product row, check the limit again (two
   *     admins uploading at the same time) and save the new list.
   * If anything fails after step 2, the uploaded files are deleted again.
   */
  public async add(productId: number, files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.IMAGE_REQUIRED,
        message: 'No files uploaded',
      });
    }

    const current = await this.imagesOf(
      this.productsRepository.manager,
      productId,
    );
    this.assertRoom(current.length, files.length);

    const results = await Promise.allSettled(
      files.map((file) =>
        this.cloudinaryService.uploadImage(file, CLOUDINARY_FOLDER),
      ),
    );

    const uploaded: ImageRef[] = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const failed = results.find((result) => result.status === 'rejected');

    if (failed) {
      await this.discard(uploaded.map((image) => image.publicId));
      throw failed.reason;
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        const images = await this.lockImages(manager, productId);
        this.assertRoom(images.length, uploaded.length);

        await this.saveImages(manager, productId, [...images, ...uploaded]);
      });
    } catch (error) {
      await this.discard(uploaded.map((image) => image.publicId));
      throw error;
    }

    return this.list(productId);
  }

  /**
   * Remove one image of a product (its entry in `images` + the Cloudinary file)
   */
  public async remove(productId: number, publicId: string) {
    await this.dataSource.transaction(async (manager) => {
      const images = await this.lockImages(manager, productId);
      const remaining = images.filter((image) => image.publicId !== publicId);

      if (remaining.length === images.length) {
        throw new NotFoundException({
          code: ErrorCode.IMAGE_NOT_FOUND,
          message: `Image not found for product ${productId}`,
        });
      }

      await this.saveImages(manager, productId, remaining);
    });

    await deleteImageQuietly(this.cloudinaryService, publicId, this.logger);

    return this.list(productId);
  }

  /**
   * Delete files from Cloudinary after their product is gone
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
    return this.imagesOf(this.productsRepository.manager, productId);
  }

  // Helpers

  private async imagesOf(
    manager: EntityManager,
    productId: number,
  ): Promise<ImageRef[]> {
    const rows = rowsOf<{ images: ImageRef[] }>(
      await manager.query(`SELECT "images" FROM products WHERE "id" = $1`, [
        productId,
      ]),
    );

    return this.imagesOrNotFound(rows, productId);
  }

  /** The images of a product, with its row locked until the transaction ends */
  private async lockImages(
    manager: EntityManager,
    productId: number,
  ): Promise<ImageRef[]> {
    const rows = rowsOf<{ images: ImageRef[] }>(
      await manager.query(
        `SELECT "images" FROM products WHERE "id" = $1 FOR UPDATE`,
        [productId],
      ),
    );

    return this.imagesOrNotFound(rows, productId);
  }

  private imagesOrNotFound(
    rows: { images: ImageRef[] }[],
    productId: number,
  ): ImageRef[] {
    if (rows.length === 0) {
      throw new NotFoundException({
        code: ErrorCode.PRODUCT_NOT_FOUND,
        message: `Product with id ${productId} not found`,
      });
    }

    return rows[0].images;
  }

  private async saveImages(
    manager: EntityManager,
    productId: number,
    images: ImageRef[],
  ) {
    await manager.query(
      `UPDATE products SET "images" = $2::jsonb, "updatedAt" = now() WHERE "id" = $1`,
      [productId, JSON.stringify(images)],
    );
  }

  private assertRoom(existing: number, adding: number) {
    if (existing + adding > MAX_IMAGES_PER_PRODUCT) {
      throw new BadRequestException({
        code: ErrorCode.IMAGE_LIMIT_EXCEEDED,
        message: `A product can have at most ${MAX_IMAGES_PER_PRODUCT} images (it has ${existing})`,
      });
    }
  }
}
