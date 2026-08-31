import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
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
import { SalesManagerKpiService } from './sales-manager-kpi.service';
import {
  CalculateEvaluationDto,
  ApproveSrCheckDto,
  ReviewDemotionDto,
  QueryEvaluationDto,
  UpdateCareerLevelDto,
  QueryCargosMonitoringDto,
  UpdateCargoPaymentStatusDto,
  ConfirmCargoKpiDto,
  BulkConfirmKpiDto,
  BulkUpdatePaymentStatusDto,
} from './dto/sales-manager-kpi.dto';

@Controller('sales-manager-kpi')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesManagerKpiController {
  constructor(
    private readonly salesManagerKpiService: SalesManagerKpiService,
  ) {}

  /**
   * Section 2 / Image 2: Employee Assigned Cargos Monitoring & KPI
   * GET /api/sales-manager-kpi/cargos-monitoring?employee_id=...&month=...
   */
  @Get('cargos-monitoring')
  @RequirePermission('cargo_kpi', 'read')
  getCargosMonitoring(@Query() query: QueryCargosMonitoringDto) {
    return this.salesManagerKpiService.getCargosMonitoring(query);
  }

  @Get('employee/:employeeId/cargos-monitoring')
  @RequirePermission('cargo_kpi', 'read')
  getEmployeeCargosMonitoring(
    @Param('employeeId') employeeId: string,
    @Query() query: QueryCargosMonitoringDto,
  ) {
    return this.salesManagerKpiService.getCargosMonitoring({
      ...query,
      employee_id: employeeId,
    });
  }

  @Patch('cargos/:id/payment-status')
  @RequirePermission('cargo_kpi', 'update')
  updateCargoPaymentStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCargoPaymentStatusDto,
  ) {
    return this.salesManagerKpiService.updateCargoPaymentStatus(id, dto);
  }

  @Patch('cargos/:id/confirm-kpi')
  @RequirePermission('cargo_kpi', 'update')
  confirmCargoKpi(@Param('id') id: string, @Body() dto: ConfirmCargoKpiDto) {
    return this.salesManagerKpiService.confirmCargoKpi(id, dto);
  }

  @Post('bulk-confirm-kpi')
  @RequirePermission('cargo_kpi', 'update')
  @HttpCode(HttpStatus.OK)
  bulkConfirmEmployeeKpi(@Body() dto: BulkConfirmKpiDto) {
    return this.salesManagerKpiService.bulkConfirmEmployeeKpi(dto);
  }

  @Post('bulk-payment-status')
  @RequirePermission('cargo_kpi', 'update')
  @HttpCode(HttpStatus.OK)
  bulkUpdatePaymentStatus(@Body() dto: BulkUpdatePaymentStatusDto) {
    return this.salesManagerKpiService.bulkUpdatePaymentStatus(dto);
  }

  @Get('evaluations')
  @RequirePermission('cargo_kpi', 'read')
  findAllEvaluations(@Query() query: QueryEvaluationDto) {
    return this.salesManagerKpiService.findAllEvaluations(query);
  }

  @Get('evaluations/:id')
  @RequirePermission('cargo_kpi', 'read')
  getEvaluationById(@Param('id') id: string) {
    return this.salesManagerKpiService.getEvaluationById(id);
  }

  @Post('evaluations/calculate')
  @RequirePermission('cargo_kpi', 'create')
  @HttpCode(HttpStatus.OK)
  calculateEvaluation(@Body() dto: CalculateEvaluationDto) {
    return this.salesManagerKpiService.calculateEvaluation(dto);
  }

  @Post('evaluations/:id/approve-sr-check')
  @RequirePermission('cargo_kpi', 'update')
  @HttpCode(HttpStatus.OK)
  approveSrCheck(
    @Param('id') id: string,
    @Body() dto: ApproveSrCheckDto,
    @CurrentUser() user: any,
  ) {
    const reviewerUserId = user?.id || user?.userId;
    return this.salesManagerKpiService.approveSrCheck(id, reviewerUserId, dto);
  }

  @Post('evaluations/:id/review-demotion')
  @RequirePermission('cargo_kpi', 'update')
  @HttpCode(HttpStatus.OK)
  reviewDemotion(
    @Param('id') id: string,
    @Body() dto: ReviewDemotionDto,
    @CurrentUser() user: any,
  ) {
    const reviewerUserId = user?.id || user?.userId;
    return this.salesManagerKpiService.reviewDemotion(id, reviewerUserId, dto);
  }

  @Put('employee-level/:employeeId')
  @RequirePermission('cargo_kpi', 'update')
  updateEmployeeCareerLevel(
    @Param('employeeId') employeeId: string,
    @Body() dto: UpdateCareerLevelDto,
  ) {
    return this.salesManagerKpiService.updateEmployeeCareerLevel(
      employeeId,
      dto,
    );
  }
}
