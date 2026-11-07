import { UserService } from './../users/users.service';
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
  Repository,
} from 'typeorm';
import { Product } from './products.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from '../categories/categories.entity';
import { Paginated, resolvePagination } from '../common/pagination';
import { escapeLike } from '../common/utils';
import { ProductImagesService } from './product-images.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly userService: UserService,
    private readonly productImagesService: ProductImagesService,
  ) {}

  /**
   * Create New Product
   * @param userId of Login User (Admin)
   * @param CreateProductDto for Product
   * @returns Product
   */
  public async CreateProduct(userId: number, dto: CreateProductDto) {
    const user = await this.userService.getCurrentUser(userId);
    const { categoryId, ...data } = dto;

    const newProduct = this.productsRepository.create({
      ...data,
      title: dto.title.toLowerCase(),
      user,
      category: await this.findCategory(categoryId),
    });
    return await this.productsRepository.save(newProduct);
  }

  /**
   * Get All Product (filter, sort and paginate)
   * @returns A page of products (with images and rating) and the total
   */
  public async getAll(query: ProductsQueryDto = {}) {
    const { title, minPrice, maxPrice, categoryId } = query;
    const { skip, take } = resolvePagination(query);

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
      order: {
        [query.sortBy ?? 'createdAt']: query.order ?? 'DESC',
        id: 'ASC',
      },
      skip,
      take,
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
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    const [decorated] = await this.decorate([product]);
    return decorated;
  }

  /**
   * Update Product
   * @param UpdateProductDto for Product
   * @param id of Product
   */
  public async update(id: number, dto: UpdateProductDto) {
    const product = await this.getOneBy(id);

    if (dto.title) product.title = dto.title.toLowerCase();
    product.description = dto.description ?? product.description;
    product.price = dto.price ?? product.price;
    product.stock = dto.stock ?? product.stock;

    if (dto.categoryId !== undefined) {
      product.category = await this.findCategory(dto.categoryId);
    }

    return await this.productsRepository.save(product);
  }

  /**
   * Delete Product (its images are removed from Cloudinary too)
   * @param id of Product
   * @returns Deleted Message
   */
  public async delete(id: number) {
    const product = await this.getOneBy(id);
    const publicIds = (product.images ?? []).map((image) => image.publicId);

    await this.productsRepository.remove(product);
    await this.productImagesService.discard(publicIds);

    return { message: 'Product Deleted Successfully' };
  }

  /**
   * Add what is not stored in the products table:
   *  - the images in their order (main image first),
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
      product.images = [...(product.images ?? [])].sort(
        (a, b) => a.position - b.position || a.id - b.id,
      );
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
