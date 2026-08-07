import { Module } from '@nestjs/common';
import { SalesManagerKpiController } from './sales-manager-kpi.controller';
import { SalesManagerKpiService } from './sales-manager-kpi.service';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [CurrencyModule],
  controllers: [SalesManagerKpiController],
  providers: [SalesManagerKpiService],
  exports: [SalesManagerKpiService],
})
export class SalesManagerKpiModule {}
