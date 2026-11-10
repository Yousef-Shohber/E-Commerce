import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { getChangedFields } from '../common/utils';
import type { User } from '../users/users.entity';
import { Category } from './categories.entity';
import { CreateCategoryDto } from './dtos/create-category.dto';
import { UpdateCategoryDto } from './dtos/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly dataSource: DataSource,
    private readonly auditLogs: AuditLogsService,
  ) {}

  /**
   * Create New Category
   * @param dto Data From Create Category
   * @returns Category
   */
  public async create(dto: CreateCategoryDto, actor: User, ip?: string) {
    return this.dataSource.transaction(async (manager) => {
      const category = manager.create(Category, {
        name: dto.name.trim(),
        description: dto.description ?? null,
      });
      await manager.save(Category, category);

      await this.auditLogs.record(manager, {
        userId: actor.id,
        action: AuditAction.CATEGORY_CREATED,
        entity: 'Category',
        entityId: category.id,
        metadata: { name: category.name },
        ipAddress: ip,
      });

      return category;
    });
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
  public async update(
    id: number,
    dto: UpdateCategoryDto,
    actor: User,
    ip?: string,
  ) {
    const category = await this.getOneBy(id);

    const changes = getChangedFields<Category>(category, {
      name: dto.name?.trim(),
      description: dto.description,
    });

    if (dto.name) category.name = dto.name.trim();
    category.description = dto.description ?? category.description;

    // a name that is already taken is rejected by the database (unique) and
    // answered by the exceptions filter
    return this.dataSource.transaction(async (manager) => {
      await manager.save(Category, category);

      if (Object.keys(changes).length) {
        await this.auditLogs.record(manager, {
          userId: actor.id,
          action: AuditAction.CATEGORY_UPDATED,
          entity: 'Category',
          entityId: id,
          metadata: { changes },
          ipAddress: ip,
        });
      }

      return category;
    });
  }

  /**
   * Delete Category (its products stay, without a category)
   * @param id of Category
   * @returns Deleted Message
   */
  public async delete(id: number, actor: User, ip?: string) {
    const category = await this.getOneBy(id);

    await this.dataSource.transaction(async (manager) => {
      await manager.remove(Category, category);

      await this.auditLogs.record(manager, {
        userId: actor.id,
        action: AuditAction.CATEGORY_DELETED,
        entity: 'Category',
        entityId: id,
        metadata: { name: category.name },
        ipAddress: ip,
      });
    });

    return { message: 'Category Deleted Successfully' };
  }
}
