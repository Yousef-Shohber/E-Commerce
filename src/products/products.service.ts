import { UserService } from './../users/users.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dtos/create-product.dto';
import { UpdateProductDto } from './dtos/update-product.dbo';
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

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly userService: UserService,
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
   * @returns Products and the total number of matches
   */
  public async getAll(query: ProductsQueryDto = {}) {
    const { title, minPrice, maxPrice, categoryId } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

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
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total };
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

    return product;
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
   * Delete Product
   * @param id of Product
   * @returns Deleted Message
   */
  public async delete(id: number) {
    const product = await this.getOneBy(id);

    await this.productsRepository.remove(product);
    return { message: 'Product Deleted Successfully' };
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

/** Escape % and _ so they are searched as normal characters */
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
