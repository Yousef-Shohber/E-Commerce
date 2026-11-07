import { MigrationInterface, QueryRunner } from "typeorm";

export class Final21794001686296 implements MigrationInterface {
    name = 'Final21794001686296'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "product_images" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "productId" integer NOT NULL, "url" character varying(500) NOT NULL, "publicId" character varying(255) NOT NULL, "position" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_1974264ea7265989af8392f63a1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b367708bf720c8dd62fc683316" ON "product_images"  ("productId") `);
        await queryRunner.query(`CREATE TYPE "public"."coupons_type_enum" AS ENUM('percentage', 'fixed')`);
        await queryRunner.query(`CREATE TABLE "coupons" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" character varying(50) NOT NULL, "type" "public"."coupons_type_enum" NOT NULL, "value" numeric(12,2) NOT NULL, "minOrderAmount" numeric(12,2) NOT NULL DEFAULT '0', "maxDiscountAmount" numeric(12,2), "startsAt" TIMESTAMP WITH TIME ZONE, "expiresAt" TIMESTAMP WITH TIME ZONE, "usageLimit" integer, "usedCount" integer NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_e025109230e82925843f2a14c48" UNIQUE ("code"), CONSTRAINT "CHK_79be80da0ef5b7afe84b0f04b2" CHECK ("usedCount" >= 0), CONSTRAINT "CHK_47432196b11d027da8cde92e88" CHECK ("type" <> 'percentage' OR "value" <= 100), CONSTRAINT "CHK_40af66a8ad9a2b5eafc60127e3" CHECK ("value" > 0), CONSTRAINT "PK_d7ea8864a0150183770f3e9a8cb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "wishlist_items" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "productId" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_d461b3ed3990144aa6d5c45083b" UNIQUE ("userId", "productId"), CONSTRAINT "PK_0bd52924a97cda208ed2a07bd69" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "subtotal" numeric(12,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "discountAmount" numeric(12,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "couponCode" character varying(50)`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "couponId" integer`);
        await queryRunner.query(`CREATE INDEX "IDX_a6b3c434392f5d10ec17104366" ON "reviews"  ("productId") `);
        await queryRunner.query(`ALTER TABLE "product_images" ADD CONSTRAINT "FK_b367708bf720c8dd62fc6833161" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_c26db6c65929ecfeab91073e80c" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "wishlist_items" ADD CONSTRAINT "FK_3167e7490f12ed329a36703d980" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "wishlist_items" ADD CONSTRAINT "FK_485ece8ab9b569d1c560144aa25" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "wishlist_items" DROP CONSTRAINT "FK_485ece8ab9b569d1c560144aa25"`);
        await queryRunner.query(`ALTER TABLE "wishlist_items" DROP CONSTRAINT "FK_3167e7490f12ed329a36703d980"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_c26db6c65929ecfeab91073e80c"`);
        await queryRunner.query(`ALTER TABLE "product_images" DROP CONSTRAINT "FK_b367708bf720c8dd62fc6833161"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a6b3c434392f5d10ec17104366"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "couponId"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "couponCode"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "discountAmount"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "subtotal"`);
        await queryRunner.query(`DROP TABLE "wishlist_items"`);
        await queryRunner.query(`DROP TABLE "coupons"`);
        await queryRunner.query(`DROP TYPE "public"."coupons_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b367708bf720c8dd62fc683316"`);
        await queryRunner.query(`DROP TABLE "product_images"`);
    }

}
