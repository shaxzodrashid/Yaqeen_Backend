export enum Currency {
  UZS = 'UZS',
  USD = 'USD',
  RUB = 'RUB',
  RMB = 'RMB',
  CNY = 'CNY',
}

export interface CbuRateItem {
  id: number;
  Code: string;
  Ccy: string; // USD, RUB, etc.
  CcyNm_RU?: string;
  CcyNm_UZ?: string;
  CcyNm_EN?: string;
  Nominal: string;
  Rate: string;
  Diff: string;
  Date: string;
}

export interface CurrencyRateDto {
  currency: Currency;
  code: string;
  nominal: number;
  rate: number; // exchange rate against UZS
  diff: number;
  date: string;
}

export interface ConvertCurrencyDto {
  amount: number;
  from: Currency;
  to: Currency;
}

export interface ConversionResult {
  original_amount: number;
  from_currency: Currency;
  converted_amount: number;
  to_currency: Currency;
  exchange_rate_used: number;
  date: string;
}
