import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './categories.entity';
import { CreateCategoryDto } from './dtos/create-category.dto';
import { UpdateCategoryDto } from './dtos/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
  ) {}

  /**
   * Create New Category
   * @param dto Data From Create Category
   * @returns Category
   */
  public async create(dto: CreateCategoryDto) {
    const category = this.categoriesRepository.create({
      name: dto.name.trim(),
      description: dto.description ?? null,
    });

    return this.categoriesRepository.save(category);
  }

  /**
   * Get All Categories
   * @returns All Categories
   */
  public getAll() {
    return this.categoriesRepository.find({ order: { name: 'ASC' } });
  }

  /**
   * Get Single Category
   * @param id of Category
   * @returns Category
   */
  public async getOneBy(id: number) {
    const category = await this.categoriesRepository.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    return category;
  }

  /**
   * Update Category
   * @param id of Category
   * @param dto Data From Update Category
   * @returns Updated Category
   */
  public async update(id: number, dto: UpdateCategoryDto) {
    const category = await this.getOneBy(id);

    if (dto.name) category.name = dto.name.trim();
    category.description = dto.description ?? category.description;

    // a name that is already taken is rejected by the database (unique) and
    // answered by the exceptions filter
    return this.categoriesRepository.save(category);
  }

  /**
   * Delete Category (its products stay, without a category)
   * @param id of Category
   * @returns Deleted Message
   */
  public async delete(id: number) {
    const category = await this.getOneBy(id);

    await this.categoriesRepository.remove(category);
    return { message: 'Category Deleted Successfully' };
  }
}
