import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dtos/create-category.dto';
import { UpdateCategoryDto } from './dtos/update-category.dto';
import { Roles } from '../users/decorators/user-role.decorator';
import { AuthRoleGuard } from '../users/guards/auth-role.guard';
import { UserType } from '../utils/enums';

@Controller('/api/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(AuthRoleGuard)
  @Roles(UserType.ADMIN)
  @ApiSecurity('bearer')
  public addCategory(@Body() body: CreateCategoryDto) {
    return this.categoriesService.create(body);
  }

  @Get()
  public getCategories() {
    return this.categoriesService.getAll();
  }

  @Get('/:id')
  public getCategoryById(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.getOneBy(id);
  }

  @Put('/:id')
  @UseGuards(AuthRoleGuard)
  @Roles(UserType.ADMIN)
  @ApiSecurity('bearer')
  public updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, body);
  }

  @Delete('/:id')
  @UseGuards(AuthRoleGuard)
  @Roles(UserType.ADMIN)
  @ApiSecurity('bearer')
  public deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.delete(id);
  }
}
