import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiPaginated, Auth, CurrentUser } from '../common/decorators';
import { UserType } from '../common/enums';
import { PaginationQueryDto } from '../common/pagination';
import type { User } from '../users/users.entity';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dtos/create-coupon.dto';
import { UpdateCouponDto } from './dtos/update-coupon.dto';
import { ValidateCouponDto } from './dtos/validate-coupon.dto';

@ApiTags('Coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  /** Customer: what would my cart cost with this code? */
  @Post('validate')
  @Auth()
  @HttpCode(HttpStatus.OK)
  public validate(@CurrentUser() user: User, @Body() body: ValidateCouponDto) {
    return this.couponsService.preview(user.id, body.code);
  }

  // Admin

  @Post()
  @Auth(UserType.ADMIN)
  public create(@Body() body: CreateCouponDto) {
    return this.couponsService.create(body);
  }

  @Get()
  @Auth(UserType.ADMIN)
  @ApiPaginated()
  public getAll(@Query() query: PaginationQueryDto) {
    return this.couponsService.getAll(query);
  }

  @Get('/:id')
  @Auth(UserType.ADMIN)
  public getOne(@Param('id', ParseIntPipe) id: number) {
    return this.couponsService.getOneBy(id);
  }

  @Patch('/:id')
  @Auth(UserType.ADMIN)
  public update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCouponDto,
  ) {
    return this.couponsService.update(id, body);
  }

  @Delete('/:id')
  @Auth(UserType.ADMIN)
  public remove(@Param('id', ParseIntPipe) id: number) {
    return this.couponsService.delete(id);
  }
}
