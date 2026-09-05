import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { KpiAlertsService } from './kpi-alerts.service';

@Injectable()
export class KpiAlertsSchedulerService {
  private readonly logger = new Logger(KpiAlertsSchedulerService.name);

  constructor(private readonly kpiAlertsService: KpiAlertsService) {}

  /**
   * Runs daily at 09:00 AM UTC.
   * If within the last week of the month, calculates and synchronizes real-time KPI evaluations and alert suggestions.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleDailyMonthEndCheck() {
    try {
      const periodInfo = this.kpiAlertsService.getMonthPeriodInfo();

      if (!periodInfo.isLastWeek) {
        this.logger.debug(
          `KPI Alerts Scheduler: Day ${periodInfo.currentDay} is not in the last week of the month (starts day ${periodInfo.lastWeekStartDate}). Skipping evaluation run.`,
        );
        return;
      }

      const currentMonth = new Date().toISOString().slice(0, 7);
      this.logger.log(
        `KPI Alerts Scheduler: In last week of month ${currentMonth} (Day ${periodInfo.currentDay}/${periodInfo.totalDays}). Synchronizing evaluations and alerts...`,
      );

      const result = await this.kpiAlertsService.getPopupAlerts({
        month: currentMonth,
        force_popup: true,
      });

      this.logger.log(
        `KPI Alerts Scheduler completed for ${currentMonth}: ${result.summary.total_employees} employees evaluated, ${result.summary.promotions_count} promotion suggestions, ${result.summary.demotions_count} demotion suggestions, ${result.summary.sr_check_approvals_count} sr check reviews pending.`,
      );
    } catch (err: any) {
      this.logger.error(
        `KPI Alerts Scheduler encountered an error: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Manually triggers evaluation sync for any month.
   */
  async triggerManualSync(month?: string) {
    const targetMonth = month || new Date().toISOString().slice(0, 7);
    this.logger.log(`Manual trigger of KPI alerts sync for ${targetMonth}`);
    return this.kpiAlertsService.getPopupAlerts({
      month: targetMonth,
      force_popup: true,
    });
  }
}
