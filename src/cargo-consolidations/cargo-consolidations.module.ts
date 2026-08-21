import { Module } from '@nestjs/common';
import { CargoConsolidationsService } from './cargo-consolidations.service';
import { CargoConsolidationsController } from './cargo-consolidations.controller';
import { DatabaseModule } from '../database/database.module';
import { CurrencyModule } from '../currency/currency.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [DatabaseModule, CurrencyModule, RedisModule],
  controllers: [CargoConsolidationsController],
  providers: [CargoConsolidationsService],
  exports: [CargoConsolidationsService],
})
export class CargoConsolidationsModule {}
