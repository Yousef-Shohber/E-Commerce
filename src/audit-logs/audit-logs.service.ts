import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { Paginated, toSkip } from '../common/pagination';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { AuditLog } from './entities/audit-log.entity';
import { AuditAction } from './enums/audit-action.enum';

export interface RecordAuditLogData {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId: number | string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  /**
   * Record an audit log for a business operation.
   * Called inside the transaction of the operation, so the log is saved
   * together with the change (and never for a change that rolled back).
   * @param manager Transaction manager used to persist the audit log.
   * @param data Who did what to which entity, with optional metadata and IP.
   */
  async record(
    manager: EntityManager,
    data: RecordAuditLogData,
  ): Promise<void> {
    await manager.insert(AuditLog, {
      userId: data.userId,
      action: data.action,
      entity: data.entity,
      entityId: String(data.entityId),
      metadata: data.metadata ?? null,
      ipAddress: data.ipAddress ?? null,
    });
  }

  /**
   * Record several audit logs in one insert.
   * @param manager Transaction manager used to persist the audit logs.
   * @param items One entry per log. An empty list is a no-op.
   */
  async recordMany(
    manager: EntityManager,
    items: RecordAuditLogData[],
  ): Promise<void> {
    if (!items.length) return;

    await manager.insert(
      AuditLog,
      items.map((data) => ({
        userId: data.userId,
        action: data.action,
        entity: data.entity,
        entityId: String(data.entityId),
        metadata: data.metadata ?? null,
        ipAddress: data.ipAddress ?? null,
      })),
    );
  }

  /**
   * Retrieve audit logs with optional filtering and pagination (newest first).
   * @param query Pagination and filtering options.
   * @returns Paginated audit logs matching the provided filters.
   */
  async findAll(query: ListAuditLogsQueryDto): Promise<Paginated<AuditLog>> {
    const where: FindOptionsWhere<AuditLog> = {};
    if (query.action) where.action = query.action;
    if (query.entity) where.entity = query.entity;
    if (query.userId) where.userId = query.userId;

    const [data, total] = await this.auditLogRepo.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: toSkip(query),
      take: query.limit,
    });
    return Paginated.of(data, total, query);
  }
}
