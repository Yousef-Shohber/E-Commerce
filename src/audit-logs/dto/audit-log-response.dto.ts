import { ApiProperty } from '@nestjs/swagger';
import { AuditAction } from '../enums/audit-action.enum';

export class AuditLogResponseDto {
  @ApiProperty() id: number;

  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  userId: string | null;

  @ApiProperty({ enum: AuditAction }) action: AuditAction;

  @ApiProperty() entity: string;

  @ApiProperty({ description: 'Id of the entity (a number or a UUID, as text)' })
  entityId: string;

  @ApiProperty({ nullable: true, type: Object }) metadata: Record<
    string,
    unknown
  > | null;

  @ApiProperty({ nullable: true, type: String }) ipAddress: string | null;

  @ApiProperty() createdAt: Date;
}
