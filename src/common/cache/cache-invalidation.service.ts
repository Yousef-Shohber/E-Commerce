import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { DASHBOARD_STATS_CACHE_KEY } from './cache.constants';

@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(private readonly redis: RedisService) {}

  async invalidateDashboard(): Promise<void> {
    try {
      await this.redis.del(DASHBOARD_STATS_CACHE_KEY);
    } catch (error) {
      this.logger.error(
        `Cache invalidation failed (dashboard); entry stays stale until TTL: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
