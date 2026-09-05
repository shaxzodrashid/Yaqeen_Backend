import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { KpiAlertsService } from './kpi-alerts.service';
import {
  KpiAlertPopupQueryDto,
  KpiAlertDecisionDto,
  KpiAlertBulkDecisionDto,
} from './dto/kpi-alerts.dto';

@Controller('kpi-alerts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class KpiAlertsController {
  constructor(private readonly kpiAlertsService: KpiAlertsService) {}

  /**
   * Month-end KPI pop-up endpoint.
   * GET /api/v1/kpi-alerts/popup?month=YYYY-MM&force_popup=true
   */
  @Get('popup')
  @RequirePermission('cargo_kpi', 'read')
  getPopupAlerts(@Query() query: KpiAlertPopupQueryDto) {
    return this.kpiAlertsService.getPopupAlerts(query);
  }

  /**
   * Execute an executive decision (Promotion, Demotion, Sr Check, KPI).
   * POST /api/v1/kpi-alerts/decide
   */
  @Post('decide')
  @RequirePermission('cargo_kpi', 'update')
  @HttpCode(HttpStatus.OK)
  decideAlert(@Body() dto: KpiAlertDecisionDto, @CurrentUser() user: any) {
    const reviewerUserId = user?.id || user?.userId;
    return this.kpiAlertsService.decideAlert(dto, reviewerUserId);
  }

  /**
   * Bulk execute decisions for all or selected suggestions.
   * POST /api/v1/kpi-alerts/bulk-decide
   */
  @Post('bulk-decide')
  @RequirePermission('cargo_kpi', 'update')
  @HttpCode(HttpStatus.OK)
  bulkDecideAlerts(
    @Body() dto: KpiAlertBulkDecisionDto,
    @CurrentUser() user: any,
  ) {
    const reviewerUserId = user?.id || user?.userId;
    return this.kpiAlertsService.bulkDecideAlerts(dto, reviewerUserId);
  }

  /**
   * Dismiss an alert so it doesn't pop up again for the user session.
   * POST /api/v1/kpi-alerts/:id/dismiss
   */
  @Post(':id/dismiss')
  @RequirePermission('cargo_kpi', 'update')
  @HttpCode(HttpStatus.OK)
  dismissAlert(@Param('id') id: string) {
    return this.kpiAlertsService.dismissAlert(id);
  }
}
