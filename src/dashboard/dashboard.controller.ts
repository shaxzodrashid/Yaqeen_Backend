import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { DashboardService } from './dashboard.service';
import {
  SalesProgressQueryDto,
  DashboardSummaryQueryDto,
  TopPerformersQueryDto,
} from './dto/dashboard-query.dto';
import {
  SalesProgressResponse,
  DashboardSummaryKpi,
  CargoDistributionResponse,
  TopPerformersResponse,
} from './dashboard.types';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /dashboard/sales-progress
   * Sales progress line graph endpoint with period filters (1D, 5D, 1M, 6M, YTD, 1Y, 5Y, MAX, CUSTOM)
   */
  @Get('sales-progress')
  async getSalesProgress(
    @Query() query: SalesProgressQueryDto,
  ): Promise<SalesProgressResponse> {
    return this.dashboardService.getSalesProgress(query);
  }

  /**
   * GET /dashboard/summary
   * Executive Dashboard Summary KPI cards
   */
  @Get('summary')
  async getDashboardSummary(
    @Query() query: DashboardSummaryQueryDto,
  ): Promise<DashboardSummaryKpi> {
    return this.dashboardService.getDashboardSummary(query);
  }

  /**
   * GET /dashboard/cargo-distribution
   * Donut/Pie Chart distribution data (Cargo Type & Status)
   */
  @Get('cargo-distribution')
  async getCargoDistribution(
    @Query() query: DashboardSummaryQueryDto,
  ): Promise<CargoDistributionResponse> {
    return this.dashboardService.getCargoDistribution(query);
  }

  /**
   * GET /dashboard/top-performers
   * Bar Chart Leaderboards (Top Managers & Top Clients)
   */
  @Get('top-performers')
  async getTopPerformers(
    @Query() query: TopPerformersQueryDto,
  ): Promise<TopPerformersResponse> {
    return this.dashboardService.getTopPerformers(query);
  }
}
