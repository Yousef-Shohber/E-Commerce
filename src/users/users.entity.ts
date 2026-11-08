import { Review } from './../reviews/reviews.entity';
import { Product } from './../products/products.entity';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude, Expose } from 'class-transformer';
import { UserType } from '../common/enums';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 150, nullable: true })
  username: string;

  @Expose({ groups: ['self', 'admin'] })
  @Column({ type: 'varchar', length: 250, unique: true })
  email: string;

  @Exclude()
  @Column({ type: 'varchar', nullable: true, default: null, select: false })
  password: string | null;

  @Exclude()
  @Column({ type: 'varchar', nullable: true, default: null, unique: true })
  googleId: string | null;

  @Column({ type: 'enum', enum: UserType, default: UserType.USER })
  userType: UserType;

  @Column({ default: false })
  isAccountVerified: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'varchar', nullable: true, default: null })
  profileImage: string | null;

  @Exclude()
  @Column({ type: 'varchar', nullable: true, default: null })
  profileImagePublicId: string | null;

  @OneToMany(() => Product, (product) => product.user)
  product: Product[];

  @OneToMany(() => Review, (review) => review.user)
  review: Review[];
}
