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
  totalMargin: number;
  marginPercentage: number;
  totalOrders: number;
  averageOrderValue: number;
  completedOrders: number;
  pendingOrders: number;
  growthRateSales: number | null; // % growth compared to previous period
  growthRateMargin: number | null; // % growth in margin
}

export interface TimeBucketDataPoint {
  index: number;
  bucketStart: string; // ISO string
  bucketEnd: string; // ISO string
  dateKey: string; // formatted key (e.g. '2026-08-06 14:00', '2026-08-06', '2026-08')
  label: string; // Readable axis label e.g. '14:00', '06 Aug', 'Aug 2026'
  sales: number;
  purchaseCost: number;
  margin: number;
  orderCount: number;
  cumulativeSales: number;
  cumulativeMargin: number;
}

export interface SalesProgressResponse {
  meta: TimeframeMeta;
  summary: TimeframeSummary;
  dataPoints: TimeBucketDataPoint[];
}

export interface DashboardSummaryKpi {
  currency?: string;
  totalSales: number;
  totalPurchaseCost: number;
  totalMargin: number;
  marginPercentage: number;
  totalOrders: number;
  completedOrders: number;
  waitingOrders: number;
  averageOrderValue: number;
  totalVolume: number;
  totalWeight: number;
  ltlOrderCount: number;
  ftlOrderCount: number;
  salesGrowthVsPriorPeriod: number | null;
  marginGrowthVsPriorPeriod: number | null;
}

export interface CargoDistributionItem {
  category: string; // e.g., 'LTL', 'FTL' or 'Waiting', 'Completed'
  count: number;
  totalSales: number;
  percentage: number;
}

export interface CargoDistributionResponse {
  currency?: string;
  cargoTypeDistribution: CargoDistributionItem[];
  statusDistribution: CargoDistributionItem[];
}

export interface TopPerformerManager {
  employeeId: string;
  employeeName: string;
  departmentName?: string;
  totalSales: number;
  totalMargin: number;
  orderCount: number;
}

export interface TopPerformerClient {
  clientId: string;
  clientName: string;
  companyName?: string;
  totalSales: number;
  totalMargin: number;
  orderCount: number;
}

export interface TopPerformersResponse {
  currency?: string;
  topManagers: TopPerformerManager[];
  topClients: TopPerformerClient[];
}
