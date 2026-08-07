import {
  Injectable,
  Inject,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import {
  TimeframePeriod,
  Granularity,
  SalesProgressResponse,
  TimeframeMeta,
  TimeframeSummary,
  TimeBucketDataPoint,
  DashboardSummaryKpi,
  CargoDistributionResponse,
  CargoDistributionItem,
  TopPerformersResponse,
  TopPerformerManager,
  TopPerformerClient,
} from './dashboard.types';
import {
  SalesProgressQueryDto,
  DashboardSummaryQueryDto,
  TopPerformersQueryDto,
} from './dto/dashboard-query.dto';
import { CurrencyService } from '../currency/currency.service';
import { Currency } from '../currency/currency.types';

interface DateRange {
  startDate: Date;
  endDate: Date;
  granularity: Granularity;
  prevStartDate: Date | null;
  prevEndDate: Date | null;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    @Optional() private readonly currencyService?: CurrencyService,
  ) {}

  private async convertRecordPricesToUzs(
    r: any,
    rates?: Record<Currency, any>,
  ): Promise<{ sellPriceUzs: number; purchasePriceUzs: number }> {
    const sellPrice = Number(r.sell_price || 0);
    const purchasePrice = Number(r.purchase_price || 0);
    const sellCurr = (r.sell_currency as Currency) || Currency.UZS;
    const purchaseCurr = (r.purchase_currency as Currency) || Currency.UZS;

    let sellPriceUzs = sellPrice;
    let purchasePriceUzs = purchasePrice;

    if (this.currencyService) {
      sellPriceUzs = await this.currencyService.convertToUzs(
        sellPrice,
        sellCurr,
        rates,
      );
      purchasePriceUzs = await this.currencyService.convertToUzs(
        purchasePrice,
        purchaseCurr,
        rates,
      );
    }

    return { sellPriceUzs, purchasePriceUzs };
  }

  private async convertFromUzs(
    amount: number,
    targetCurrency: Currency,
  ): Promise<number> {
    if (targetCurrency === Currency.UZS || !this.currencyService) {
      return Math.round(amount * 100) / 100;
    }
    const res = await this.currencyService.convert(
      amount,
      Currency.UZS,
      targetCurrency,
    );
    return res.converted_amount;
  }

  /**
   * Main Sales Progress Line Graph Endpoint Service Method
   */
  async getSalesProgress(
    query: SalesProgressQueryDto,
    refDate: Date = new Date(),
  ): Promise<SalesProgressResponse> {
    const period = query.period || TimeframePeriod.ONE_MONTH;
    const targetCurrency = query.currency || Currency.UZS;

    // 1. Resolve exact date ranges (current and preceding for growth rate)
    const range = await this.resolveDateRange(period, query, refDate);

    // 2. Fetch raw aggregated registration data from cargo_registrations table for current range
    const currentRecords = await this.fetchRegistrations(
      range.startDate,
      range.endDate,
      query,
    );

    const rates = this.currencyService
      ? await this.currencyService.getLatestRates()
      : undefined;

    // 3. Generate continuous gap-filled time buckets
    const buckets = this.generateTimeBuckets(
      range.startDate,
      range.endDate,
      range.granularity,
    );

    // 4. Populate time buckets with sales data converted to UZS
    await this.populateBucketsWithData(buckets, currentRecords, rates);

    // 5. Calculate cumulative trajectory and format data points converted to target currency
    let runningSalesUzs = 0;
    let runningMarginUzs = 0;

    const dataPoints: TimeBucketDataPoint[] = [];
    for (let idx = 0; idx < buckets.length; idx++) {
      const bucket = buckets[idx];
      runningSalesUzs += bucket.sales;
      runningMarginUzs += bucket.margin;

      const sales = await this.convertFromUzs(bucket.sales, targetCurrency);
      const purchaseCost = await this.convertFromUzs(
        bucket.purchaseCost,
        targetCurrency,
      );
      const margin = await this.convertFromUzs(bucket.margin, targetCurrency);
      const cumulativeSales = await this.convertFromUzs(
        runningSalesUzs,
        targetCurrency,
      );
      const cumulativeMargin = await this.convertFromUzs(
        runningMarginUzs,
        targetCurrency,
      );

      dataPoints.push({
        index: idx,
        bucketStart: bucket.bucketStart.toISOString(),
        bucketEnd: bucket.bucketEnd.toISOString(),
        dateKey: bucket.dateKey,
        label: bucket.label,
        sales,
        purchaseCost,
        margin,
        orderCount: bucket.orderCount,
        cumulativeSales,
        cumulativeMargin,
      });
    }

    // 6. Compute summary aggregates for current period in UZS first
    let totalSalesUzs = 0;
    let totalPurchaseCostUzs = 0;
    for (const r of currentRecords) {
      const { sellPriceUzs, purchasePriceUzs } =
        await this.convertRecordPricesToUzs(r, rates);
      totalSalesUzs += sellPriceUzs;
      totalPurchaseCostUzs += purchasePriceUzs;
    }

    const totalMarginUzs = totalSalesUzs - totalPurchaseCostUzs;
    const marginPercentage =
      totalSalesUzs > 0 ? (totalMarginUzs / totalSalesUzs) * 100 : 0;
    const totalOrders = currentRecords.length;
    const averageOrderValueUzs =
      totalOrders > 0 ? totalSalesUzs / totalOrders : 0;
    const completedOrders = currentRecords.filter(
      (r) => (r.status || '').toLowerCase() === 'completed',
    ).length;
    const pendingOrders = totalOrders - completedOrders;

    // 7. Calculate growth rate against preceding period if available
    let growthRateSales: number | null = null;
    let growthRateMargin: number | null = null;

    if (range.prevStartDate && range.prevEndDate) {
      const prevRecords = await this.fetchRegistrations(
        range.prevStartDate,
        range.prevEndDate,
        query,
      );
      let prevSalesUzs = 0;
      let prevCostUzs = 0;
      for (const r of prevRecords) {
        const { sellPriceUzs, purchasePriceUzs } =
          await this.convertRecordPricesToUzs(r, rates);
        prevSalesUzs += sellPriceUzs;
        prevCostUzs += purchasePriceUzs;
      }
      const prevMarginUzs = prevSalesUzs - prevCostUzs;

      if (prevSalesUzs > 0) {
        growthRateSales =
          Math.round(((totalSalesUzs - prevSalesUzs) / prevSalesUzs) * 10000) /
          100;
      } else if (totalSalesUzs > 0) {
        growthRateSales = 100;
      }

      if (prevMarginUzs > 0) {
        growthRateMargin =
          Math.round(
            ((totalMarginUzs - prevMarginUzs) / prevMarginUzs) * 10000,
          ) / 100;
      } else if (totalMarginUzs > 0) {
        growthRateMargin = 100;
      }
    }

    const meta: TimeframeMeta = {
      period,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
      granularity: range.granularity,
      totalBuckets: dataPoints.length,
      currency: targetCurrency,
    };

    const totalSales = await this.convertFromUzs(totalSalesUzs, targetCurrency);
    const totalPurchaseCost = await this.convertFromUzs(
      totalPurchaseCostUzs,
      targetCurrency,
    );
    const totalMargin = await this.convertFromUzs(
      totalMarginUzs,
      targetCurrency,
    );
    const averageOrderValue = await this.convertFromUzs(
      averageOrderValueUzs,
      targetCurrency,
    );

    const summary: TimeframeSummary = {
      totalSales,
      totalPurchaseCost,
      totalMargin,
      marginPercentage: Math.round(marginPercentage * 100) / 100,
      totalOrders,
      averageOrderValue,
      completedOrders,
      pendingOrders,
      growthRateSales,
      growthRateMargin,
    };

    return {
      meta,
      summary,
      dataPoints,
    };
  }

  /**
   * Executive Dashboard Summary KPI Endpoint
   */
  async getDashboardSummary(
    query: DashboardSummaryQueryDto,
    refDate: Date = new Date(),
  ): Promise<DashboardSummaryKpi> {
    const period = query.period || TimeframePeriod.ONE_MONTH;
    const targetCurrency = query.currency || Currency.UZS;
    const range = await this.resolveDateRange(period, query, refDate);

    const records = await this.fetchRegistrations(
      range.startDate,
      range.endDate,
      query,
    );

    const rates = this.currencyService
      ? await this.currencyService.getLatestRates()
      : undefined;

    let totalSalesUzs = 0;
    let totalPurchaseCostUzs = 0;

    for (const r of records) {
      const { sellPriceUzs, purchasePriceUzs } =
        await this.convertRecordPricesToUzs(r, rates);
      totalSalesUzs += sellPriceUzs;
      totalPurchaseCostUzs += purchasePriceUzs;
    }

    const totalMarginUzs = totalSalesUzs - totalPurchaseCostUzs;
    const marginPercentage =
      totalSalesUzs > 0 ? (totalMarginUzs / totalSalesUzs) * 100 : 0;

    const totalOrders = records.length;
    const completedOrders = records.filter(
      (r) => (r.status || '').toLowerCase() === 'completed',
    ).length;
    const waitingOrders = totalOrders - completedOrders;
    const averageOrderValueUzs =
      totalOrders > 0 ? totalSalesUzs / totalOrders : 0;

    const totalVolume = records.reduce(
      (sum, r) => sum + Number(r.volume || 0),
      0,
    );
    const totalWeight = records.reduce(
      (sum, r) => sum + Number(r.weight || 0),
      0,
    );

    const ltlOrderCount = records.filter(
      (r) => (r.cargo_type || '').toUpperCase() === 'LTL',
    ).length;
    const ftlOrderCount = records.filter(
      (r) => (r.cargo_type || '').toUpperCase() === 'FTL',
    ).length;

    let salesGrowthVsPriorPeriod: number | null = null;
    let marginGrowthVsPriorPeriod: number | null = null;

    if (range.prevStartDate && range.prevEndDate) {
      const prevRecords = await this.fetchRegistrations(
        range.prevStartDate,
        range.prevEndDate,
        query,
      );
      let prevSalesUzs = 0;
      let prevCostUzs = 0;
      for (const r of prevRecords) {
        const { sellPriceUzs, purchasePriceUzs } =
          await this.convertRecordPricesToUzs(r, rates);
        prevSalesUzs += sellPriceUzs;
        prevCostUzs += purchasePriceUzs;
      }
      const prevMarginUzs = prevSalesUzs - prevCostUzs;

      if (prevSalesUzs > 0) {
        salesGrowthVsPriorPeriod =
          Math.round(((totalSalesUzs - prevSalesUzs) / prevSalesUzs) * 10000) /
          100;
      }
      if (prevMarginUzs > 0) {
        marginGrowthVsPriorPeriod =
          Math.round(
            ((totalMarginUzs - prevMarginUzs) / prevMarginUzs) * 10000,
          ) / 100;
      }
    }

    const totalSales = await this.convertFromUzs(totalSalesUzs, targetCurrency);
    const totalPurchaseCost = await this.convertFromUzs(
      totalPurchaseCostUzs,
      targetCurrency,
    );
    const totalMargin = await this.convertFromUzs(
      totalMarginUzs,
      targetCurrency,
    );
    const averageOrderValue = await this.convertFromUzs(
      averageOrderValueUzs,
      targetCurrency,
    );

    return {
      currency: targetCurrency,
      totalSales,
      totalPurchaseCost,
      totalMargin,
      marginPercentage: Math.round(marginPercentage * 100) / 100,
      totalOrders,
      completedOrders,
      waitingOrders,
      averageOrderValue,
      totalVolume: Math.round(totalVolume * 100) / 100,
      totalWeight: Math.round(totalWeight * 100) / 100,
      ltlOrderCount,
      ftlOrderCount,
      salesGrowthVsPriorPeriod,
      marginGrowthVsPriorPeriod,
    };
  }

  /**
   * Donut/Pie Chart Distribution Endpoint (Cargo Type & Status)
   */
  async getCargoDistribution(
    query: DashboardSummaryQueryDto,
    refDate: Date = new Date(),
  ): Promise<CargoDistributionResponse> {
    const period = query.period || TimeframePeriod.ONE_MONTH;
    const targetCurrency = query.currency || Currency.UZS;
    const range = await this.resolveDateRange(period, query, refDate);

    const records = await this.fetchRegistrations(
      range.startDate,
      range.endDate,
      query,
    );

    const rates = this.currencyService
      ? await this.currencyService.getLatestRates()
      : undefined;

    const totalCount = records.length || 1;

    // Cargo Type distribution
    const cargoTypeMap = new Map<
      string,
      { count: number; totalSalesUzs: number }
    >();
    // Status distribution
    const statusMap = new Map<
      string,
      { count: number; totalSalesUzs: number }
    >();

    for (const r of records) {
      const typeKey = (r.cargo_type || 'Unknown').toUpperCase();
      const statusKey = r.status || 'Waiting';
      const { sellPriceUzs } = await this.convertRecordPricesToUzs(r, rates);

      const typeCurr = cargoTypeMap.get(typeKey) || {
        count: 0,
        totalSalesUzs: 0,
      };
      typeCurr.count += 1;
      typeCurr.totalSalesUzs += sellPriceUzs;
      cargoTypeMap.set(typeKey, typeCurr);

      const statusCurr = statusMap.get(statusKey) || {
        count: 0,
        totalSalesUzs: 0,
      };
      statusCurr.count += 1;
      statusCurr.totalSalesUzs += sellPriceUzs;
      statusMap.set(statusKey, statusCurr);
    }

    const cargoTypeDistribution: CargoDistributionItem[] = [];
    for (const [category, val] of cargoTypeMap.entries()) {
      const totalSales = await this.convertFromUzs(
        val.totalSalesUzs,
        targetCurrency,
      );
      cargoTypeDistribution.push({
        category,
        count: val.count,
        totalSales,
        percentage: Math.round((val.count / totalCount) * 10000) / 100,
      });
    }

    const statusDistribution: CargoDistributionItem[] = [];
    for (const [category, val] of statusMap.entries()) {
      const totalSales = await this.convertFromUzs(
        val.totalSalesUzs,
        targetCurrency,
      );
      statusDistribution.push({
        category,
        count: val.count,
        totalSales,
        percentage: Math.round((val.count / totalCount) * 10000) / 100,
      });
    }

    return {
      currency: targetCurrency,
      cargoTypeDistribution,
      statusDistribution,
    };
  }

  /**
   * Leaderboard Endpoint for Bar Charts (Top Managers & Top Clients)
   */
  async getTopPerformers(
    query: TopPerformersQueryDto,
    refDate: Date = new Date(),
  ): Promise<TopPerformersResponse> {
    const period = query.period || TimeframePeriod.ONE_MONTH;
    const limit = query.limit || 5;
    const targetCurrency = query.currency || Currency.UZS;
    const range = await this.resolveDateRange(period, query, refDate);

    const records = await this.fetchRegistrations(
      range.startDate,
      range.endDate,
      query,
    );

    const rates = this.currencyService
      ? await this.currencyService.getLatestRates()
      : undefined;

    // Group by manager
    const managerMap = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        departmentName?: string;
        salesUzs: number;
        costUzs: number;
        orderCount: number;
      }
    >();

    // Group by client
    const clientMap = new Map<
      string,
      {
        clientId: string;
        clientName: string;
        companyName?: string;
        salesUzs: number;
        costUzs: number;
        orderCount: number;
      }
    >();

    for (const r of records) {
      const { sellPriceUzs, purchasePriceUzs } =
        await this.convertRecordPricesToUzs(r, rates);

      if (r.employee_id) {
        const emp = managerMap.get(r.employee_id) || {
          employeeId: r.employee_id,
          employeeName: 'Unknown Manager',
          departmentName: undefined,
          salesUzs: 0,
          costUzs: 0,
          orderCount: 0,
        };
        emp.salesUzs += sellPriceUzs;
        emp.costUzs += purchasePriceUzs;
        emp.orderCount += 1;
        managerMap.set(r.employee_id, emp);
      }

      if (r.client_id) {
        const cl = clientMap.get(r.client_id) || {
          clientId: r.client_id,
          clientName: 'Unknown Client',
          companyName: undefined,
          salesUzs: 0,
          costUzs: 0,
          orderCount: 0,
        };
        cl.salesUzs += sellPriceUzs;
        cl.costUzs += purchasePriceUzs;
        cl.orderCount += 1;
        clientMap.set(r.client_id, cl);
      }
    }

    // Enhance manager & client names from DB
    const managerIds = Array.from(managerMap.keys());
    if (managerIds.length > 0) {
      const employees = await this.knex('employees as e')
        .leftJoin('departments as d', 'e.department_id', 'd.id')
        .select(
          'e.id',
          'e.first_name',
          'e.last_name',
          'd.name as department_name',
        )
        .whereIn('e.id', managerIds);

      for (const emp of employees) {
        const item = managerMap.get(emp.id);
        if (item) {
          item.employeeName =
            `${emp.first_name || ''} ${emp.last_name || ''}`.trim() ||
            'Unknown Manager';
          item.departmentName = emp.department_name || undefined;
        }
      }
    }

    const clientIds = Array.from(clientMap.keys());
    if (clientIds.length > 0) {
      const clients = await this.knex('clients')
        .select('id', 'first_name', 'last_name', 'company_name')
        .whereIn('id', clientIds);

      for (const cl of clients) {
        const item = clientMap.get(cl.id);
        if (item) {
          item.clientName =
            `${cl.first_name || ''} ${cl.last_name || ''}`.trim() ||
            'Unknown Client';
          item.companyName = cl.company_name || undefined;
        }
      }
    }

    const sortedManagers = Array.from(managerMap.values())
      .sort((a, b) => b.salesUzs - a.salesUzs)
      .slice(0, limit);

    const sortedClients = Array.from(clientMap.values())
      .sort((a, b) => b.salesUzs - a.salesUzs)
      .slice(0, limit);

    const topManagers: TopPerformerManager[] = [];
    for (const m of sortedManagers) {
      const totalSales = await this.convertFromUzs(m.salesUzs, targetCurrency);
      const totalMargin = await this.convertFromUzs(
        m.salesUzs - m.costUzs,
        targetCurrency,
      );
      topManagers.push({
        employeeId: m.employeeId,
        employeeName: m.employeeName,
        departmentName: m.departmentName,
        totalSales,
        totalMargin,
        orderCount: m.orderCount,
      });
    }

    const topClients: TopPerformerClient[] = [];
    for (const c of sortedClients) {
      const totalSales = await this.convertFromUzs(c.salesUzs, targetCurrency);
      const totalMargin = await this.convertFromUzs(
        c.salesUzs - c.costUzs,
        targetCurrency,
      );
      topClients.push({
        clientId: c.clientId,
        clientName: c.clientName,
        companyName: c.companyName,
        totalSales,
        totalMargin,
        orderCount: c.orderCount,
      });
    }

    return {
      currency: targetCurrency,
      topManagers,
      topClients,
    };
  }

  // ==========================================
  // HELPER FUNCTIONS FOR TIMEFRAMES & BUCKETS (UTC DETERMINISTIC)
  // ==========================================

  /**
   * Resolves start date, end date, granularity and preceding equivalent range in UTC
   */
  async resolveDateRange(
    period: TimeframePeriod,
    query: {
      start_date?: string;
      end_date?: string;
      granularity?: Granularity;
    },
    refDate: Date = new Date(),
  ): Promise<DateRange> {
    let startDate: Date;
    let endDate: Date;
    let granularity: Granularity;
    let prevStartDate: Date | null = null;
    let prevEndDate: Date | null = null;

    const ref = new Date(refDate);

    // Extract UTC components from reference date
    const year = ref.getUTCFullYear();
    const month = ref.getUTCMonth();
    const day = ref.getUTCDate();

    switch (period) {
      case TimeframePeriod.ONE_DAY: {
        startDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
        granularity = query.granularity || Granularity.HOUR;

        prevStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
        prevEndDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
        break;
      }

      case TimeframePeriod.FIVE_DAYS: {
        startDate = new Date(Date.UTC(year, month, day - 4, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
        granularity = query.granularity || Granularity.DAY;

        const spanMs = endDate.getTime() - startDate.getTime();
        prevEndDate = new Date(startDate.getTime() - 1);
        prevStartDate = new Date(prevEndDate.getTime() - spanMs);
        break;
      }

      case TimeframePeriod.ONE_MONTH: {
        startDate = new Date(Date.UTC(year, month, day - 30, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
        granularity = query.granularity || Granularity.DAY;

        const spanMs = endDate.getTime() - startDate.getTime();
        prevEndDate = new Date(startDate.getTime() - 1);
        prevStartDate = new Date(prevEndDate.getTime() - spanMs);
        break;
      }

      case TimeframePeriod.SIX_MONTHS: {
        startDate = new Date(Date.UTC(year, month - 6, day, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
        granularity = query.granularity || Granularity.MONTH;

        const spanMs = endDate.getTime() - startDate.getTime();
        prevEndDate = new Date(startDate.getTime() - 1);
        prevStartDate = new Date(prevEndDate.getTime() - spanMs);
        break;
      }

      case TimeframePeriod.YTD: {
        startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
        granularity = query.granularity || Granularity.MONTH;

        prevStartDate = new Date(Date.UTC(year - 1, 0, 1, 0, 0, 0, 0));
        prevEndDate = new Date(Date.UTC(year - 1, month, day, 23, 59, 59, 999));
        break;
      }

      case TimeframePeriod.ONE_YEAR: {
        startDate = new Date(Date.UTC(year - 1, month, day, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
        granularity = query.granularity || Granularity.MONTH;

        prevStartDate = new Date(Date.UTC(year - 2, month, day, 0, 0, 0, 0));
        prevEndDate = new Date(startDate.getTime() - 1);
        break;
      }

      case TimeframePeriod.FIVE_YEARS: {
        startDate = new Date(Date.UTC(year - 5, month, day, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
        granularity = query.granularity || Granularity.YEAR;

        prevStartDate = new Date(Date.UTC(year - 10, month, day, 0, 0, 0, 0));
        prevEndDate = new Date(startDate.getTime() - 1);
        break;
      }

      case TimeframePeriod.MAX: {
        // Query earliest recorded date from DB
        const minRow = await this.knex('cargo_registrations')
          .min('created_at as min_date')
          .first();

        const earliest = minRow?.min_date ? new Date(minRow.min_date) : null;
        if (earliest && !isNaN(earliest.getTime())) {
          startDate = new Date(
            Date.UTC(
              earliest.getUTCFullYear(),
              earliest.getUTCMonth(),
              earliest.getUTCDate(),
              0,
              0,
              0,
              0,
            ),
          );
        } else {
          startDate = new Date(Date.UTC(year, month, day - 30, 0, 0, 0, 0));
        }
        endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

        // Auto granularity based on span
        const diffDays = Math.ceil(
          (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (query.granularity) {
          granularity = query.granularity;
        } else if (diffDays <= 2) {
          granularity = Granularity.HOUR;
        } else if (diffDays <= 60) {
          granularity = Granularity.DAY;
        } else if (diffDays <= 730) {
          granularity = Granularity.MONTH;
        } else {
          granularity = Granularity.YEAR;
        }

        prevStartDate = null;
        prevEndDate = null;
        break;
      }

      case TimeframePeriod.CUSTOM: {
        if (!query.start_date || !query.end_date) {
          throw new BadRequestException(
            'start_date and end_date are required when period is CUSTOM',
          );
        }
        startDate = new Date(query.start_date);
        endDate = new Date(query.end_date);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new BadRequestException(
            'Invalid start_date or end_date format',
          );
        }

        if (startDate > endDate) {
          throw new BadRequestException('start_date cannot be after end_date');
        }

        // Set to full day boundary if time portion was not specified
        if (!query.start_date.includes('T')) {
          startDate = new Date(
            Date.UTC(
              startDate.getUTCFullYear(),
              startDate.getUTCMonth(),
              startDate.getUTCDate(),
              0,
              0,
              0,
              0,
            ),
          );
        }
        if (!query.end_date.includes('T')) {
          endDate = new Date(
            Date.UTC(
              endDate.getUTCFullYear(),
              endDate.getUTCMonth(),
              endDate.getUTCDate(),
              23,
              59,
              59,
              999,
            ),
          );
        }

        const diffDays = Math.ceil(
          (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (query.granularity) {
          granularity = query.granularity;
        } else if (diffDays <= 2) {
          granularity = Granularity.HOUR;
        } else if (diffDays <= 60) {
          granularity = Granularity.DAY;
        } else if (diffDays <= 730) {
          granularity = Granularity.MONTH;
        } else {
          granularity = Granularity.YEAR;
        }

        const spanMs = endDate.getTime() - startDate.getTime();
        prevEndDate = new Date(startDate.getTime() - 1);
        prevStartDate = new Date(prevEndDate.getTime() - spanMs);
        break;
      }

      default:
        throw new BadRequestException(`Unsupported period: ${period}`);
    }

    return {
      startDate,
      endDate,
      granularity,
      prevStartDate,
      prevEndDate,
    };
  }

  /**
   * Fetch cargo registrations for a date range with query filters
   */
  private async fetchRegistrations(
    start: Date,
    end: Date,
    query: {
      employee_id?: string;
      client_id?: string;
      status?: string;
      cargo_type?: string;
    },
  ) {
    const dbQuery = this.knex('cargo_registrations')
      .select('*')
      .whereBetween('created_at', [start, end]);

    if (query.employee_id) {
      dbQuery.where('employee_id', query.employee_id);
    }
    if (query.client_id) {
      dbQuery.where('client_id', query.client_id);
    }
    if (query.status) {
      dbQuery.where('status', query.status);
    }
    if (query.cargo_type) {
      dbQuery.where('cargo_type', query.cargo_type);
    }

    return dbQuery;
  }

  /**
   * Continuous gap filling: generates UTC time bucket slots from start to end date
   */
  generateTimeBuckets(
    startDate: Date,
    endDate: Date,
    granularity: Granularity,
  ): Array<{
    bucketStart: Date;
    bucketEnd: Date;
    dateKey: string;
    label: string;
    sales: number;
    purchaseCost: number;
    margin: number;
    orderCount: number;
  }> {
    const buckets = [];
    const current = new Date(startDate.getTime());

    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    while (current <= endDate) {
      let bStart: Date;
      let bEnd: Date;
      let dateKey: string;
      let label: string;

      if (granularity === Granularity.HOUR) {
        bStart = new Date(current.getTime());
        bEnd = new Date(current.getTime() + 60 * 60 * 1000 - 1);
        if (bEnd > endDate) bEnd = new Date(endDate.getTime());

        const hh = String(bStart.getUTCHours()).padStart(2, '0');
        const yyyy = bStart.getUTCFullYear();
        const mm = String(bStart.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(bStart.getUTCDate()).padStart(2, '0');

        dateKey = `${yyyy}-${mm}-${dd} ${hh}:00`;
        label = `${hh}:00`;

        current.setUTCHours(current.getUTCHours() + 1);
      } else if (granularity === Granularity.DAY) {
        bStart = new Date(
          Date.UTC(
            current.getUTCFullYear(),
            current.getUTCMonth(),
            current.getUTCDate(),
            0,
            0,
            0,
            0,
          ),
        );
        bEnd = new Date(
          Date.UTC(
            current.getUTCFullYear(),
            current.getUTCMonth(),
            current.getUTCDate(),
            23,
            59,
            59,
            999,
          ),
        );
        if (bEnd > endDate) bEnd = new Date(endDate.getTime());

        const yyyy = bStart.getUTCFullYear();
        const mm = String(bStart.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(bStart.getUTCDate()).padStart(2, '0');
        dateKey = `${yyyy}-${mm}-${dd}`;
        label = `${dd} ${monthNames[bStart.getUTCMonth()]}`;

        current.setUTCDate(current.getUTCDate() + 1);
      } else if (granularity === Granularity.WEEK) {
        bStart = new Date(current.getTime());
        bEnd = new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
        if (bEnd > endDate) bEnd = new Date(endDate.getTime());

        const yyyy = bStart.getUTCFullYear();
        const mm = String(bStart.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(bStart.getUTCDate()).padStart(2, '0');
        dateKey = `${yyyy}-${mm}-${dd}`;
        label = `W-${dd} ${monthNames[bStart.getUTCMonth()]}`;

        current.setUTCDate(current.getUTCDate() + 7);
      } else if (granularity === Granularity.MONTH) {
        bStart = new Date(
          Date.UTC(
            current.getUTCFullYear(),
            current.getUTCMonth(),
            1,
            0,
            0,
            0,
            0,
          ),
        );
        bEnd = new Date(
          Date.UTC(
            current.getUTCFullYear(),
            current.getUTCMonth() + 1,
            0,
            23,
            59,
            59,
            999,
          ),
        );
        if (bEnd > endDate) bEnd = new Date(endDate.getTime());

        const yyyy = bStart.getUTCFullYear();
        const mm = String(bStart.getUTCMonth() + 1).padStart(2, '0');
        dateKey = `${yyyy}-${mm}`;
        label = `${monthNames[bStart.getUTCMonth()]} ${yyyy}`;

        current.setUTCMonth(current.getUTCMonth() + 1);
        current.setUTCDate(1);
      } else {
        // Granularity.YEAR
        bStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
        bEnd = new Date(
          Date.UTC(current.getUTCFullYear(), 11, 31, 23, 59, 59, 999),
        );
        if (bEnd > endDate) bEnd = new Date(endDate.getTime());

        const yyyy = bStart.getUTCFullYear();
        dateKey = `${yyyy}`;
        label = `${yyyy}`;

        current.setUTCFullYear(current.getUTCFullYear() + 1);
        current.setUTCMonth(0);
        current.setUTCDate(1);
      }

      buckets.push({
        bucketStart: bStart,
        bucketEnd: bEnd,
        dateKey,
        label,
        sales: 0,
        purchaseCost: 0,
        margin: 0,
        orderCount: 0,
      });
    }

    return buckets;
  }

  /**
   * Matches records into generated buckets
   */
  private async populateBucketsWithData(
    buckets: Array<{
      bucketStart: Date;
      bucketEnd: Date;
      sales: number;
      purchaseCost: number;
      margin: number;
      orderCount: number;
    }>,
    records: any[],
    rates?: Record<Currency, any>,
  ) {
    for (const record of records) {
      const recDate = new Date(record.created_at || record.confirmed_date);
      if (isNaN(recDate.getTime())) continue;

      const { sellPriceUzs, purchasePriceUzs } =
        await this.convertRecordPricesToUzs(record, rates);
      const margin = sellPriceUzs - purchasePriceUzs;

      // Find target bucket
      const bucket = buckets.find(
        (b) => recDate >= b.bucketStart && recDate <= b.bucketEnd,
      );

      if (bucket) {
        bucket.sales += sellPriceUzs;
        bucket.purchaseCost += purchasePriceUzs;
        bucket.margin += margin;
        bucket.orderCount += 1;
      }
    }
  }
}
