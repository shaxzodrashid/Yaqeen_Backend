import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redisService: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const pong = await this.redisService.getClient().ping();
      if (pong === 'PONG') {
        return this.getStatus(key, true);
      }
      throw new Error(`Unexpected ping response: ${pong}`);
    } catch (error: any) {
      throw new HealthCheckError(
        'Redis connection failed',
        this.getStatus(key, false, { message: error.message }),
      );
    }
  }
}
