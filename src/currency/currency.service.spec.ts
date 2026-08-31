import { Test, TestingModule } from '@nestjs/testing';
import { CurrencyService } from './currency.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { Currency } from './currency.types';

describe('CurrencyService', () => {
  let service: CurrencyService;
  let mockKnex: any;
  let mockQueryBuilder: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        {
          code: 'USD',
          rate: 12850,
          nominal: 1,
          diff: 15,
          rate_date: '2026-07-23',
        },
        {
          code: 'RUB',
          rate: 145,
          nominal: 1,
          diff: 0.5,
          rate_date: '2026-07-23',
        },
      ]),
      insert: jest.fn().mockResolvedValue([1]),
    };

    mockKnex = jest.fn().mockReturnValue(mockQueryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrencyService,
        {
          provide: KNEX_CONNECTION,
          useValue: mockKnex,
        },
      ],
    }).compile();

    service = module.get<CurrencyService>(CurrencyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLatestRates', () => {
    it('should return exchange rates for UZS, USD, and RUB', async () => {
      const rates = await service.getLatestRates();
      expect(rates).toBeDefined();
      expect(rates[Currency.UZS].rate).toEqual(1);
      expect(rates[Currency.USD]).toBeDefined();
      expect(rates[Currency.RUB]).toBeDefined();
    });
  });

  describe('convert', () => {
    it('should return original amount when converting same currency', async () => {
      const res = await service.convert(100, Currency.USD, Currency.USD);
      expect(res.converted_amount).toEqual(100);
      expect(res.exchange_rate_used).toEqual(1);
    });

    it('should convert USD to UZS correctly', async () => {
      const res = await service.convert(10, Currency.USD, Currency.UZS);
      expect(res.converted_amount).toBeGreaterThan(0);
      expect(res.from_currency).toEqual(Currency.USD);
      expect(res.to_currency).toEqual(Currency.UZS);
    });

    it('should convert RUB to UZS correctly', async () => {
      const res = await service.convert(1000, Currency.RUB, Currency.UZS);
      expect(res.converted_amount).toBeGreaterThan(0);
      expect(res.from_currency).toEqual(Currency.RUB);
      expect(res.to_currency).toEqual(Currency.UZS);
    });

    it('should convert USD to RUB cross-rate correctly', async () => {
      const res = await service.convert(100, Currency.USD, Currency.RUB);
      expect(res.converted_amount).toBeGreaterThan(0);
      expect(res.from_currency).toEqual(Currency.USD);
      expect(res.to_currency).toEqual(Currency.RUB);
    });
  });

  describe('convertToUzs', () => {
    it('should return same amount for UZS', async () => {
      const val = await service.convertToUzs(5000, Currency.UZS);
      expect(val).toEqual(5000);
    });

    it('should convert non-UZS currency to UZS', async () => {
      const val = await service.convertToUzs(2, Currency.USD);
      expect(val).toBeGreaterThan(2);
    });
  });

  describe('getRatesForDate', () => {
    beforeEach(() => {
      jest.spyOn(service as any, 'fetchRatesFromCbu').mockResolvedValue({
        USD: {
          code: 'USD',
          rate: 12850,
          nominal: 1,
          diff: 15,
          rate_date: '2026-07-23',
        },
        RUB: {
          code: 'RUB',
          rate: 145,
          nominal: 1,
          diff: 0.5,
          rate_date: '2026-07-23',
        },
      });
    });

    it('should handle Date object without throwing dateStr.slice is not a function', async () => {
      const dateObj = new Date('2026-07-23');
      const rates = await service.getRatesForDate(dateObj);
      expect(rates).toBeDefined();
    });

    it('should handle date string correctly', async () => {
      const rates = await service.getRatesForDate('2026-07-23');
      expect(rates).toBeDefined();
    });
  });
});
