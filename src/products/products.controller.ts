import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ApiPaginated, Auth, CurrentUser, Public } from '../common/decorators';
import { UserType } from '../common/enums';
import type { User } from '../users/users.entity';
import { imageUploadOptions } from '../common/upload';
import { CreateProductDto } from './dtos/create-product.dto';
import { DeleteProductImageDto } from './dtos/delete-product-image.dto';
import { ProductsQueryDto } from './dtos/products-query.dto';
import { UpdateProductDto } from './dtos/update-product.dto';
import { UploadProductImagesDto } from './dtos/upload-product-images.dto';
import { ProductImagesService } from './product-images.service';
import { ProductsService } from './products.service';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productImagesService: ProductImagesService,
  ) {}

  @Post()
  @Auth(UserType.ADMIN)
  public addProduct(
    @CurrentUser() user: User,
    @Body() product: CreateProductDto,
    @Req() req: Request,
  ) {
    return this.productsService.CreateProduct(user, product, req.ip);
  }

  @Public()
  @Get()
  @ApiPaginated('A page of products')
  public getProducts(@Query() query: ProductsQueryDto) {
    return this.productsService.getAll(query);
  }

  @Public()
  @Get('/:id')
  public getProductById(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.getOneBy(id);
  }

  @Put('/:id')
  @Auth(UserType.ADMIN)
  public updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() product: UpdateProductDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.productsService.update(id, product, user, req.ip);
  }

  @Delete('/:id')
  @Auth(UserType.ADMIN)
  public deleteProduct(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.productsService.delete(id, user, req.ip);
  }

  // Images

  @Post('/:id/images')
  @Auth(UserType.ADMIN)
  @UseInterceptors(FilesInterceptor('images', 5, imageUploadOptions(5)))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadProductImagesDto })
  public addImages(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.productImagesService.add(id, files);
  }

  @Delete('/:id/images')
  @Auth(UserType.ADMIN)
  public deleteImage(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: DeleteProductImageDto,
  ) {
    return this.productImagesService.remove(id, body.publicId);
  }
}
