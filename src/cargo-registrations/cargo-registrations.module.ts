import { Module } from '@nestjs/common';
import { CargoRegistrationsService } from './cargo-registrations.service';
import { CargoRegistrationsController } from './cargo-registrations.controller';
import { DatabaseModule } from '../database/database.module';
import { CurrencyModule } from '../currency/currency.module';
import { RedisModule } from '../redis/redis.module';
import { LocationsModule } from '../locations/locations.module';

@Module({
  imports: [DatabaseModule, CurrencyModule, RedisModule, LocationsModule],
  controllers: [CargoRegistrationsController],
  providers: [CargoRegistrationsService],
  exports: [CargoRegistrationsService],
})
export class CargoRegistrationsModule {}
