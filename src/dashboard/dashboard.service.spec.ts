import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { TimeframePeriod, Granularity } from './dashboard.types';
import { BadRequestException } from '@nestjs/common';
import { CurrencyService } from '../currency/currency.service';
import { Currency } from '../currency/currency.types';

describe('DashboardService', () => {
  let service: DashboardService;
  let knexMock: any;

  const mockRefDate = new Date('2026-08-06T12:00:00.000Z');

  beforeEach(async () => {
    knexMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: KNEX_CONNECTION,
          useValue: knexMock,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveDateRange', () => {
    it('should resolve 1D period correctly', async () => {
      const res = await service.resolveDateRange(
        TimeframePeriod.ONE_DAY,
        {},
        mockRefDate,
      );

      expect(res.granularity).toBe(Granularity.HOUR);
      expect(res.startDate.toISOString()).toContain('2026-08-06T00:00:00');
      expect(res.endDate.toISOString()).toContain('2026-08-06T23:59:59');
      expect(res.prevStartDate).toBeDefined();
    });

    it('should resolve 5D period correctly', async () => {
      const res = await service.resolveDateRange(
        TimeframePeriod.FIVE_DAYS,
        {},
        mockRefDate,
      );

      expect(res.granularity).toBe(Granularity.DAY);
      expect(res.startDate.toISOString()).toContain('2026-08-02T00:00:00');
      expect(res.endDate.toISOString()).toContain('2026-08-06T23:59:59');
    });

    it('should resolve 1M period correctly', async () => {
      const res = await service.resolveDateRange(
        TimeframePeriod.ONE_MONTH,
        {},
        mockRefDate,
      );

      expect(res.granularity).toBe(Granularity.DAY);
      expect(res.startDate.toISOString()).toContain('2026-07-07T00:00:00');
      expect(res.endDate.toISOString()).toContain('2026-08-06T23:59:59');
    });

    it('should resolve YTD period correctly', async () => {
      const res = await service.resolveDateRange(
        TimeframePeriod.YTD,
        {},
        mockRefDate,
      );

      expect(res.granularity).toBe(Granularity.MONTH);
      expect(res.startDate.toISOString()).toContain('2026-01-01T00:00:00');
      expect(res.prevStartDate?.toISOString()).toContain('2025-01-01T00:00:00');
    });

    it('should resolve 1Y period correctly', async () => {
      const res = await service.resolveDateRange(
        TimeframePeriod.ONE_YEAR,
        {},
        mockRefDate,
      );

      expect(res.granularity).toBe(Granularity.MONTH);
      expect(res.startDate.toISOString()).toContain('2025-08-06T00:00:00');
    });

    it('should resolve 5Y period correctly', async () => {
      const res = await service.resolveDateRange(
        TimeframePeriod.FIVE_YEARS,
        {},
        mockRefDate,
      );

      expect(res.granularity).toBe(Granularity.YEAR);
      expect(res.startDate.toISOString()).toContain('2021-08-06T00:00:00');
    });

    it('should throw exception for CUSTOM period without start_date or end_date', async () => {
      await expect(
        service.resolveDateRange(TimeframePeriod.CUSTOM, {}, mockRefDate),
      ).rejects.toThrow(BadRequestException);
    });

    it('should resolve CUSTOM period correctly', async () => {
      const res = await service.resolveDateRange(
        TimeframePeriod.CUSTOM,
        {
          start_date: '2026-06-01',
          end_date: '2026-06-15',
        },
        mockRefDate,
      );

      expect(res.granularity).toBe(Granularity.DAY);
      expect(res.startDate.toISOString()).toContain('2026-06-01T00:00:00');
      expect(res.endDate.toISOString()).toContain('2026-06-15T23:59:59');
    });
  });

  describe('generateTimeBuckets', () => {
    it('should generate hourly buckets for 1D', () => {
      const start = new Date('2026-08-06T00:00:00.000Z');
      const end = new Date('2026-08-06T23:59:59.999Z');

      const buckets = service.generateTimeBuckets(start, end, Granularity.HOUR);
      expect(buckets.length).toBe(24);
      expect(buckets[0].label).toBe('00:00');
      expect(buckets[23].label).toBe('23:00');
    });

    it('should generate daily buckets for 5D', () => {
      const start = new Date('2026-08-02T00:00:00.000Z');
      const end = new Date('2026-08-06T23:59:59.999Z');

      const buckets = service.generateTimeBuckets(start, end, Granularity.DAY);
      expect(buckets.length).toBe(5);
      expect(buckets[0].dateKey).toBe('2026-08-02');
      expect(buckets[4].dateKey).toBe('2026-08-06');
    });
  });

  describe('getSalesProgress', () => {
    it('should aggregate sales data and zero-fill missing buckets', async () => {
      const mockRecords = [
        {
          id: 'reg-1',
          sell_price: '5000.00',
          purchase_price: '3500.00',
          created_at: '2026-08-05T10:00:00.000Z',
          status: 'Completed',
        },
        {
          id: 'reg-2',
          sell_price: '3000.00',
          purchase_price: '2000.00',
          created_at: '2026-08-06T15:30:00.000Z',
          status: 'Waiting',
        },
      ];

      // Mock knex chained calls
      const chainable = {
        select: jest.fn().mockReturnThis(),
        whereBetween: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        then: jest.fn().mockImplementation((cb) => cb(mockRecords)),
      };
      knexMock.mockReturnValue(chainable);

      const res = await service.getSalesProgress(
        { period: TimeframePeriod.FIVE_DAYS },
        mockRefDate,
      );

      expect(res.meta.period).toBe(TimeframePeriod.FIVE_DAYS);
      expect(res.summary.totalSales).toBe(8000);
      expect(res.summary.totalPurchaseCost).toBe(5500);
      expect(res.summary.totalMargin).toBe(2500);
      expect(res.summary.marginPercentage).toBe(31.25);
      expect(res.summary.totalOrders).toBe(2);
      expect(res.summary.completedOrders).toBe(1);
      expect(res.summary.pendingOrders).toBe(1);

      expect(res.dataPoints.length).toBe(5);
      // Last bucket (Aug 6th) should contain cumulative total
      const lastBucket = res.dataPoints[res.dataPoints.length - 1];
      expect(lastBucket.cumulativeSales).toBe(8000);
    });
  });

  describe('getDashboardSummary & getCargoDistribution', () => {
    it('should calculate executive summary metrics correctly', async () => {
      const mockRecords = [
        {
          sell_price: '10000.00',
          purchase_price: '7000.00',
          volume: '25.5',
          weight: '1200',
          cargo_type: 'FTL',
          status: 'Completed',
          created_at: '2026-08-01T10:00:00.000Z',
        },
        {
          sell_price: '2000.00',
          purchase_price: '1200.00',
          volume: '5.0',
          weight: '300',
          cargo_type: 'LTL',
          status: 'Waiting',
          created_at: '2026-08-03T10:00:00.000Z',
        },
      ];

      const chainable = {
        select: jest.fn().mockReturnThis(),
        whereBetween: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        then: jest.fn().mockImplementation((cb) => cb(mockRecords)),
      };
      knexMock.mockReturnValue(chainable);

      const summary = await service.getDashboardSummary(
        { period: TimeframePeriod.ONE_MONTH },
        mockRefDate,
      );

      expect(summary.currency).toBe(Currency.UZS);
      expect(summary.totalSales).toBe(12000);
      expect(summary.totalMargin).toBe(3800);
      expect(summary.totalOrders).toBe(2);
      expect(summary.ftlOrderCount).toBe(1);
      expect(summary.ltlOrderCount).toBe(1);

      const dist = await service.getCargoDistribution(
        { period: TimeframePeriod.ONE_MONTH },
        mockRefDate,
      );

      expect(dist.currency).toBe(Currency.UZS);
      expect(dist.cargoTypeDistribution.length).toBe(2);
      expect(dist.statusDistribution.length).toBe(2);
    });

    it('should convert metrics when requested currency is USD', async () => {
      const mockCurrencyService: any = {
        getLatestRates: jest.fn().mockResolvedValue({
          USD: { rate: 12850, nominal: 1 },
          UZS: { rate: 1, nominal: 1 },
        }),
        convertToUzs: jest.fn().mockImplementation(async (amt, curr) => {
          if (curr === 'USD') return amt * 12850;
          return amt;
        }),
        convert: jest.fn().mockImplementation(async (amt, from, to) => {
          if (from === 'UZS' && to === 'USD') {
            return { converted_amount: Math.round((amt / 12850) * 100) / 100 };
          }
          return { converted_amount: amt };
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DashboardService,
          {
            provide: KNEX_CONNECTION,
            useValue: knexMock,
          },
          {
            provide: CurrencyService,
            useValue: mockCurrencyService,
          },
        ],
      }).compile();

      const customService = module.get<DashboardService>(DashboardService);

      const mockRecords = [
        {
          sell_price: '100',
          sell_currency: 'USD',
          purchase_price: '60',
          purchase_currency: 'USD',
          cargo_type: 'FTL',
          status: 'Completed',
          created_at: '2026-08-01T10:00:00.000Z',
        },
      ];

      const chainable = {
        select: jest.fn().mockReturnThis(),
        whereBetween: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        then: jest.fn().mockImplementation((cb) => cb(mockRecords)),
      };
      knexMock.mockReturnValue(chainable);

      const summaryUsd = await customService.getDashboardSummary(
        { period: TimeframePeriod.ONE_MONTH, currency: Currency.USD },
        mockRefDate,
      );

      expect(summaryUsd.currency).toBe(Currency.USD);
      expect(summaryUsd.totalSales).toBe(100);
      expect(summaryUsd.totalPurchaseCost).toBe(60);
      expect(summaryUsd.totalMargin).toBe(40);
    });
  });
});
