import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { DashboardService } from './dashboard.service';
import {
  SalesProgressQueryDto,
  DashboardSummaryQueryDto,
  TopPerformersQueryDto,
  RouteAnalyticsQueryDto,
  DebtSummaryQueryDto,
  DeliveryEfficiencyQueryDto,
} from './dto/dashboard-query.dto';
import {
  SalesProgressResponse,
  DashboardSummaryKpi,
  CargoDistributionResponse,
  TopPerformersResponse,
  RouteAnalyticsResponse,
  DebtSummaryKpi,
  DeliveryEfficiencyKpi,
} from './dashboard.types';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /dashboard/summary
   * Executive Dashboard Summary KPI cards (Revenue, Profit, Growth rates, Active/Completed cargos, Debts, Delivery efficiency)
   */
  @Get('summary')
  async getDashboardSummary(
    @Query() query: DashboardSummaryQueryDto,
  ): Promise<DashboardSummaryKpi> {
    return this.dashboardService.getDashboardSummary(query);
  }

  /**
   * GET /dashboard/sales-progress
   * Dynamic Line Chart endpoint for Revenue vs Costs/Expenses with period filters (1D, 5D, 1M, 6M, YTD, 1Y, 5Y, MAX, CUSTOM)
   */
  @Get('sales-progress')
  async getSalesProgress(
    @Query() query: SalesProgressQueryDto,
  ): Promise<SalesProgressResponse> {
    return this.dashboardService.getSalesProgress(query);
  }

  /**
   * GET /dashboard/cargo-distribution
   * Donut/Pie Chart distribution data (Transport Types: Auto, Railway, Air, Sea; Cargo Types; Order Statuses)
   */
  @Get('cargo-distribution')
  async getCargoDistribution(
    @Query() query: DashboardSummaryQueryDto,
  ): Promise<CargoDistributionResponse> {
    return this.dashboardService.getCargoDistribution(query);
  }

  /**
   * GET /dashboard/route-analytics
   * Route and Country-level intelligence (Top routes: China-Uzbekistan, Turkey-Uzbekistan, etc.; Country volume & sales shares)
   */
  @Get('route-analytics')
  async getRouteAnalytics(
    @Query() query: RouteAnalyticsQueryDto,
  ): Promise<RouteAnalyticsResponse> {
    return this.dashboardService.getRouteAnalytics(query);
  }

  /**
   * GET /dashboard/top-performers
   * Bar Chart Leaderboards (Top Sales/Logistics Managers & Top Clients with volumes, revenues, and profits)
   */
  @Get('top-performers')
  async getTopPerformers(
    @Query() query: TopPerformersQueryDto,
  ): Promise<TopPerformersResponse> {
    return this.dashboardService.getTopPerformers(query);
  }

  /**
   * GET /dashboard/delivery-efficiency
   * Status Tracking, Shipment Flow & Delivery Duration / Efficiency Analytics
   */
  @Get('delivery-efficiency')
  async getDeliveryEfficiency(
    @Query() query: DeliveryEfficiencyQueryDto,
  ): Promise<DeliveryEfficiencyKpi> {
    return this.dashboardService.getDeliveryEfficiency(query);
  }

  /**
   * GET /dashboard/debt-summary
   * Debitor (Accounts Receivable) & Kreditor (Accounts Payable) Balance Summary
   */
  @Get('debt-summary')
  async getDebtSummary(
    @Query() query: DebtSummaryQueryDto,
  ): Promise<DebtSummaryKpi> {
    return this.dashboardService.getDebtSummary(query);
  }
}
