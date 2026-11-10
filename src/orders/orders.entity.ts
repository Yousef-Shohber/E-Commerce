import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Coupon } from '../coupons/coupon.entity';
import { User } from '../users/users.entity';
import { OrderStatus } from '../common/enums';
import { NumericTransformer } from '../common/transformers';
import { OrderItem } from './order-item.entity';

@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Index()
  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: NumericTransformer,
  })
  subtotal: number;

  /** What the coupon took off (0 without a coupon) */
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: NumericTransformer,
  })
  discountAmount: number;

  /** What the customer pays: subtotal - discountAmount */
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: NumericTransformer,
  })
  totalPrice: number;

  /** Copy of the code, it stays even if the coupon is deleted later */
  @Column({ type: 'varchar', length: 50, nullable: true })
  couponCode: string | null;

  @Column({ type: 'int', nullable: true })
  couponId: number | null;

  @Column({ type: 'varchar', length: 500 })
  shippingAddress: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @ManyToOne(() => Coupon, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'couponId' })
  coupon: Coupon | null;

  @OneToMany(() => OrderItem, (item) => item.order, { eager: true })
  items: OrderItem[];
}
