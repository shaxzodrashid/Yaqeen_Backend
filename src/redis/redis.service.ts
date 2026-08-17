import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST', '127.0.0.1');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password =
      this.configService.get<string>('REDIS_PASSWORD', '') || undefined;

    this.client = new Redis({
      host,
      port,
      password,
      // Prevents connection issues from crashing the app on startup
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        this.logger.warn(`Redis connection failed. Retrying in ${delay}ms...`);
        return delay;
      },
    });

    this.client.on('connect', () => {
      this.logger.log('Redis client successfully connected');
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`, err.stack);
    });
  }

  /**
   * Get the direct ioredis client instance.
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Get a value from Redis.
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Set a value in Redis.
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<string> {
    if (ttlSeconds) {
      return this.client.set(key, value, 'EX', ttlSeconds);
    }
    return this.client.set(key, value);
  }

  /**
   * Delete a key from Redis.
   */
  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /**
   * Delete keys matching a glob pattern using non-blocking SCAN.
   */
  async delByPattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        if (keys && keys.length > 0) {
          await this.client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(
        `Failed to delete keys by pattern ${pattern}: ${err.message}`,
      );
    }
  }

  /**
   * Cleanup on application shutdown.
   */
  onModuleDestroy(): void {
    this.logger.log('Closing Redis connection...');
    this.client.disconnect();
  }
}
