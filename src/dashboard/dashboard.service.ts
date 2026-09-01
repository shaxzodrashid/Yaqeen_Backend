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
  TransportType,
  SalesProgressResponse,
  TimeframeMeta,
  TimeframeSummary,
  TimeBucketDataPoint,
  DashboardSummaryKpi,
  CargoDistributionResponse,
  CargoDistributionItem,
  TransportDistributionItem,
  TopPerformersResponse,
  TopPerformerManager,
  TopPerformerClient,
  RouteAnalyticsResponse,
  RouteDistributionItem,
  CountryDistributionItem,
  DebtSummaryKpi,
  DebtorClientItem,
  CreditorCarrierItem,
  DeliveryEfficiencyKpi,
  StatusBreakdownItem,
  RouteTransitTimeItem,
  PeriodKpiMetric,
} from './dashboard.types';
import {
  SalesProgressQueryDto,
  DashboardSummaryQueryDto,
  TopPerformersQueryDto,
  RouteAnalyticsQueryDto,
  DebtSummaryQueryDto,
  DeliveryEfficiencyQueryDto,
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

  /**
   * Classify container/cargo type into high-level transport categories
   */
  classifyTransportType(
    containerType?: string | null,
    cargoType?: string | null,
    truckOrContainerId?: string | null,
  ): TransportType {
    const cType = (containerType || '').toLowerCase().trim();
    const id = (truckOrContainerId || '').toLowerCase().trim();

    // 1. Air transport check
    if (
      cType.includes('air') ||
      cType.includes('avia') ||
      cType.includes('plane') ||
      cType.includes('flight') ||
      id.includes('air')
    ) {
      return TransportType.AIR;
    }

    // 2. Railway check (standard container codes often used on rail/intermodal)
    if (
      cType.includes('rail') ||
      cType.includes('train') ||
      cType.includes('poezd') ||
      cType.includes('temir') ||
      cType.includes('20gp') ||
      cType.includes('20hq') ||
      cType.includes('40gp') ||
      cType.includes('40hq') ||
      cType.includes('40hc') ||
      cType.includes('45hq') ||
      cType.includes('45hc') ||
      cType.includes('40 gp') ||
      cType.includes('40 hc') ||
      cType.includes('45 hc')
    ) {
      return TransportType.RAILWAY;
    }

    // 3. Sea / Maritime check
    if (
      cType.includes('sea') ||
      cType.includes('ship') ||
      cType.includes('vessel') ||
      cType.includes('ocean') ||
      cType.includes('dengiz') ||
      cType.includes('marine') ||
      cType.includes('port')
    ) {
      return TransportType.SEA;
    }

    // 4. Auto / Truck check
    if (
      cType.includes('m3') ||
      cType.includes('cbm') ||
      cType.includes('fura') ||
      cType.includes('truck') ||
      cType.includes('auto') ||
      cType.includes('avto') ||
      cType.includes('ref') ||
      (cargoType &&
        (cargoType.toUpperCase() === 'FTL' ||
          cargoType.toUpperCase() === 'LTL'))
    ) {
      return TransportType.AUTO;
    }

    if (cType) {
      return TransportType.AUTO;
    }

    return TransportType.OTHER;
  }

  /**
   * Get human-readable label for transport type
   */
  getTransportTypeName(type: TransportType): string {
    switch (type) {
      case TransportType.AUTO:
        return 'Avtotransport (Auto / Truck)';
      case TransportType.RAILWAY:
        return "Temir yo'l (Railway / Train)";
      case TransportType.AIR:
        return 'Havo transporti (Air Freight)';
      case TransportType.SEA:
        return 'Dengiz transporti (Sea / Maritime)';
      case TransportType.OTHER:
      default:
        return 'Boshqa (Other)';
    }
  }

  private getCurrencyMultipliers(
    rates?: Record<Currency, any>,
  ): Record<string, number> {
    const multipliers: Record<string, number> = {
      [Currency.UZS]: 1,
      [Currency.USD]: 12850,
      [Currency.RUB]: 145,
      [Currency.RMB]: 1815,
      [Currency.CNY]: 1815,
    };
    if (rates) {
      for (const key of Object.keys(rates)) {
        const item = rates[key as Currency];
        if (item && item.nominal && item.rate) {
          multipliers[key] = Number(item.rate) / Number(item.nominal);
        }
      }
    }
    return multipliers;
  }

  private convertFromUzsFast(
    amountUzs: number,
    targetCurrency: Currency,
    multipliers: Record<string, number>,
  ): number {
    if (targetCurrency === Currency.UZS) {
      return Math.round(amountUzs * 100) / 100;
    }
    const targetUnitRate = multipliers[targetCurrency] || 1;
    return Math.round((amountUzs / targetUnitRate) * 100) / 100;
  }

  private findBucketIndex(
    recTime: number,
    buckets: Array<{ bucketStart: Date; bucketEnd: Date }>,
  ): number {
    let low = 0;
    let high = buckets.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const b = buckets[mid];
      const start = b.bucketStart.getTime();
      const end = b.bucketEnd.getTime();
      if (recTime >= start && recTime <= end) {
        return mid;
      }
      if (recTime < start) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    return -1;
  }

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
    const multipliers = this.getCurrencyMultipliers(rates);

    // 3. Generate continuous gap-filled time buckets
    const buckets: Array<{
      bucketStart: Date;
      bucketEnd: Date;
      dateKey: string;
      label: string;
      sales: number;
      purchaseCost: number;
      operationalExpenses: number;
      margin: number;
      orderCount: number;
    }> = this.generateTimeBuckets(
      range.startDate,
      range.endDate,
      range.granularity,
    ).map((b) => ({
      ...b,
      operationalExpenses: 0,
    }));

    // 4. Single-pass high-performance aggregation for cargo registrations
    let totalSalesUzs = 0;
    let totalPurchaseCostUzs = 0;
    let totalMarginUzs = 0;
    let completedOrders = 0;
    let inTransitOrders = 0;

    for (let i = 0; i < currentRecords.length; i++) {
      const r = currentRecords[i];
      const sellPrice = Number(r.sell_price) || 0;
      const purchasePrice = Number(r.purchase_price) || 0;
      const sellCurr = (r.sell_currency as Currency) || Currency.UZS;
      const purchaseCurr = (r.purchase_currency as Currency) || Currency.UZS;

      const sellMultiplier = multipliers[sellCurr] ?? 1;
      const purchaseMultiplier = multipliers[purchaseCurr] ?? 1;

      const sellPriceUzs = Math.round(sellPrice * sellMultiplier * 100) / 100;
      const purchasePriceUzs =
        Math.round(purchasePrice * purchaseMultiplier * 100) / 100;
      const netProfitUzs = sellPriceUzs - purchasePriceUzs;

      totalSalesUzs += sellPriceUzs;
      totalPurchaseCostUzs += purchasePriceUzs;
      totalMarginUzs += netProfitUzs;

      const st = (r.status || '').toLowerCase();
      if (st === 'completed' || st === 'arrived' || st === 'delivered') {
        completedOrders++;
      } else if (st === 'on the way' || st === 'in transit') {
        inTransitOrders++;
      }

      // Fast binary search bucket slotting
      const rawDate = r.confirmed_date || r.created_at;
      let recDate: Date;
      if (typeof rawDate === 'string') {
        if (!rawDate.includes('T') && rawDate.length === 10) {
          const [y, m, d] = rawDate.split('-').map(Number);
          recDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
        } else {
          recDate = new Date(rawDate);
        }
      } else if (rawDate instanceof Date) {
        recDate = new Date(
          Date.UTC(
            rawDate.getUTCFullYear(),
            rawDate.getUTCMonth(),
            rawDate.getUTCDate(),
            rawDate.getUTCHours(),
            rawDate.getUTCMinutes(),
            rawDate.getUTCSeconds(),
          ),
        );
      } else {
        recDate = new Date(rawDate);
      }

      const recTime = recDate.getTime();
      if (!isNaN(recTime)) {
        const bIdx = this.findBucketIndex(recTime, buckets);
        if (bIdx !== -1) {
          const b = buckets[bIdx];
          b.sales += sellPriceUzs;
          b.purchaseCost += purchasePriceUzs;
          b.margin += netProfitUzs;
          b.orderCount += 1;
        }
      }
    }

    // 5. Fetch operational expenses if enabled
    let totalOperationalExpensesUzs = 0;
    if (query.include_expenses !== false) {
      try {
        const expenseRecords = await this.fetchExpenses(
          range.startDate,
          range.endDate,
          query,
        );
        for (let i = 0; i < expenseRecords.length; i++) {
          const exp = expenseRecords[i];
          const amount = Number(exp.amount) || 0;
          const curr = (exp.currency as Currency) || Currency.UZS;
          const expUzs =
            Math.round(amount * (multipliers[curr] ?? 1) * 100) / 100;
          totalOperationalExpensesUzs += expUzs;

          const rawExpDate = exp.expense_date || exp.created_at;
          let expDate: Date;
          if (typeof rawExpDate === 'string') {
            if (!rawExpDate.includes('T') && rawExpDate.length === 10) {
              const [y, m, d] = rawExpDate.split('-').map(Number);
              expDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
            } else {
              expDate = new Date(rawExpDate);
            }
          } else if (rawExpDate instanceof Date) {
            expDate = new Date(
              Date.UTC(
                rawExpDate.getUTCFullYear(),
                rawExpDate.getUTCMonth(),
                rawExpDate.getUTCDate(),
                0,
                0,
                0,
                0,
              ),
            );
          } else {
            expDate = new Date(rawExpDate);
          }

          const expTime = expDate.getTime();
          if (!isNaN(expTime)) {
            const bIdx = this.findBucketIndex(expTime, buckets);
            if (bIdx !== -1) {
              buckets[bIdx].operationalExpenses += expUzs;
            }
          }
        }
      } catch {
        // Safe fallback if expenses table is not queryable
      }
    }

    const totalOrders = currentRecords.length;
    const averageOrderValueUzs =
      totalOrders > 0 ? totalMarginUzs / totalOrders : 0;
    const pendingOrders = totalOrders - completedOrders;
    const marginPercentage =
      totalSalesUzs > 0 ? (totalMarginUzs / totalSalesUzs) * 100 : 0;
    const totalExpensesUzs = totalPurchaseCostUzs + totalOperationalExpensesUzs;
    const totalNetProfitUzs = totalSalesUzs - totalExpensesUzs;

    // 6. Calculate cumulative trajectory and format data points converted to target currency
    let runningSalesUzs = 0;
    let runningExpensesUzs = 0;
    let runningMarginUzs = 0;
    let runningNetProfitUzs = 0;

    const dataPoints: TimeBucketDataPoint[] = new Array(buckets.length);
    for (let idx = 0; idx < buckets.length; idx++) {
      const bucket = buckets[idx];
      const bucketTotalExpensesUzs =
        bucket.purchaseCost + bucket.operationalExpenses;
      const bucketNetProfitUzs = bucket.sales - bucketTotalExpensesUzs;

      runningSalesUzs += bucket.sales;
      runningExpensesUzs += bucketTotalExpensesUzs;
      runningMarginUzs += bucket.margin;
      runningNetProfitUzs += bucketNetProfitUzs;

      dataPoints[idx] = {
        index: idx,
        bucketStart: bucket.bucketStart.toISOString(),
        bucketEnd: bucket.bucketEnd.toISOString(),
        dateKey: bucket.dateKey,
        label: bucket.label,
        sales: this.convertFromUzsFast(
          bucket.sales,
          targetCurrency,
          multipliers,
        ),
        purchaseCost: this.convertFromUzsFast(
          bucket.purchaseCost,
          targetCurrency,
          multipliers,
        ),
        operationalExpenses: this.convertFromUzsFast(
          bucket.operationalExpenses,
          targetCurrency,
          multipliers,
        ),
        totalExpenses: this.convertFromUzsFast(
          bucketTotalExpensesUzs,
          targetCurrency,
          multipliers,
        ),
        margin: this.convertFromUzsFast(
          bucket.margin,
          targetCurrency,
          multipliers,
        ),
        netProfit: this.convertFromUzsFast(
          bucketNetProfitUzs,
          targetCurrency,
          multipliers,
        ),
        orderCount: bucket.orderCount,
        cumulativeSales: this.convertFromUzsFast(
          runningSalesUzs,
          targetCurrency,
          multipliers,
        ),
        cumulativeExpenses: this.convertFromUzsFast(
          runningExpensesUzs,
          targetCurrency,
          multipliers,
        ),
        cumulativeMargin: this.convertFromUzsFast(
          runningMarginUzs,
          targetCurrency,
          multipliers,
        ),
        cumulativeNetProfit: this.convertFromUzsFast(
          runningNetProfitUzs,
          targetCurrency,
          multipliers,
        ),
      };
    }

    // 7. Calculate growth rate against preceding period if available
    let growthRateSales: number | null = null;
    let growthRateMargin: number | null = null;
    let growthRateNetProfit: number | null = null;

    if (range.prevStartDate && range.prevEndDate) {
      const prevRecords = await this.fetchRegistrations(
        range.prevStartDate,
        range.prevEndDate,
        query,
      );
      let prevSalesUzs = 0;
      let prevCostUzs = 0;
      for (let i = 0; i < prevRecords.length; i++) {
        const r = prevRecords[i];
        const sellPrice = Number(r.sell_price) || 0;
        const purchasePrice = Number(r.purchase_price) || 0;
        const sellCurr = (r.sell_currency as Currency) || Currency.UZS;
        const purchaseCurr = (r.purchase_currency as Currency) || Currency.UZS;

        const sellMultiplier = multipliers[sellCurr] ?? 1;
        const purchaseMultiplier = multipliers[purchaseCurr] ?? 1;

        prevSalesUzs += Math.round(sellPrice * sellMultiplier * 100) / 100;
        prevCostUzs +=
          Math.round(purchasePrice * purchaseMultiplier * 100) / 100;
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

      growthRateNetProfit = growthRateMargin;
    }

    const meta: TimeframeMeta = {
      period,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
      granularity: range.granularity,
      totalBuckets: dataPoints.length,
      currency: targetCurrency,
    };

    const totalSales = this.convertFromUzsFast(
      totalSalesUzs,
      targetCurrency,
      multipliers,
    );
    const totalPurchaseCost = this.convertFromUzsFast(
      totalPurchaseCostUzs,
      targetCurrency,
      multipliers,
    );
    const totalOperationalExpenses = this.convertFromUzsFast(
      totalOperationalExpensesUzs,
      targetCurrency,
      multipliers,
    );
    const totalExpenses = this.convertFromUzsFast(
      totalExpensesUzs,
      targetCurrency,
      multipliers,
    );
    const totalMargin = this.convertFromUzsFast(
      totalMarginUzs,
      targetCurrency,
      multipliers,
    );
    const totalNetProfit = this.convertFromUzsFast(
      totalNetProfitUzs,
      targetCurrency,
      multipliers,
    );
    const averageOrderValue = this.convertFromUzsFast(
      averageOrderValueUzs,
      targetCurrency,
      multipliers,
    );

    const summary: TimeframeSummary = {
      totalSales,
      totalPurchaseCost,
      totalOperationalExpenses,
      totalExpenses,
      totalMargin,
      totalNetProfit,
      marginPercentage: Math.round(marginPercentage * 100) / 100,
      totalOrders,
      averageOrderValue,
      completedOrders,
      pendingOrders,
      inTransitOrders,
      growthRateSales,
      growthRateMargin,
      growthRateNetProfit,
    };

    return {
      meta,
      summary,
      dataPoints,
    };
  }

  /**
   * Executive Dashboard Summary KPI Endpoint (Cards & Block Overview)
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
    const multipliers = this.getCurrencyMultipliers(rates);

    let totalSalesUzs = 0;
    let totalPurchaseCostUzs = 0;
    let completedOrders = 0;
    let inTransitOrders = 0;
    let waitingOrders = 0;

    const statusCounts: Record<string, number> = {
      waiting: 0,
      station: 0,
      on_the_way: 0,
      on_the_border: 0,
      reload: 0,
      arrived: 0,
    };

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const sellPrice = Number(r.sell_price) || 0;
      const purchasePrice = Number(r.purchase_price) || 0;
      const sellCurr = (r.sell_currency as Currency) || Currency.UZS;
      const purchaseCurr = (r.purchase_currency as Currency) || Currency.UZS;

      const sellUzs = sellPrice * (multipliers[sellCurr] ?? 1);
      const purchaseUzs = purchasePrice * (multipliers[purchaseCurr] ?? 1);

      totalSalesUzs += sellUzs;
      totalPurchaseCostUzs += purchaseUzs;

      const rawStatus = (r.status || 'Waiting').toLowerCase();
      if (
        rawStatus === 'arrived' ||
        rawStatus === 'completed' ||
        rawStatus === 'delivered'
      ) {
        completedOrders++;
        statusCounts.arrived = (statusCounts.arrived || 0) + 1;
      } else if (rawStatus === 'on the way' || rawStatus === 'in transit') {
        inTransitOrders++;
        statusCounts.on_the_way = (statusCounts.on_the_way || 0) + 1;
      } else if (rawStatus === 'station' || rawStatus === 'at station') {
        waitingOrders++;
        statusCounts.station = (statusCounts.station || 0) + 1;
      } else if (rawStatus === 'on the border' || rawStatus === 'border') {
        waitingOrders++;
        statusCounts.on_the_border = (statusCounts.on_the_border || 0) + 1;
      } else if (rawStatus === 'reload') {
        waitingOrders++;
        statusCounts.reload = (statusCounts.reload || 0) + 1;
      } else {
        waitingOrders++;
        statusCounts.waiting = (statusCounts.waiting || 0) + 1;
      }
    }

    const totalMarginUzs = totalSalesUzs - totalPurchaseCostUzs;
    const marginPercentage =
      totalSalesUzs > 0 ? (totalMarginUzs / totalSalesUzs) * 100 : 0;

    const totalOrders = records.length;
    const activeOrders = inTransitOrders + waitingOrders;
    const averageOrderValueUzs =
      totalOrders > 0 ? totalMarginUzs / totalOrders : 0;

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
        const sellPrice = Number(r.sell_price) || 0;
        const purchasePrice = Number(r.purchase_price) || 0;
        const sellCurr = (r.sell_currency as Currency) || Currency.UZS;
        const purchaseCurr = (r.purchase_currency as Currency) || Currency.UZS;

        prevSalesUzs += sellPrice * (multipliers[sellCurr] ?? 1);
        prevCostUzs += purchasePrice * (multipliers[purchaseCurr] ?? 1);
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

    // Concurrently compute Monthly and Yearly KPIs, Debt summary, and Delivery efficiency
    const [monthlyKpi, yearlyKpi, debtSummary, deliveryEfficiency] =
      await Promise.all([
        this.getMonthlyKpi(targetCurrency, rates, multipliers, query, refDate),
        this.getYearlyKpi(targetCurrency, rates, multipliers, query, refDate),
        this.computeDebtSummary(records, targetCurrency, multipliers),
        Promise.resolve(this.computeDeliveryEfficiency(records)),
      ]);

    const totalSales = this.convertFromUzsFast(
      totalSalesUzs,
      targetCurrency,
      multipliers,
    );
    const totalPurchaseCost = this.convertFromUzsFast(
      totalPurchaseCostUzs,
      targetCurrency,
      multipliers,
    );
    const totalMargin = this.convertFromUzsFast(
      totalMarginUzs,
      targetCurrency,
      multipliers,
    );
    const averageOrderValue = this.convertFromUzsFast(
      averageOrderValueUzs,
      targetCurrency,
      multipliers,
    );

    return {
      currency: targetCurrency,
      totalSales,
      totalPurchaseCost,
      totalMargin,
      netProfit: totalMargin,
      marginPercentage: Math.round(marginPercentage * 100) / 100,
      totalOrders,
      activeOrders,
      inTransitOrders,
      waitingOrders,
      completedOrders,
      averageOrderValue,
      totalVolume: Math.round(totalVolume * 100) / 100,
      totalWeight: Math.round(totalWeight * 100) / 100,
      ltlOrderCount,
      ftlOrderCount,
      salesGrowthVsPriorPeriod,
      marginGrowthVsPriorPeriod,
      monthly: monthlyKpi,
      yearly: yearlyKpi,
      debtSummary,
      deliveryEfficiency,
      statusCounts,
    };
  }

  /**
   * Donut / Pie Chart Distribution Endpoint (Transport Types, Cargo Types & Statuses)
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
    const multipliers = this.getCurrencyMultipliers(rates);

    const totalCount = records.length || 1;

    // 1. Transport Type distribution
    const transportTypeDistribution = this.computeTransportDistribution(
      records,
      targetCurrency,
      multipliers,
    );

    // 2. Cargo Type distribution (FTL vs LTL)
    const cargoTypeMap = new Map<
      string,
      { count: number; totalSalesUzs: number }
    >();
    // 3. Status distribution
    const statusMap = new Map<
      string,
      { count: number; totalSalesUzs: number }
    >();

    for (const r of records) {
      const typeKey = (r.cargo_type || 'Unknown').toUpperCase();
      const statusKey = r.status || 'Waiting';

      const sellPrice = Number(r.sell_price) || 0;
      const sellCurr = (r.sell_currency as Currency) || Currency.UZS;
      const sellPriceUzs = sellPrice * (multipliers[sellCurr] ?? 1);

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
      const totalSales = this.convertFromUzsFast(
        val.totalSalesUzs,
        targetCurrency,
        multipliers,
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
      const totalSales = this.convertFromUzsFast(
        val.totalSalesUzs,
        targetCurrency,
        multipliers,
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
      transportTypeDistribution,
      cargoTypeDistribution,
      statusDistribution,
    };
  }

  /**
   * Route and Country Intelligence Analytics Endpoint (Pie & Bar Charts)
   */
  async getRouteAnalytics(
    query: RouteAnalyticsQueryDto,
    refDate: Date = new Date(),
  ): Promise<RouteAnalyticsResponse> {
    const period = query.period || TimeframePeriod.ONE_MONTH;
    const limit = query.limit || 10;
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
    const multipliers = this.getCurrencyMultipliers(rates);

    return this.computeRouteAnalytics(
      records,
      targetCurrency,
      multipliers,
      limit,
    );
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
    const multipliers = this.getCurrencyMultipliers(rates);

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
        volume: number;
        weight: number;
        completedOrdersCount: number;
        activeOrdersCount: number;
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
        volume: number;
        weight: number;
      }
    >();

    for (const r of records) {
      const sellPrice = Number(r.sell_price) || 0;
      const purchasePrice = Number(r.purchase_price) || 0;
      const sellCurr = (r.sell_currency as Currency) || Currency.UZS;
      const purchaseCurr = (r.purchase_currency as Currency) || Currency.UZS;

      const sellPriceUzs = sellPrice * (multipliers[sellCurr] ?? 1);
      const purchasePriceUzs = purchasePrice * (multipliers[purchaseCurr] ?? 1);
      const vol = Number(r.volume || 0);
      const wt = Number(r.weight || 0);

      const st = (r.status || '').toLowerCase();
      const isCompleted =
        st === 'completed' || st === 'arrived' || st === 'delivered';

      if (r.employee_id) {
        const emp = managerMap.get(r.employee_id) || {
          employeeId: r.employee_id,
          employeeName: 'Unknown Manager',
          departmentName: undefined,
          salesUzs: 0,
          costUzs: 0,
          orderCount: 0,
          volume: 0,
          weight: 0,
          completedOrdersCount: 0,
          activeOrdersCount: 0,
        };
        emp.salesUzs += sellPriceUzs;
        emp.costUzs += purchasePriceUzs;
        emp.orderCount += 1;
        emp.volume += vol;
        emp.weight += wt;
        if (isCompleted) {
          emp.completedOrdersCount += 1;
        } else {
          emp.activeOrdersCount += 1;
        }
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
          volume: 0,
          weight: 0,
        };
        cl.salesUzs += sellPriceUzs;
        cl.costUzs += purchasePriceUzs;
        cl.orderCount += 1;
        cl.volume += vol;
        cl.weight += wt;
        clientMap.set(r.client_id, cl);
      }
    }

    // Enhance manager & client names from DB
    const managerIds = Array.from(managerMap.keys());
    if (managerIds.length > 0) {
      try {
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
      } catch {
        // Safe fallback
      }
    }

    const clientIds = Array.from(clientMap.keys());
    if (clientIds.length > 0) {
      try {
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
      } catch {
        // Safe fallback
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
      const totalSales = this.convertFromUzsFast(
        m.salesUzs,
        targetCurrency,
        multipliers,
      );
      const totalPurchaseCost = this.convertFromUzsFast(
        m.costUzs,
        targetCurrency,
        multipliers,
      );
      const totalMargin = this.convertFromUzsFast(
        m.salesUzs - m.costUzs,
        targetCurrency,
        multipliers,
      );
      const averageOrderValue =
        m.orderCount > 0
          ? Math.round((totalSales / m.orderCount) * 100) / 100
          : 0;
      const conversionRate =
        m.orderCount > 0
          ? Math.round((m.completedOrdersCount / m.orderCount) * 10000) / 100
          : 0;

      topManagers.push({
        employeeId: m.employeeId,
        employeeName: m.employeeName,
        departmentName: m.departmentName,
        totalSales,
        totalPurchaseCost,
        totalMargin,
        orderCount: m.orderCount,
        totalVolume: Math.round(m.volume * 100) / 100,
        totalWeight: Math.round(m.weight * 100) / 100,
        averageOrderValue,
        completedOrdersCount: m.completedOrdersCount,
        activeOrdersCount: m.activeOrdersCount,
        conversionRate,
      });
    }

    const topClients: TopPerformerClient[] = [];
    for (const c of sortedClients) {
      const totalSales = this.convertFromUzsFast(
        c.salesUzs,
        targetCurrency,
        multipliers,
      );
      const totalPurchaseCost = this.convertFromUzsFast(
        c.costUzs,
        targetCurrency,
        multipliers,
      );
      const totalMargin = this.convertFromUzsFast(
        c.salesUzs - c.costUzs,
        targetCurrency,
        multipliers,
      );
      const averageOrderValue =
        c.orderCount > 0
          ? Math.round((totalSales / c.orderCount) * 100) / 100
          : 0;

      topClients.push({
        clientId: c.clientId,
        clientName: c.clientName,
        companyName: c.companyName,
        totalSales,
        totalPurchaseCost,
        totalMargin,
        orderCount: c.orderCount,
        totalVolume: Math.round(c.volume * 100) / 100,
        totalWeight: Math.round(c.weight * 100) / 100,
        averageOrderValue,
      });
    }

    return {
      currency: targetCurrency,
      topManagers,
      topClients,
    };
  }

  /**
   * Delivery Efficiency and Transit Duration Analytics Endpoint
   */
  async getDeliveryEfficiency(
    query: DeliveryEfficiencyQueryDto,
    refDate: Date = new Date(),
  ): Promise<DeliveryEfficiencyKpi> {
    const period = query.period || TimeframePeriod.ONE_MONTH;
    const range = await this.resolveDateRange(period, query, refDate);

    const records = await this.fetchRegistrations(
      range.startDate,
      range.endDate,
      query,
    );

    return this.computeDeliveryEfficiency(records);
  }

  /**
   * Accounts Receivable (Debitor) and Accounts Payable (Kreditor) Balance Summary Endpoint
   */
  async getDebtSummary(
    query: DebtSummaryQueryDto,
    refDate: Date = new Date(),
  ): Promise<DebtSummaryKpi> {
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
    const multipliers = this.getCurrencyMultipliers(rates);

    return this.computeDebtSummary(records, targetCurrency, multipliers);
  }

  // ==========================================
  // HELPER SUB-ENGINES & ANALYTICS CALCULATORS
  // ==========================================

  /**
   * Monthly KPI block calculator (revenue, net profit, growth vs previous month)
   */
  private async getMonthlyKpi(
    targetCurrency: Currency,
    rates: any,
    multipliers: Record<string, number>,
    query: DashboardSummaryQueryDto,
    refDate: Date = new Date(),
  ): Promise<PeriodKpiMetric> {
    const ref = new Date(refDate);
    const year = ref.getUTCFullYear();
    const month = ref.getUTCMonth();
    const day = ref.getUTCDate();

    const curStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const curEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

    const prevMonthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const prevEndDay = Math.min(day, prevMonthDays);
    const prevStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const prevEnd = new Date(
      Date.UTC(year, month - 1, prevEndDay, 23, 59, 59, 999),
    );

    return this.computePeriodKpi(
      curStart,
      curEnd,
      prevStart,
      prevEnd,
      targetCurrency,
      multipliers,
      query,
    );
  }

  /**
   * Yearly KPI block calculator (revenue, net profit, growth vs previous year)
   */
  private async getYearlyKpi(
    targetCurrency: Currency,
    rates: any,
    multipliers: Record<string, number>,
    query: DashboardSummaryQueryDto,
    refDate: Date = new Date(),
  ): Promise<PeriodKpiMetric> {
    const ref = new Date(refDate);
    const year = ref.getUTCFullYear();
    const month = ref.getUTCMonth();
    const day = ref.getUTCDate();

    const curStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const curEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

    const prevStart = new Date(Date.UTC(year - 1, 0, 1, 0, 0, 0, 0));
    const prevEnd = new Date(Date.UTC(year - 1, month, day, 23, 59, 59, 999));

    return this.computePeriodKpi(
      curStart,
      curEnd,
      prevStart,
      prevEnd,
      targetCurrency,
      multipliers,
      query,
    );
  }

  private async computePeriodKpi(
    curStart: Date,
    curEnd: Date,
    prevStart: Date,
    prevEnd: Date,
    targetCurrency: Currency,
    multipliers: Record<string, number>,
    query: DashboardSummaryQueryDto,
  ): Promise<PeriodKpiMetric> {
    const [curRecords, prevRecords] = await Promise.all([
      this.fetchRegistrations(curStart, curEnd, query),
      this.fetchRegistrations(prevStart, prevEnd, query),
    ]);

    let curSalesUzs = 0;
    let curCostUzs = 0;
    for (let i = 0; i < curRecords.length; i++) {
      const r = curRecords[i];
      const sPrice = Number(r.sell_price) || 0;
      const pPrice = Number(r.purchase_price) || 0;
      const sCurr = (r.sell_currency as Currency) || Currency.UZS;
      const pCurr = (r.purchase_currency as Currency) || Currency.UZS;
      curSalesUzs += sPrice * (multipliers[sCurr] ?? 1);
      curCostUzs += pPrice * (multipliers[pCurr] ?? 1);
    }

    let prevSalesUzs = 0;
    let prevCostUzs = 0;
    for (let i = 0; i < prevRecords.length; i++) {
      const r = prevRecords[i];
      const sPrice = Number(r.sell_price) || 0;
      const pPrice = Number(r.purchase_price) || 0;
      const sCurr = (r.sell_currency as Currency) || Currency.UZS;
      const pCurr = (r.purchase_currency as Currency) || Currency.UZS;
      prevSalesUzs += sPrice * (multipliers[sCurr] ?? 1);
      prevCostUzs += pPrice * (multipliers[pCurr] ?? 1);
    }

    const curMarginUzs = curSalesUzs - curCostUzs;
    const prevMarginUzs = prevSalesUzs - prevCostUzs;

    let revenueGrowthRate: number | null = null;
    if (prevSalesUzs > 0) {
      revenueGrowthRate =
        Math.round(((curSalesUzs - prevSalesUzs) / prevSalesUzs) * 10000) / 100;
    } else if (curSalesUzs > 0) {
      revenueGrowthRate = 100;
    }

    let netProfitGrowthRate: number | null = null;
    if (prevMarginUzs > 0) {
      netProfitGrowthRate =
        Math.round(((curMarginUzs - prevMarginUzs) / prevMarginUzs) * 10000) /
        100;
    } else if (curMarginUzs > 0) {
      netProfitGrowthRate = 100;
    }

    const revenue = this.convertFromUzsFast(
      curSalesUzs,
      targetCurrency,
      multipliers,
    );
    const purchaseCost = this.convertFromUzsFast(
      curCostUzs,
      targetCurrency,
      multipliers,
    );
    const netProfit = this.convertFromUzsFast(
      curMarginUzs,
      targetCurrency,
      multipliers,
    );
    const marginPercentage =
      curSalesUzs > 0
        ? Math.round((curMarginUzs / curSalesUzs) * 10000) / 100
        : 0;

    return {
      revenue,
      purchaseCost,
      netProfit,
      marginPercentage,
      revenueGrowthRate,
      netProfitGrowthRate,
      orderCount: curRecords.length,
    };
  }

  /**
   * Get transport types array for a cargo registration record
   */
  getTransportTypes(record: any): TransportType[] {
    if (
      record.transport_types &&
      Array.isArray(record.transport_types) &&
      record.transport_types.length > 0
    ) {
      return record.transport_types as TransportType[];
    }
    return [
      this.classifyTransportType(
        record.container_type,
        record.cargo_type,
        record.container_truck_id,
      ),
    ];
  }

  /**
   * Transport Type distribution calculation (Auto, Railway, Air, Sea)
   */
  private computeTransportDistribution(
    records: any[],
    targetCurrency: Currency,
    multipliers: Record<string, number>,
  ): TransportDistributionItem[] {
    const typeMap = new Map<
      TransportType,
      {
        count: number;
        salesUzs: number;
        costUzs: number;
        volume: number;
        weight: number;
      }
    >();

    for (const t of [
      TransportType.AUTO,
      TransportType.RAILWAY,
      TransportType.AIR,
      TransportType.SEA,
      TransportType.OTHER,
    ]) {
      typeMap.set(t, {
        count: 0,
        salesUzs: 0,
        costUzs: 0,
        volume: 0,
        weight: 0,
      });
    }

    const totalCount = records.length || 1;

    for (const r of records) {
      const tTypes = this.getTransportTypes(r);
      const sPrice = Number(r.sell_price) || 0;
      const pPrice = Number(r.purchase_price) || 0;
      const sCurr = (r.sell_currency as Currency) || Currency.UZS;
      const pCurr = (r.purchase_currency as Currency) || Currency.UZS;
      const sUzs = sPrice * (multipliers[sCurr] ?? 1);
      const pUzs = pPrice * (multipliers[pCurr] ?? 1);
      const vol = Number(r.volume) || 0;
      const wt = Number(r.weight) || 0;

      for (const tType of tTypes) {
        const item = typeMap.get(tType);
        if (item) {
          item.count += 1;
          item.salesUzs += sUzs;
          item.costUzs += pUzs;
          item.volume += vol;
          item.weight += wt;
        }
      }
    }

    const result: TransportDistributionItem[] = [];
    for (const [tType, val] of typeMap.entries()) {
      if (
        val.count > 0 ||
        tType === TransportType.AUTO ||
        tType === TransportType.RAILWAY ||
        tType === TransportType.AIR ||
        tType === TransportType.SEA
      ) {
        result.push({
          type: tType,
          name: this.getTransportTypeName(tType),
          count: val.count,
          percentage: Math.round((val.count / totalCount) * 10000) / 100,
          totalSales: this.convertFromUzsFast(
            val.salesUzs,
            targetCurrency,
            multipliers,
          ),
          totalMargin: this.convertFromUzsFast(
            val.salesUzs - val.costUzs,
            targetCurrency,
            multipliers,
          ),
          totalVolume: Math.round(val.volume * 100) / 100,
          totalWeight: Math.round(val.weight * 100) / 100,
        });
      }
    }

    return result.sort((a, b) => b.count - a.count);
  }

  /**
   * Route & Country intelligence analytics calculator
   */
  private computeRouteAnalytics(
    records: any[],
    targetCurrency: Currency,
    multipliers: Record<string, number>,
    limit: number = 10,
  ): RouteAnalyticsResponse {
    const routeMap = new Map<
      string,
      {
        route: string;
        originCountry?: string;
        originCity?: string;
        destinationCountry?: string;
        destinationCity?: string;
        count: number;
        salesUzs: number;
        costUzs: number;
        volume: number;
        weight: number;
      }
    >();

    const originCountryMap = new Map<
      string,
      {
        countryName: string;
        countryCode?: string;
        count: number;
        salesUzs: number;
        volume: number;
        weight: number;
      }
    >();

    const destCountryMap = new Map<
      string,
      {
        countryName: string;
        countryCode?: string;
        count: number;
        salesUzs: number;
        volume: number;
        weight: number;
      }
    >();

    const totalCount = records.length || 1;

    for (const r of records) {
      const sPrice = Number(r.sell_price) || 0;
      const pPrice = Number(r.purchase_price) || 0;
      const sCurr = (r.sell_currency as Currency) || Currency.UZS;
      const pCurr = (r.purchase_currency as Currency) || Currency.UZS;
      const sUzs = sPrice * (multipliers[sCurr] ?? 1);
      const pUzs = pPrice * (multipliers[pCurr] ?? 1);
      const vol = Number(r.volume) || 0;
      const wt = Number(r.weight) || 0;

      const originCountry =
        r.origin_country || (r.origin_city ? 'China' : 'Xitoy (China)');
      const destCountry =
        r.destination_country ||
        (r.destination_city ? "O'zbekiston" : "O'zbekiston (Uzbekistan)");
      const originCity = r.origin_city;
      const destCity = r.destination_city;

      const routeLabel =
        originCity && destCity
          ? `${originCity} (${originCountry}) – ${destCity} (${destCountry})`
          : `${originCountry} – ${destCountry}`;

      const rm = routeMap.get(routeLabel) || {
        route: routeLabel,
        originCountry,
        originCity,
        destinationCountry: destCountry,
        destinationCity: destCity,
        count: 0,
        salesUzs: 0,
        costUzs: 0,
        volume: 0,
        weight: 0,
      };
      rm.count += 1;
      rm.salesUzs += sUzs;
      rm.costUzs += pUzs;
      rm.volume += vol;
      rm.weight += wt;
      routeMap.set(routeLabel, rm);

      // Origin country
      const origKey = originCountry || 'Unknown Origin';
      const oc = originCountryMap.get(origKey) || {
        countryName: origKey,
        countryCode: r.origin_country_code,
        count: 0,
        salesUzs: 0,
        volume: 0,
        weight: 0,
      };
      oc.count += 1;
      oc.salesUzs += sUzs;
      oc.volume += vol;
      oc.weight += wt;
      originCountryMap.set(origKey, oc);

      // Destination country
      const destKey = destCountry || 'Unknown Destination';
      const dc = destCountryMap.get(destKey) || {
        countryName: destKey,
        countryCode: r.destination_country_code,
        count: 0,
        salesUzs: 0,
        volume: 0,
        weight: 0,
      };
      dc.count += 1;
      dc.salesUzs += sUzs;
      dc.volume += vol;
      dc.weight += wt;
      destCountryMap.set(destKey, dc);
    }

    const topRoutes: RouteDistributionItem[] = Array.from(routeMap.values())
      .sort((a, b) => b.count - a.count || b.salesUzs - a.salesUzs)
      .slice(0, limit)
      .map((r) => ({
        route: r.route,
        originCountry: r.originCountry,
        originCity: r.originCity,
        destinationCountry: r.destinationCountry,
        destinationCity: r.destinationCity,
        count: r.count,
        percentage: Math.round((r.count / totalCount) * 10000) / 100,
        totalSales: this.convertFromUzsFast(
          r.salesUzs,
          targetCurrency,
          multipliers,
        ),
        totalMargin: this.convertFromUzsFast(
          r.salesUzs - r.costUzs,
          targetCurrency,
          multipliers,
        ),
        totalVolume: Math.round(r.volume * 100) / 100,
        totalWeight: Math.round(r.weight * 100) / 100,
      }));

    const originCountries: CountryDistributionItem[] = Array.from(
      originCountryMap.values(),
    )
      .sort((a, b) => b.count - a.count)
      .map((c) => ({
        countryName: c.countryName,
        countryCode: c.countryCode,
        count: c.count,
        percentage: Math.round((c.count / totalCount) * 10000) / 100,
        totalSales: this.convertFromUzsFast(
          c.salesUzs,
          targetCurrency,
          multipliers,
        ),
        totalVolume: Math.round(c.volume * 100) / 100,
        totalWeight: Math.round(c.weight * 100) / 100,
      }));

    const destinationCountries: CountryDistributionItem[] = Array.from(
      destCountryMap.values(),
    )
      .sort((a, b) => b.count - a.count)
      .map((c) => ({
        countryName: c.countryName,
        countryCode: c.countryCode,
        count: c.count,
        percentage: Math.round((c.count / totalCount) * 10000) / 100,
        totalSales: this.convertFromUzsFast(
          c.salesUzs,
          targetCurrency,
          multipliers,
        ),
        totalVolume: Math.round(c.volume * 100) / 100,
        totalWeight: Math.round(c.weight * 100) / 100,
      }));

    return {
      currency: targetCurrency,
      topRoutes,
      originCountries,
      destinationCountries,
    };
  }

  /**
   * Normalize payment status to canonical `waiting`/`unpaid`/`paid` for debt filtering.
   * Mirrors SalesManagerKpiService.normalizePaymentStatus.
   */
  private normalizePaymentStatus(status?: string | null): string {
    if (!status) return 'waiting';
    const s = status.toLowerCase().trim();
    if (
      s === 'paid' ||
      s === 'tolandi' ||
      s === "to'landi" ||
      s === 'klient berdi' ||
      s === 'olindi'
    ) {
      return 'paid';
    }
    if (s === 'unpaid' || s === 'klient_bermadi' || s === 'klient bermadi') {
      return 'unpaid';
    }
    return 'waiting';
  }

  private isPaidStatus(status?: string | null): boolean {
    return this.normalizePaymentStatus(status) === 'paid';
  }

  /**
   * Debitor (Accounts Receivable) & Kreditor (Accounts Payable) calculator
   * Only outstanding (unpaid / waiting) cargos count as receivable debt.
   * Paid cargos (`paid` / `To'landi`) are excluded from finance overwatch.
   */
  private async computeDebtSummary(
    records: any[],
    targetCurrency: Currency,
    multipliers: Record<string, number>,
  ): Promise<DebtSummaryKpi> {
    const activeRecords = records.filter((r) => {
      const st = (r.status || '').toLowerCase();
      return st !== 'arrived' && st !== 'delivered' && st !== 'completed';
    });

    const targetRecords = activeRecords.length > 0 ? activeRecords : records;

    // Finance rule: only cargos whose payment_status is NOT 'paid' are considered debt.
    // Null/undefined defaults to 'waiting' => counted as receivable.
    const outstandingRecords = targetRecords.filter(
      (r) => !this.isPaidStatus(r.payment_status),
    );

    // If every target record is already paid, debt is zero (not fallback to paid).
    const effectiveRecords = outstandingRecords;

    let totalReceivableUzs = 0;
    let totalPayableUzs = 0;

    const debtorMap = new Map<
      string,
      {
        clientId: string;
        clientName: string;
        companyName?: string;
        amountUzs: number;
        orderCount: number;
      }
    >();
    const creditorMap = new Map<
      string,
      { agentName: string; amountUzs: number; orderCount: number }
    >();

    for (const r of effectiveRecords) {
      const sellPrice = Number(r.sell_price) || 0;
      const purchasePrice = Number(r.purchase_price) || 0;
      const sellCurr = (r.sell_currency as Currency) || Currency.UZS;
      const purchaseCurr = (r.purchase_currency as Currency) || Currency.UZS;

      const sellUzs = sellPrice * (multipliers[sellCurr] ?? 1);
      const purchaseUzs = purchasePrice * (multipliers[purchaseCurr] ?? 1);

      totalReceivableUzs += sellUzs;
      totalPayableUzs += purchaseUzs;

      if (r.client_id) {
        const d = debtorMap.get(r.client_id) || {
          clientId: r.client_id,
          clientName: 'Client',
          amountUzs: 0,
          orderCount: 0,
        };
        d.amountUzs += sellUzs;
        d.orderCount += 1;
        debtorMap.set(r.client_id, d);
      }

      if (r.agent_name) {
        const agentKey = r.agent_name.trim();
        const c = creditorMap.get(agentKey) || {
          agentName: agentKey,
          amountUzs: 0,
          orderCount: 0,
        };
        c.amountUzs += purchaseUzs;
        c.orderCount += 1;
        creditorMap.set(agentKey, c);
      }
    }

    const clientIds = Array.from(debtorMap.keys());
    if (clientIds.length > 0) {
      try {
        const clients = await this.knex('clients')
          .select('id', 'first_name', 'last_name', 'company_name')
          .whereIn('id', clientIds);
        for (const cl of clients) {
          const item = debtorMap.get(cl.id);
          if (item) {
            item.clientName =
              `${cl.first_name || ''} ${cl.last_name || ''}`.trim() ||
              cl.company_name ||
              'Client';
            item.companyName = cl.company_name || undefined;
          }
        }
      } catch {
        // Safe fallback
      }
    }

    const topDebtorClients: DebtorClientItem[] = Array.from(debtorMap.values())
      .sort((a, b) => b.amountUzs - a.amountUzs)
      .slice(0, 5)
      .map((d) => ({
        clientId: d.clientId,
        clientName: d.clientName,
        companyName: d.companyName,
        amount: this.convertFromUzsFast(
          d.amountUzs,
          targetCurrency,
          multipliers,
        ),
        orderCount: d.orderCount,
      }));

    const topCreditorCarriers: CreditorCarrierItem[] = Array.from(
      creditorMap.values(),
    )
      .sort((a, b) => b.amountUzs - a.amountUzs)
      .slice(0, 5)
      .map((c) => ({
        agentName: c.agentName,
        amount: this.convertFromUzsFast(
          c.amountUzs,
          targetCurrency,
          multipliers,
        ),
        orderCount: c.orderCount,
      }));

    const accountsReceivable = this.convertFromUzsFast(
      totalReceivableUzs,
      targetCurrency,
      multipliers,
    );
    const accountsPayable = this.convertFromUzsFast(
      totalPayableUzs,
      targetCurrency,
      multipliers,
    );
    const netBalance =
      Math.round((accountsReceivable - accountsPayable) * 100) / 100;

    return {
      currency: targetCurrency,
      accountsReceivable,
      accountsPayable,
      netBalance,
      debtorClientCount: debtorMap.size,
      creditorCarrierCount: creditorMap.size,
      topDebtorClients,
      topCreditorCarriers,
    };
  }

  /**
   * Delivery efficiency and transit time calculator
   */
  private computeDeliveryEfficiency(records: any[]): DeliveryEfficiencyKpi {
    const arrivedRecords: any[] = [];
    const inTransitRecords: any[] = [];
    const statusCountMap = new Map<
      string,
      { count: number; sales: number; volume: number; weight: number }
    >();

    for (const r of records) {
      const st = r.status || 'Waiting';
      const stLower = st.toLowerCase();
      const sc = statusCountMap.get(st) || {
        count: 0,
        sales: 0,
        volume: 0,
        weight: 0,
      };
      sc.count += 1;
      sc.sales += Number(r.sell_price) || 0;
      sc.volume += Number(r.volume) || 0;
      sc.weight += Number(r.weight) || 0;
      statusCountMap.set(st, sc);

      if (
        stLower === 'arrived' ||
        stLower === 'completed' ||
        stLower === 'delivered' ||
        r.arrived_date
      ) {
        arrivedRecords.push(r);
      } else if (stLower === 'on the way' || stLower === 'in transit') {
        inTransitRecords.push(r);
      }
    }

    const transitDaysList: number[] = [];
    const routeTransitMap = new Map<
      string,
      { totalDays: number; count: number }
    >();
    let onTimeDeliveriesCount = 0;
    let delayedDeliveriesCount = 0;

    for (const r of arrivedRecords) {
      const startRaw = r.loaded_date || r.confirmed_date || r.created_at;
      const endRaw = r.arrived_date;
      if (startRaw && endRaw) {
        const start = new Date(startRaw);
        const end = new Date(endRaw);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const diffDays = Math.max(
            0,
            Math.round(
              (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
            ),
          );
          transitDaysList.push(diffDays);

          const origin = r.origin_country || r.origin_city || 'Origin';
          const dest =
            r.destination_country || r.destination_city || 'Uzbekistan';
          const routeKey = `${origin} – ${dest}`;
          const rt = routeTransitMap.get(routeKey) || {
            totalDays: 0,
            count: 0,
          };
          rt.totalDays += diffDays;
          rt.count += 1;
          routeTransitMap.set(routeKey, rt);

          if (diffDays <= 25) {
            onTimeDeliveriesCount++;
          } else {
            delayedDeliveriesCount++;
          }
        }
      }
    }

    let averageTransitDays = 0;
    let minTransitDays = 0;
    let maxTransitDays = 0;
    if (transitDaysList.length > 0) {
      const sum = transitDaysList.reduce((a, b) => a + b, 0);
      averageTransitDays = Math.round((sum / transitDaysList.length) * 10) / 10;
      minTransitDays = Math.min(...transitDaysList);
      maxTransitDays = Math.max(...transitDaysList);
    }

    const totalDeliveredCount = arrivedRecords.length;
    const totalInTransitCount = inTransitRecords.length;
    const totalActiveCount = records.length - totalDeliveredCount;
    const onTimeRatePercentage =
      transitDaysList.length > 0
        ? Math.round((onTimeDeliveriesCount / transitDaysList.length) * 10000) /
          100
        : 100;

    const totalCount = records.length || 1;
    const statusBreakdown: StatusBreakdownItem[] = [];
    for (const [st, val] of statusCountMap.entries()) {
      statusBreakdown.push({
        status: st,
        label: st,
        count: val.count,
        percentage: Math.round((val.count / totalCount) * 10000) / 100,
        totalSales: Math.round(val.sales * 100) / 100,
        totalVolume: Math.round(val.volume * 100) / 100,
        totalWeight: Math.round(val.weight * 100) / 100,
      });
    }

    const routeTransitTimes: RouteTransitTimeItem[] = [];
    for (const [route, val] of routeTransitMap.entries()) {
      routeTransitTimes.push({
        route,
        averageTransitDays: Math.round((val.totalDays / val.count) * 10) / 10,
        count: val.count,
      });
    }

    return {
      averageTransitDays,
      minTransitDays,
      maxTransitDays,
      totalDeliveredCount,
      totalInTransitCount,
      totalActiveCount,
      onTimeDeliveriesCount,
      delayedDeliveriesCount,
      onTimeRatePercentage,
      statusBreakdown,
      routeTransitTimes,
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
        const minRow = await this.knex('cargo_registrations')
          .min('confirmed_date as min_date')
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
        throw new BadRequestException(`Unsupported period: ${String(period)}`);
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
      transport_type?: TransportType;
      transport_types?: TransportType[];
    },
  ) {
    const startDateStr = start.toISOString().slice(0, 10);
    const endDateStr = end.toISOString().slice(0, 10);

    const dbQuery = this.knex('cargo_registrations')
      .select('*')
      .whereBetween('confirmed_date', [startDateStr, endDateStr]);

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
    if (query.transport_types && query.transport_types.length > 0) {
      dbQuery.whereRaw('transport_types && ?::text[]', [query.transport_types]);
    } else if (query.transport_type) {
      dbQuery.whereRaw('? = ANY(transport_types)', [query.transport_type]);
    }

    const rows = await dbQuery;

    if (query.transport_types && query.transport_types.length > 0) {
      return rows.filter((r) => {
        const rTypes = this.getTransportTypes(r);
        return query.transport_types!.some((qt) => rTypes.includes(qt));
      });
    }

    if (query.transport_type) {
      return rows.filter((r) =>
        this.getTransportTypes(r).includes(query.transport_type!),
      );
    }

    return rows;
  }

  /**
   * Fetch operational expenses for a date range
   */
  private async fetchExpenses(
    start: Date,
    end: Date,
    query: {
      employee_id?: string;
    },
  ) {
    const startDateStr = start.toISOString().slice(0, 10);
    const endDateStr = end.toISOString().slice(0, 10);

    const dbQuery = this.knex('expenses')
      .select('*')
      .whereBetween('expense_date', [startDateStr, endDateStr]);

    if (query.employee_id) {
      dbQuery.where('employee_id', query.employee_id);
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
}
