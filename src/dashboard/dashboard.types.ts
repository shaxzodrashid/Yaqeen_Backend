export enum TimeframePeriod {
  ONE_DAY = '1D',
  FIVE_DAYS = '5D',
  ONE_MONTH = '1M',
  SIX_MONTHS = '6M',
  YTD = 'YTD',
  ONE_YEAR = '1Y',
  FIVE_YEARS = '5Y',
  MAX = 'MAX',
  CUSTOM = 'CUSTOM',
}

export enum Granularity {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export enum TransportType {
  AUTO = 'auto',
  RAILWAY = 'railway',
  AIR = 'air',
  SEA = 'sea',
  OTHER = 'other',
}

export interface TimeframeMeta {
  period: TimeframePeriod;
  startDate: string; // ISO string
  endDate: string; // ISO string
  granularity: Granularity;
  totalBuckets: number;
  currency: string;
}

export interface TimeframeSummary {
  totalSales: number;
  totalPurchaseCost: number;
  totalOperationalExpenses?: number;
  totalExpenses?: number;
  totalMargin: number;
  totalNetProfit?: number;
  marginPercentage: number;
  totalOrders: number;
  averageOrderValue: number;
  completedOrders: number;
  pendingOrders: number;
  inTransitOrders?: number;
  growthRateSales: number | null; // % growth compared to previous period
  growthRateMargin: number | null; // % growth in margin
  growthRateNetProfit?: number | null; // % growth in net profit
}

export interface TimeBucketDataPoint {
  index: number;
  bucketStart: string; // ISO string
  bucketEnd: string; // ISO string
  dateKey: string; // formatted key (e.g. '2026-08-06 14:00', '2026-08-06', '2026-08')
  label: string; // Readable axis label e.g. '14:00', '06 Aug', 'Aug 2026'
  sales: number;
  purchaseCost: number;
  operationalExpenses?: number;
  totalExpenses?: number;
  margin: number;
  netProfit?: number;
  orderCount: number;
  cumulativeSales: number;
  cumulativeExpenses?: number;
  cumulativeMargin: number;
  cumulativeNetProfit?: number;
}

export interface SalesProgressResponse {
  meta: TimeframeMeta;
  summary: TimeframeSummary;
  dataPoints: TimeBucketDataPoint[];
}

export interface PeriodKpiMetric {
  revenue: number;
  purchaseCost: number;
  netProfit: number;
  marginPercentage: number;
  revenueGrowthRate: number | null; // % vs previous period
  netProfitGrowthRate: number | null; // % vs previous period
  orderCount: number;
}

export interface DebtorClientItem {
  clientId: string;
  clientName: string;
  companyName?: string;
  amount: number;
  orderCount: number;
}

export interface CreditorCarrierItem {
  agentName: string;
  amount: number;
  orderCount: number;
}

export interface DebtSummaryKpi {
  currency?: string;
  accountsReceivable: number; // Mijozlarning to'lanmagan hisoblari (Debitorlik)
  accountsPayable: number; // Tashuvchilarga bo'lgan qarzdorliklar (Kreditorlik)
  netBalance: number; // Debitor - Kreditor balansi (Sof balans)
  debtorClientCount: number;
  creditorCarrierCount: number;
  topDebtorClients?: DebtorClientItem[];
  topCreditorCarriers?: CreditorCarrierItem[];
}

export interface StatusBreakdownItem {
  status: string;
  label: string;
  count: number;
  percentage: number;
  totalSales: number;
  totalVolume: number;
  totalWeight: number;
}

export interface RouteTransitTimeItem {
  route: string;
  averageTransitDays: number;
  count: number;
}

export interface DeliveryEfficiencyKpi {
  averageTransitDays: number;
  minTransitDays: number;
  maxTransitDays: number;
  totalDeliveredCount: number;
  totalInTransitCount: number;
  totalActiveCount: number;
  onTimeDeliveriesCount?: number;
  delayedDeliveriesCount?: number;
  onTimeRatePercentage?: number;
  statusBreakdown?: StatusBreakdownItem[];
  routeTransitTimes?: RouteTransitTimeItem[];
}

export interface DashboardSummaryKpi {
  currency?: string;
  totalSales: number;
  totalPurchaseCost: number;
  totalMargin: number;
  netProfit?: number;
  marginPercentage: number;
  totalOrders: number;
  activeOrders: number;
  inTransitOrders: number;
  waitingOrders: number;
  completedOrders: number;
  averageOrderValue: number;
  totalVolume: number;
  totalWeight: number;
  ltlOrderCount: number;
  ftlOrderCount: number;
  salesGrowthVsPriorPeriod: number | null;
  marginGrowthVsPriorPeriod: number | null;
  monthly?: PeriodKpiMetric;
  yearly?: PeriodKpiMetric;
  debtSummary?: DebtSummaryKpi;
  deliveryEfficiency?: DeliveryEfficiencyKpi;
  statusCounts?: Record<string, number>;
}

export interface CargoDistributionItem {
  category: string; // e.g., 'LTL', 'FTL' or 'Waiting', 'Completed'
  count: number;
  totalSales: number;
  percentage: number;
}

export interface TransportDistributionItem {
  type: TransportType;
  name: string; // e.g. 'Avtotransport (Auto / Truck)', 'Temir yo\'l (Railway)'
  count: number;
  percentage: number;
  totalSales: number;
  totalMargin: number;
  totalVolume: number;
  totalWeight: number;
}

export interface CargoDistributionResponse {
  currency?: string;
  transportTypeDistribution: TransportDistributionItem[];
  cargoTypeDistribution: CargoDistributionItem[];
  statusDistribution: CargoDistributionItem[];
}

export interface RouteDistributionItem {
  route: string; // e.g., 'China – Uzbekistan' or 'Guangzhou – Tashkent'
  originCountry?: string;
  originCity?: string;
  destinationCountry?: string;
  destinationCity?: string;
  count: number;
  percentage: number;
  totalSales: number;
  totalMargin: number;
  totalVolume: number;
  totalWeight: number;
}

export interface CountryDistributionItem {
  countryName: string;
  countryCode?: string;
  count: number;
  percentage: number;
  totalSales: number;
  totalVolume: number;
  totalWeight: number;
}

export interface RouteAnalyticsResponse {
  currency?: string;
  topRoutes: RouteDistributionItem[];
  originCountries: CountryDistributionItem[];
  destinationCountries: CountryDistributionItem[];
}

export interface TopPerformerManager {
  employeeId: string;
  employeeName: string;
  departmentName?: string;
  totalSales: number;
  totalPurchaseCost?: number;
  totalMargin: number;
  orderCount: number;
  totalVolume?: number;
  totalWeight?: number;
  averageOrderValue?: number;
  completedOrdersCount?: number;
  activeOrdersCount?: number;
  conversionRate?: number; // % completed vs total
}

export interface TopPerformerClient {
  clientId: string;
  clientName: string;
  companyName?: string;
  totalSales: number;
  totalPurchaseCost?: number;
  totalMargin: number;
  orderCount: number;
  totalVolume?: number;
  totalWeight?: number;
  averageOrderValue?: number;
}

export interface TopPerformersResponse {
  currency?: string;
  topManagers: TopPerformerManager[];
  topClients: TopPerformerClient[];
}
