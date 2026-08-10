import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { KpiSummaryService } from './kpi-summary.service';
import { KpiSummaryQueryDto, KpiHistoryQueryDto } from './dto/kpi-query.dto';

@Controller('kpi')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class KpiSummaryController {
  constructor(private readonly kpiSummaryService: KpiSummaryService) {}

  /**
   * GET /api/v1/kpi/summary
   * Returns per-employee KPI summary breakdown for the requested month or all time,
   * with pagination and overall meta totals.
   */
  @Get('summary')
  async getKpiSummary(@Query() query: KpiSummaryQueryDto) {
    return this.kpiSummaryService.getKpiSummary(query);
  }

  /**
   * GET /api/v1/kpi/history
   * Returns full itemized audit trail history of KPIs ("Each amount of money came from where").
   */
  @Get('history')
  async getKpiHistory(@Query() query: KpiHistoryQueryDto) {
    return this.kpiSummaryService.getKpiHistory(query);
  }

  /**
   * GET /api/v1/kpi/employee/:id
   * Deep-dive breakdown of a single employee's KPI records.
   */
  @Get('employee/:id')
  async getEmployeeKpiBreakdown(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('month') month?: string,
  ) {
    return this.kpiSummaryService.getEmployeeKpiBreakdown(id, month);
  }
}
