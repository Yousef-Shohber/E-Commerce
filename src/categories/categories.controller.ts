import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser, Public } from '../common/decorators';
import { UserType } from '../common/enums';
import type { User } from '../users/users.entity';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dtos/create-category.dto';
import { UpdateCategoryDto } from './dtos/update-category.dto';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Auth(UserType.ADMIN)
  public addCategory(
    @Body() body: CreateCategoryDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.categoriesService.create(body, user, req.ip);
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
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.categoriesService.update(id, body, user, req.ip);
  }

  @Delete('/:id')
  @Auth(UserType.ADMIN)
  public deleteCategory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.categoriesService.delete(id, user, req.ip);
  }
}
