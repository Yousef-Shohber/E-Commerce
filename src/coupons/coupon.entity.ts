import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CouponType } from '../common/enums';
import { NumericTransformer } from '../common/transformers';

@Entity({ name: 'coupons' })
@Check('"value" > 0')
@Check(`"type" <> 'percentage' OR "value" <= 100`)
@Check('"usedCount" >= 0')
export class Coupon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'enum', enum: CouponType })
  type: CouponType;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: NumericTransformer,
  })
  value: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: NumericTransformer,
  })
  minOrderAmount: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: NumericTransformer,
  })
  maxDiscountAmount: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'int', nullable: true })
  usageLimit: number | null;

  @Column({ type: 'int', default: 0 })
  usedCount: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
