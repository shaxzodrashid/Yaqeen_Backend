import {
  Controller,
  Get,
  Post,
  Put,
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
} from './dto/sales-manager-kpi.dto';

@Controller('sales-manager-kpi')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesManagerKpiController {
  constructor(
    private readonly salesManagerKpiService: SalesManagerKpiService,
  ) {}

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
