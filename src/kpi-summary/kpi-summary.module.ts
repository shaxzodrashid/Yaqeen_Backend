import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CurrencyModule } from '../currency/currency.module';
import { KpiSummaryController } from './kpi-summary.controller';
import { KpiSummaryService } from './kpi-summary.service';

@Module({
  imports: [DatabaseModule, CurrencyModule],
  controllers: [KpiSummaryController],
  providers: [KpiSummaryService],
  exports: [KpiSummaryService],
})
export class KpiSummaryModule {}
