import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from '../src/users/users.entity';
import { Product } from '../src/products/products.entity';
import { Review } from '../src/reviews/reviews.entity';
import { Category } from '../src/categories/categories.entity';
import { CartItem } from '../src/cart/cart-item.entity';
import { Order } from '../src/orders/orders.entity';
import { ProductImage } from '../src/products/product-image.entity';
import { Coupon } from '../src/coupons/coupon.entity';
import { WishlistItem } from '../src/wishlist/wishlist-item.entity';
import { OrderItem } from '../src/orders/order-item.entity';
import { config } from 'dotenv';

// dotenv config
config({ path: '.env' });

// data source options
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User,
    Product,
    ProductImage,
    Review,
    Category,
    CartItem,
    Coupon,
    Order,
    OrderItem,
    WishlistItem,
  ],
  migrations: ['dist/db/migrations/*.js'],
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
