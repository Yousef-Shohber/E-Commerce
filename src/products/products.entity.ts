import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToOne,
  Check,
} from 'typeorm';
import { User } from '../users/users.entity';
import { Review } from '../reviews/reviews.entity';
import { Category } from '../categories/categories.entity';
import { ProductImage } from './product-image.entity';

@Entity({ name: 'products' })
@Check('"stock" >= 0')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: '150' })
  title: string;

  @Column()
  description: string;

  @Column({ type: 'float' })
  price: number;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Review, (review) => review.product)
  reviews: Review[];

  @OneToMany(() => ProductImage, (image) => image.product, { eager: true })
  images: ProductImage[];

  @ManyToOne(() => User, (user) => user.product, {
    eager: true,
    onDelete: 'CASCADE',
  })
  user: User;

  @ManyToOne(() => Category, (category) => category.products, {
    eager: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  category: Category | null;

  // Not columns: calculated from the reviews table when products are read
  ratingAverage?: number;
  reviewsCount?: number;
}
