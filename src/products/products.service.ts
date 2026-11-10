import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dtos/create-product.dto';
import { UpdateProductDto } from './dtos/update-product.dto';
import { ProductsQueryDto } from './dtos/products-query.dto';
import {
  FindOperator,
  ILike,
  Between,
  MoreThanOrEqual,
  LessThanOrEqual,
  DataSource,
  Repository,
} from 'typeorm';
import { Product } from './products.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { CacheInvalidationService } from '../common/cache';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from '../categories/categories.entity';
import { Paginated, resolveSort, toSkip } from '../common/pagination';
import { escapeLike, getChangedFields } from '../common/utils';
import { ProductImagesService } from './product-images.service';
import { User } from '../users/users.entity';
import { ErrorCode } from '../common/errors';

const PRODUCT_SORT_FIELDS = ['createdAt', 'price', 'title'] as const;

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly productImagesService: ProductImagesService,
    private readonly dataSource: DataSource,
    private readonly auditLogs: AuditLogsService,
    private readonly cache: CacheInvalidationService,
  ) {}

  /**
   * Create New Product
   * @param user the Login User (Admin)
   * @param CreateProductDto for Product
   * @param ip IP address of the request, for the audit log
   * @returns Product
   */
  public async CreateProduct(user: User, dto: CreateProductDto, ip?: string) {
    const { categoryId, ...data } = dto;
    const category = await this.findCategory(categoryId);

    const saved = await this.dataSource.transaction(async (manager) => {
      const product = manager.create(Product, {
        ...data,
        title: dto.title.toLowerCase(),
        user,
        category,
      });
      await manager.save(Product, product);

      await this.auditLogs.record(manager, {
        userId: user.id,
        action: AuditAction.PRODUCT_CREATED,
        entity: 'Product',
        entityId: product.id,
        metadata: {
          title: product.title,
          price: product.price,
          stock: product.stock,
          categoryId: category?.id ?? null,
        },
        ipAddress: ip,
      });

      return product;
    });

    await this.cache.invalidateDashboard();

    return saved;
  }

  /**
   * Get All Product (filter, sort and paginate)
   * @returns A page of products (with images and rating) and the total
   */
  public async getAll(query: ProductsQueryDto) {
    const { title, minPrice, maxPrice, categoryId } = query;
    const { sortBy, sortOrder } = resolveSort(
      query,
      PRODUCT_SORT_FIELDS,
      'createdAt',
    );

    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice > maxPrice
    ) {
      throw new BadRequestException(
        'minPrice must not be greater than maxPrice',
      );
    }

    let price: FindOperator<number> | undefined;
    if (minPrice !== undefined && maxPrice !== undefined) {
      price = Between(minPrice, maxPrice);
    } else if (minPrice !== undefined) {
      price = MoreThanOrEqual(minPrice);
    } else if (maxPrice !== undefined) {
      price = LessThanOrEqual(maxPrice);
    }

    const where = {
      ...(title ? { title: ILike(`%${escapeLike(title)}%`) } : {}),
      ...(price ? { price } : {}),
      ...(categoryId ? { category: { id: categoryId } } : {}),
    };

    const [items, total] = await this.productsRepository.findAndCount({
      where,
      order: { [sortBy]: sortOrder, id: 'ASC' },
      skip: toSkip(query),
      take: query.limit,
    });

    return Paginated.of(await this.decorate(items), total, query);
  }

  /**
   * Get Single Product
   * @param id of Product
   * @returns Product
   */
  public async getOneBy(id: number) {
    const product = await this.productsRepository.findOne({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException({
        code: ErrorCode.PRODUCT_NOT_FOUND,
        message: `Product with id ${id} not found`,
      });
    }

    const [decorated] = await this.decorate([product]);
    return decorated;
  }

  /**
   * Update Product
   * Only the fields that really change are audited (with the `before` and
   * `after` of each); a request that changes nothing writes no audit entry.
   * @param UpdateProductDto for Product
   * @param id of Product
   * @param actor the Logged In User (Admin)
   * @param ip IP address of the request, for the audit log
   */
  public async update(
    id: number,
    dto: UpdateProductDto,
    actor: User,
    ip?: string,
  ) {
    const product = await this.getOneBy(id);

    const changes = getChangedFields<Product>(product, {
      title: dto.title ? dto.title.toLowerCase() : undefined,
      description: dto.description,
      price: dto.price,
      stock: dto.stock,
    });

    if (dto.title) product.title = dto.title.toLowerCase();
    product.description = dto.description ?? product.description;
    product.price = dto.price ?? product.price;
    product.stock = dto.stock ?? product.stock;

    if (dto.categoryId !== undefined) {
      const category = await this.findCategory(dto.categoryId);
      const before = product.category?.id ?? null;
      const after = category?.id ?? null;
      if (before !== after) changes.categoryId = { before, after };
      product.category = category;
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.save(Product, product);

      if (Object.keys(changes).length) {
        await this.auditLogs.record(manager, {
          userId: actor.id,
          action: AuditAction.PRODUCT_UPDATED,
          entity: 'Product',
          entityId: product.id,
          metadata: { changes },
          ipAddress: ip,
        });
      }

      return product;
    });

    await this.cache.invalidateDashboard();

    return saved;
  }

  /**
   * Delete Product (its images are removed from Cloudinary too)
   * @param id of Product
   * @param actor the Logged In User (Admin)
   * @param ip IP address of the request, for the audit log
   * @returns Deleted Message
   */
  public async delete(id: number, actor: User, ip?: string) {
    const product = await this.getOneBy(id);
    const publicIds = product.images.map((image) => image.publicId);

    await this.dataSource.transaction(async (manager) => {
      await manager.remove(Product, product);

      await this.auditLogs.record(manager, {
        userId: actor.id,
        action: AuditAction.PRODUCT_DELETED,
        entity: 'Product',
        entityId: id,
        metadata: { title: product.title },
        ipAddress: ip,
      });
    });

    await this.productImagesService.discard(publicIds);
    await this.cache.invalidateDashboard();

    return { message: 'Product Deleted Successfully' };
  }

  /**
   * Add what is not stored in the products table:
   *  - the average rating and the number of reviews, with ONE grouped query
   *    for the whole page (not one query per product).
   */
  private async decorate(products: Product[]): Promise<Product[]> {
    if (products.length === 0) return products;

    const rows: {
      productId: number;
      reviewsCount: number;
      ratingAverage: number;
    }[] = await this.productsRepository.query(
      `SELECT "productId",
              COUNT(*)::int AS "reviewsCount",
              ROUND(AVG("rating")::numeric, 2)::float AS "ratingAverage"
          FROM reviews
        WHERE "productId" = ANY($1)
        GROUP BY "productId"`,
      [products.map((product) => product.id)],
    );
    const byProduct = new Map(rows.map((row) => [row.productId, row]));

    for (const product of products) {
      const stats = byProduct.get(product.id);
      product.ratingAverage = stats?.ratingAverage ?? 0;
      product.reviewsCount = stats?.reviewsCount ?? 0;
    }

    return products;
  }

  private async findCategory(
    categoryId?: number | null,
  ): Promise<Category | null> {
    if (!categoryId) return null;

    const category = await this.productsRepository.manager.findOne(Category, {
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException(`Category with id ${categoryId} not found`);
    }

    return category;
  }
}
