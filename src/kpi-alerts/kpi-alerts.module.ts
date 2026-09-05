import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SalesManagerKpiModule } from '../sales-manager-kpi/sales-manager-kpi.module';
import { KpiAlertsService } from './kpi-alerts.service';
import { KpiAlertsController } from './kpi-alerts.controller';
import { KpiAlertsSchedulerService } from './kpi-alerts-scheduler.service';

@Module({
  imports: [DatabaseModule, SalesManagerKpiModule],
  controllers: [KpiAlertsController],
  providers: [KpiAlertsService, KpiAlertsSchedulerService],
  exports: [KpiAlertsService, KpiAlertsSchedulerService],
})
export class KpiAlertsModule {}
