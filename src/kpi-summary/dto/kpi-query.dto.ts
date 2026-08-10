import {
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  IsInt,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency } from '../../currency/currency.types';

export enum KpiSourceType {
  LTL = 'LTL',
  FTL = 'FTL',
  ROP = 'ROP',
  SALES = 'SALES',
  TRANSACTION = 'TRANSACTION',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class KpiSummaryQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^(\d{4}-\d{2}|all)$/, {
    message: 'month must be in YYYY-MM format or "all"',
  })
  month?: string;

  @IsOptional()
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  employee_id?: string;

  @IsOptional()
  @IsUUID('4', { message: 'department_id must be a valid UUID' })
  department_id?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(Currency, {
    message: 'target_currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  target_currency?: Currency = Currency.USD;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sort_by?: string = 'total_kpi';

  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder = SortOrder.DESC;
}

export class KpiHistoryQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^(\d{4}-\d{2}|all)$/, {
    message: 'month must be in YYYY-MM format or "all"',
  })
  month?: string;

  @IsOptional()
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  employee_id?: string;

  @IsOptional()
  @IsEnum(KpiSourceType, {
    message: 'source_type must be one of: LTL, FTL, ROP, SALES, TRANSACTION',
  })
  source_type?: KpiSourceType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(Currency, {
    message: 'target_currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  target_currency?: Currency = Currency.USD;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sort_by?: string = 'date';

  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder = SortOrder.DESC;
}
