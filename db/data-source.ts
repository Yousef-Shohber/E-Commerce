import { DataSourceOptions } from 'typeorm';
import { User } from '../src/users/users.entity';
import { Product } from '../src/products/products.entity';
import { Review } from '../src/reviews/reviews.entity';
import { config } from 'dotenv';

// dotenv config
config({ path: '.env' });

// data source options
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Product, Review],
  migrations: ['dist/db/migrations/*.js'],
};
