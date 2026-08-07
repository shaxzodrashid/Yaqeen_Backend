import { Injectable, Inject } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';

@Injectable()
export class DbHealthIndicator extends HealthIndicator {
  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Run a simple query to verify database connectivity
      await this.knex.raw('SELECT 1');
      return this.getStatus(key, true);
    } catch (error: any) {
      throw new HealthCheckError(
        'Database connection failed',
        this.getStatus(key, false, { message: error.message }),
      );
    }
  }
}
