import { Module } from '@nestjs/common';
import { CargoKpiService } from './cargo-kpi.service';
import { CargoKpiController } from './cargo-kpi.controller';
import { DatabaseModule } from '../database/database.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [DatabaseModule, CurrencyModule],
  controllers: [CargoKpiController],
  providers: [CargoKpiService],
  exports: [CargoKpiService],
})
export class CargoKpiModule {}
