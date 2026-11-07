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
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ApiPaginated, Auth, CurrentUser, Public } from '../common/decorators';
import { UserType } from '../common/enums';
import type { JwtPayloadType } from '../common/types';
import { imageUploadOptions } from '../common/upload';
import { CreateProductDto } from './dtos/create-product.dto';
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
    @CurrentUser() payload: JwtPayloadType,
    @Body() product: CreateProductDto,
  ) {
    return this.productsService.CreateProduct(payload.id, product);
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
  ) {
    return this.productsService.update(id, product);
  }

  @Delete('/:id')
  @Auth(UserType.ADMIN)
  public deleteProduct(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.delete(id);
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

  @Delete('/:id/images/:imageId')
  @Auth(UserType.ADMIN)
  public deleteImage(
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId', ParseIntPipe) imageId: number,
  ) {
    return this.productImagesService.remove(id, imageId);
  }
}
