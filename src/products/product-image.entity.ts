import { Exclude } from 'class-transformer';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedEntity } from '../common/entities';
import { Product } from './products.entity';

@Entity({ name: 'product_images' })
export class ProductImage extends TimestampedEntity {
  @Index()
  @Column()
  productId: number;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Exclude()
  @Column({ type: 'varchar', length: 255 })
  publicId: string;

  @Column({ type: 'int', default: 0 })
  position: number;

  @ManyToOne(() => Product, (product) => product.images, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;
}
