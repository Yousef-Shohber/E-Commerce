import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiPaginated, Auth } from '../common/decorators';
import { UserType } from '../common/enums';
import { AuditLogsService } from './audit-logs.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

@ApiTags('Audit Logs')
@Controller('audit-logs')
@Auth(UserType.ADMIN)
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  @ApiPaginated('A page of audit log entries, newest first (admin)')
  findAll(@Query() query: ListAuditLogsQueryDto) {
    return this.auditLogs.findAll(query);
  }
}
