import {
  IsOptional,
  IsString,
  IsDateString,
  Matches,
  IsEnum,
} from 'class-validator';
import { Currency } from '../../currency/currency.types';

export class QueryFinanceSummaryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'period must be in YYYY-MM format (e.g. 2026-07)',
  })
  period?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsEnum(Currency, {
    message: 'currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  currency?: Currency;
}
