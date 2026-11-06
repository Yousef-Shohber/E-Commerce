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
import { User } from '../users/users.entity';
import { OrderStatus } from '../utils/enums';
import { NumericTransformer } from '../utils/numeric.transformer';
import { OrderItem } from './order-item.entity';

@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  // Kept (as NULL) if the user is deleted, so order history stays consistent
  @Index()
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Index()
  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: NumericTransformer,
  })
  totalPrice: number;

  @Column({ type: 'varchar', length: 500 })
  shippingAddress: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @OneToMany(() => OrderItem, (item) => item.order, { eager: true })
  items: OrderItem[];
}
