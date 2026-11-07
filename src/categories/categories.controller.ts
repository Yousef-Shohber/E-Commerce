import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, Public } from '../common/decorators';
import { UserType } from '../common/enums';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dtos/create-category.dto';
import { UpdateCategoryDto } from './dtos/update-category.dto';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Auth(UserType.ADMIN)
  public addCategory(@Body() body: CreateCategoryDto) {
    return this.categoriesService.create(body);
  }

  @Public()
  @Get()
  public getCategories() {
    return this.categoriesService.getAll();
  }

  @Public()
  @Get('/:id')
  public getCategoryById(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.getOneBy(id);
  }

  @Put('/:id')
  @Auth(UserType.ADMIN)
  public updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, body);
  }

  @Delete('/:id')
  @Auth(UserType.ADMIN)
  public deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.delete(id);
  }
}
