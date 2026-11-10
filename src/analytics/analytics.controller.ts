import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../common/decorators';
import { UserType } from '../common/enums';
import { AnalyticsService } from './analytics.service';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';

@ApiTags('Analytics')
@Controller('analytics')
@Auth(UserType.ADMIN)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard statistics of the whole shop (admin)' })
  @ApiOkResponse({ type: DashboardStatsDto })
  getDashboard(): Promise<DashboardStatsDto> {
    return this.analytics.getDashboard();
  }
}
