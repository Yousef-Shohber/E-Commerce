import type { JwtPayloadType } from './../utils/types';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  ParseIntPipe,
  UseGuards,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CreateProductDto } from './dtos/create-product.dto';
import { UpdateProductDto } from './dtos/update-product.dbo';
import { ProductsQueryDto } from './dtos/products-query.dto';
import { ProductsService } from './products.service';
import { Roles } from '../users/decorators/user-role.decorator';
import { UserType } from '../utils/enums';
import { AuthRoleGuard } from '../users/guards/auth-role.guard';
import { CurrentUser } from '../users/decorators/current-user.decorator';
import { ApiSecurity } from '@nestjs/swagger';

@Controller('/api/products')
export class ProductsController {
  constructor(private readonly ProductsService: ProductsService) {}

  @Post()
  @UseGuards(AuthRoleGuard)
  @Roles(UserType.ADMIN)
  @ApiSecurity('bearer')
  public addProduct(
    @CurrentUser() payload: JwtPayloadType,
    @Body() product: CreateProductDto,
  ) {
    return this.ProductsService.CreateProduct(payload.id, product);
  }

  @Get()
  public async getProducts(
    @Query() query: ProductsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.ProductsService.getAll(query);
    res.setHeader('X-Total-Count', String(total));
    return items;
  }

  @Get('/:id')
  public getProductById(@Param('id', ParseIntPipe) id: number) {
    return this.ProductsService.getOneBy(id);
  }

  @Put('/:id')
  @UseGuards(AuthRoleGuard)
  @Roles(UserType.ADMIN)
  @ApiSecurity('bearer')
  public updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() product: UpdateProductDto,
  ) {
    return this.ProductsService.update(id, product);
  }

  @Delete('/:id')
  @UseGuards(AuthRoleGuard)
  @Roles(UserType.ADMIN)
  @ApiSecurity('bearer')
  public deleteProduct(@Param('id', ParseIntPipe) id: number) {
    return this.ProductsService.delete(id);
  }
}
