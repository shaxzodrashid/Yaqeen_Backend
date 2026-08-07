import { Module } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { CurrencyController } from './currency.controller';
import { RedisModule } from '../redis/redis.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [CurrencyController],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
