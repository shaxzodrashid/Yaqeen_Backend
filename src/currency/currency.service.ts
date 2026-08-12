import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { RedisService } from '../redis/redis.service';
import {
  Currency,
  CbuRateItem,
  CurrencyRateDto,
  ConversionResult,
} from './currency.types';

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  private readonly CBU_API_URL = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/';
  private readonly REDIS_CACHE_KEY = 'cbu_exchange_rates';
  private readonly CACHE_TTL_SECONDS = 3600; // 1 hour

  // Default fallback rates if CBU API & DB are completely unreachable
  private readonly FALLBACK_RATES: Record<Currency, CurrencyRateDto> = {
    [Currency.UZS]: {
      currency: Currency.UZS,
      code: '860',
      nominal: 1,
      rate: 1.0,
      diff: 0,
      date: new Date().toISOString().slice(0, 10),
    },
    [Currency.USD]: {
      currency: Currency.USD,
      code: '840',
      nominal: 1,
      rate: 12850.0,
      diff: 0,
      date: new Date().toISOString().slice(0, 10),
    },
    [Currency.RUB]: {
      currency: Currency.RUB,
      code: '643',
      nominal: 1,
      rate: 145.0,
      diff: 0,
      date: new Date().toISOString().slice(0, 10),
    },
    [Currency.RMB]: {
      currency: Currency.RMB,
      code: '156',
      nominal: 1,
      rate: 1815.0,
      diff: 0,
      date: new Date().toISOString().slice(0, 10),
    },
    [Currency.CNY]: {
      currency: Currency.CNY,
      code: '156',
      nominal: 1,
      rate: 1815.0,
      diff: 0,
      date: new Date().toISOString().slice(0, 10),
    },
  };

  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  /**
   * Get latest rates for supported currencies (UZS, USD, RUB).
   */
  async getLatestRates(): Promise<Record<Currency, CurrencyRateDto>> {
    // 1. Try Redis cache
    if (this.redisService) {
      try {
        const cached = await this.redisService.get(this.REDIS_CACHE_KEY);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        this.logger.warn(`Redis get error: ${err.message}`);
      }
    }

    // 2. Try fetching from CBU API
    try {
      const liveRates = await this.fetchRatesFromCbu();
      if (liveRates) {
        await this.cacheAndPersistRates(liveRates);
        return liveRates;
      }
    } catch (err) {
      this.logger.error(
        `Failed to fetch rates from CBU API: ${err.message}. Falling back to database/fallback.`,
      );
    }

    // 3. Fallback to DB
    const dbRates = await this.getRatesFromDb();
    if (dbRates && Object.keys(dbRates).length > 0) {
      return dbRates;
    }

    // 4. Ultimate fallback
    return this.FALLBACK_RATES;
  }

  /**
   * Force refresh exchange rates from CBU API.
   */
  async syncRatesFromCbu(): Promise<Record<Currency, CurrencyRateDto>> {
    const rates = await this.fetchRatesFromCbu();
    if (!rates) {
      throw new Error(
        'Failed to fetch current exchange rates from Central Bank of Uzbekistan (CBU)',
      );
    }
    await this.cacheAndPersistRates(rates);
    return rates;
  }

  /**
   * Convert an amount between currencies.
   */
  async convert(
    amount: number,
    from: Currency,
    to: Currency,
  ): Promise<ConversionResult> {
    if (amount < 0) {
      amount = 0;
    }

    if (from === to) {
      return {
        original_amount: amount,
        from_currency: from,
        converted_amount: Math.round(amount * 100) / 100,
        to_currency: to,
        exchange_rate_used: 1.0,
        date: new Date().toISOString().slice(0, 10),
      };
    }

    const rates = await this.getLatestRates();
    const fromRateObj = rates[from] || this.FALLBACK_RATES[from];
    const toRateObj = rates[to] || this.FALLBACK_RATES[to];

    const fromUnitRate = fromRateObj.rate / fromRateObj.nominal;
    const toUnitRate = toRateObj.rate / toRateObj.nominal;

    // Convert from source currency to base currency (UZS)
    const amountInUzs = amount * fromUnitRate;

    // Convert from UZS to target currency
    const convertedAmount = amountInUzs / toUnitRate;

    // Effective cross rate: 1 unit of `from` = X units of `to`
    const effectiveRate = fromUnitRate / toUnitRate;

    return {
      original_amount: amount,
      from_currency: from,
      converted_amount: Math.round(convertedAmount * 100) / 100,
      to_currency: to,
      exchange_rate_used: Math.round(effectiveRate * 100000) / 100000,
      date: fromRateObj.date || new Date().toISOString().slice(0, 10),
    };
  }

  /**
   * Helper to convert an amount directly to UZS using provided rates or fetching latest.
   */
  async convertToUzs(
    amount: number,
    fromCurrency: Currency,
    rates?: Record<Currency, CurrencyRateDto>,
  ): Promise<number> {
    if (fromCurrency === Currency.UZS || !fromCurrency) {
      return Math.round(amount * 100) / 100;
    }
    const currentRates = rates || (await this.getLatestRates());
    const rateObj =
      currentRates[fromCurrency] || this.FALLBACK_RATES[fromCurrency];
    const unitRate = rateObj.rate / rateObj.nominal;
    return Math.round(amount * unitRate * 100) / 100;
  }

  private readonly historicalRatesCache = new Map<
    string,
    Record<Currency, CurrencyRateDto>
  >();

  /**
   * Get rates for a specific historical date (or latest if omitted).
   */
  async getRatesForDate(
    dateInput?: string | Date,
  ): Promise<Record<Currency, CurrencyRateDto>> {
    if (!dateInput) {
      return this.getLatestRates();
    }

    let formattedDate: string;
    if (typeof dateInput === 'string') {
      formattedDate = dateInput.slice(0, 10);
    } else if (dateInput instanceof Date) {
      formattedDate = dateInput.toISOString().slice(0, 10);
    } else {
      try {
        formattedDate = new Date(dateInput).toISOString().slice(0, 10);
      } catch {
        formattedDate = new Date().toISOString().slice(0, 10);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    if (formattedDate === today) {
      return this.getLatestRates();
    }

    if (this.historicalRatesCache.has(formattedDate)) {
      return this.historicalRatesCache.get(formattedDate)!;
    }

    // 1. Try fetching DB rates for historical date
    const dbRates = await this.getRatesFromDbForDate(formattedDate);
    if (dbRates && Object.keys(dbRates).length > 0) {
      this.historicalRatesCache.set(formattedDate, dbRates);
      return dbRates;
    }

    // 2. Try CBU archive API
    try {
      const historicalRates = await this.fetchRatesFromCbu(formattedDate);
      if (historicalRates) {
        await this.cacheAndPersistRates(historicalRates);
        this.historicalRatesCache.set(formattedDate, historicalRates);
        return historicalRates;
      }
    } catch (err) {
      this.logger.warn(
        `Failed to fetch historical rates for ${formattedDate} from CBU: ${err.message}`,
      );
    }

    // 3. Fallback to latest rates
    const latest = await this.getLatestRates();
    this.historicalRatesCache.set(formattedDate, latest);
    return latest;
  }

  /**
   * Helper to get USD rate in UZS for a specific date (or latest).
   */
  async getUsdRateForDate(dateInput?: string | Date): Promise<number> {
    const rates = await this.getRatesForDate(dateInput);
    const usdObj = rates[Currency.USD] || this.FALLBACK_RATES[Currency.USD];
    return usdObj.rate / (usdObj.nominal || 1);
  }

  /**
   * Fetch rates directly from official CBU open API (supports date parameter).
   */
  private async fetchRatesFromCbu(
    dateStr?: string,
  ): Promise<Record<Currency, CurrencyRateDto> | null> {
    const apiUrl = dateStr
      ? `https://cbu.uz/uz/arkhiv-kursov-valyut/json/all/${dateStr}/`
      : this.CBU_API_URL;

    const res = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      this.logger.warn(`CBU API returned HTTP status ${res.status}`);
      return null;
    }

    const data: CbuRateItem[] = await res.json();
    if (!Array.isArray(data)) {
      return null;
    }

    const ratesResult: Record<Currency, CurrencyRateDto> = {
      [Currency.UZS]: {
        currency: Currency.UZS,
        code: '860',
        nominal: 1,
        rate: 1.0,
        diff: 0,
        date: dateStr || new Date().toISOString().slice(0, 10),
      },
      [Currency.USD]: this.FALLBACK_RATES[Currency.USD],
      [Currency.RUB]: this.FALLBACK_RATES[Currency.RUB],
      [Currency.RMB]: this.FALLBACK_RATES[Currency.RMB],
      [Currency.CNY]: this.FALLBACK_RATES[Currency.CNY],
    };

    for (const item of data) {
      const ccy = item.Ccy?.toUpperCase() as Currency;
      if (ccy === Currency.USD || ccy === Currency.RUB) {
        ratesResult[ccy] = {
          currency: ccy,
          code: item.Code,
          nominal: parseInt(item.Nominal, 10) || 1,
          rate: parseFloat(item.Rate) || ratesResult[ccy].rate,
          diff: parseFloat(item.Diff) || 0,
          date: item.Date,
        };
      } else if (ccy === Currency.CNY || ccy === Currency.RMB) {
        const rateData = {
          code: item.Code || '156',
          nominal: parseInt(item.Nominal, 10) || 1,
          rate: parseFloat(item.Rate) || 1815.0,
          diff: parseFloat(item.Diff) || 0,
          date: item.Date,
        };
        ratesResult[Currency.CNY] = {
          currency: Currency.CNY,
          ...rateData,
        };
        ratesResult[Currency.RMB] = {
          currency: Currency.RMB,
          ...rateData,
        };
      }
    }

    return ratesResult;
  }

  /**
   * Cache rates in Redis and save snapshots in DB currency_rates table.
   */
  private async cacheAndPersistRates(
    rates: Record<Currency, CurrencyRateDto>,
  ): Promise<void> {
    // Redis Cache
    if (this.redisService) {
      try {
        await this.redisService.set(
          this.REDIS_CACHE_KEY,
          JSON.stringify(rates),
          this.CACHE_TTL_SECONDS,
        );
      } catch (err) {
        this.logger.warn(`Redis set error: ${err.message}`);
      }
    }

    // DB Persistence
    try {
      for (const key of [
        Currency.USD,
        Currency.RUB,
        Currency.RMB,
        Currency.CNY,
      ]) {
        const item = rates[key];
        if (item) {
          await this.knex('currency_rates').insert({
            code: item.currency,
            rate: item.rate,
            nominal: item.nominal,
            diff: item.diff,
            rate_date: item.date,
            raw_data: JSON.stringify(item),
          });
        }
      }
    } catch (err) {
      this.logger.warn(`DB persist error for currency_rates: ${err.message}`);
    }
  }

  /**
   * Get latest recorded rates from DB currency_rates table.
   */
  private async getRatesFromDb(): Promise<Record<
    Currency,
    CurrencyRateDto
  > | null> {
    return this.getRatesFromDbForDate();
  }

  /**
   * Get DB recorded rates for specific date or latest.
   */
  private async getRatesFromDbForDate(
    dateStr?: string,
  ): Promise<Record<Currency, CurrencyRateDto> | null> {
    try {
      let query = this.knex('currency_rates').select('*');
      if (dateStr) {
        query = query.where('rate_date', dateStr);
      }
      const rows = await query.orderBy('created_at', 'desc').limit(10);

      if (!rows || rows.length === 0) return null;

      const result: Record<Currency, CurrencyRateDto> = {
        [Currency.UZS]: {
          currency: Currency.UZS,
          code: '860',
          nominal: 1,
          rate: 1.0,
          diff: 0,
          date: dateStr || new Date().toISOString().slice(0, 10),
        },
        [Currency.USD]: this.FALLBACK_RATES[Currency.USD],
        [Currency.RUB]: this.FALLBACK_RATES[Currency.RUB],
        [Currency.RMB]: this.FALLBACK_RATES[Currency.RMB],
        [Currency.CNY]: this.FALLBACK_RATES[Currency.CNY],
      };

      for (const row of rows) {
        const code = row.code as Currency;
        if (
          code &&
          (code === Currency.USD ||
            code === Currency.RUB ||
            code === Currency.RMB ||
            code === Currency.CNY)
        ) {
          if (!result[code] || result[code] === this.FALLBACK_RATES[code]) {
            result[code] = {
              currency: code,
              code: row.code,
              nominal: Number(row.nominal) || 1,
              rate: Number(row.rate),
              diff: Number(row.diff),
              date: row.rate_date || row.created_at,
            };
          }
        }
      }

      return result;
    } catch (err) {
      this.logger.warn(`Failed to read currency rates from DB: ${err.message}`);
      return null;
    }
  }
}
