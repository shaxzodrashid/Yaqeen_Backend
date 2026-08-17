import {
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsUUID,
  IsString,
  IsNotEmpty,
  Matches,
  IsEnum,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency } from '../../currency/currency.types';

export class CreateEmployeePlanDto {
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  employee_id: string;

  /**
   * Target volume for LTL cargos in m3 (Direction 1: Volume Plan)
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'ltl_target_volume must be a number' })
  @Min(0, { message: 'ltl_target_volume cannot be negative' })
  ltl_target_volume?: number;

  /**
   * Alias for ltl_target_volume
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'target_volume must be a number' })
  @Min(0, { message: 'target_volume cannot be negative' })
  target_volume?: number;

  /**
   * Target financial value for FTL cargos (Direction 2: Financial Value Plan)
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'ftl_target_amount must be a number' })
  @Min(0, { message: 'ftl_target_amount cannot be negative' })
  ftl_target_amount?: number;

  /**
   * Backward-compatible alias for ftl_target_amount
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'target_amount must be a number' })
  @Min(0, { message: 'target_amount cannot be negative' })
  target_amount?: number;

  /**
   * Currency for FTL financial value plan. Defaults to USD.
   */
  @IsOptional()
  @IsEnum(Currency, {
    message: 'currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  currency?: Currency;

  /**
   * Alias for currency
   */
  @IsOptional()
  @IsEnum(Currency, {
    message: 'ftl_currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  ftl_currency?: Currency;

  @IsString()
  @IsNotEmpty({ message: 'Period is required' })
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/, {
    message: 'period must be in YYYY-MM or YYYY-MM-DD format',
  })
  period: string; // YYYY-MM or YYYY-MM-DD
}

export class UpdateEmployeePlanDto {
  @IsOptional()
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  employee_id?: string;

  /**
   * Target volume for LTL cargos in m3
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'ltl_target_volume must be a number' })
  @Min(0, { message: 'ltl_target_volume cannot be negative' })
  ltl_target_volume?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'target_volume must be a number' })
  @Min(0, { message: 'target_volume cannot be negative' })
  target_volume?: number;

  /**
   * Target financial value for FTL cargos
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'ftl_target_amount must be a number' })
  @Min(0, { message: 'ftl_target_amount cannot be negative' })
  ftl_target_amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'target_amount must be a number' })
  @Min(0, { message: 'target_amount cannot be negative' })
  target_amount?: number;

  /**
   * Currency for FTL financial value plan
   */
  @IsOptional()
  @IsEnum(Currency, {
    message: 'currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  currency?: Currency;

  @IsOptional()
  @IsEnum(Currency, {
    message: 'ftl_currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  ftl_currency?: Currency;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/, {
    message: 'period must be in YYYY-MM or YYYY-MM-DD format',
  })
  period?: string;
}

export class QueryEmployeePlanDto {
  @IsOptional()
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  employee_id?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/, {
    message: 'period must be in YYYY-MM or YYYY-MM-DD format',
  })
  period?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateCargoTransactionDto {
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  employee_id: string;

  @IsUUID('4', { message: 'department_id must be a valid UUID' })
  department_id: string;

  @IsUUID('4', { message: 'client_id must be a valid UUID' })
  @IsNotEmpty({ message: 'client_id is required' })
  client_id: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Buy price cannot be negative' })
  buy_price: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Sell price cannot be negative' })
  sell_price: number;

  @IsOptional()
  @IsEnum(Currency, {
    message: 'currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  currency?: Currency;

  @IsOptional()
  @IsString()
  @IsIn(['Waiting', 'In Transit', 'Border', 'At Station', 'Delivered'], {
    message:
      'status must be one of: Waiting, In Transit, Border, At Station, Delivered',
  })
  status?: string;

  /**
   * @deprecated KPI percentage is now resolved automatically based on the department.
   * Any manually provided value is ignored.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  kpi_percentage?: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'transaction_date must be in YYYY-MM-DD format',
  })
  transaction_date: string;
}

export enum CargoTransactionStatus {
  WAITING = 'Waiting',
  IN_TRANSIT = 'In Transit',
  BORDER = 'Border',
  AT_STATION = 'At Station',
  DELIVERED = 'Delivered',
}

export class UpdateCargoTransactionDto {
  @IsOptional()
  @IsUUID('4')
  employee_id?: string;

  @IsOptional()
  @IsUUID('4')
  department_id?: string;

  @IsOptional()
  @IsUUID('4', { message: 'client_id must be a valid UUID' })
  client_id?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  buy_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sell_price?: number;

  @IsOptional()
  @IsEnum(Currency, {
    message: 'currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  currency?: Currency;

  @IsOptional()
  @IsString()
  @IsIn(['Waiting', 'In Transit', 'Border', 'At Station', 'Delivered'], {
    message:
      'status must be one of: Waiting, In Transit, Border, At Station, Delivered',
  })
  status?: string;

  /**
   * @deprecated KPI percentage is now resolved automatically based on the department.
   * Any manually provided value is ignored.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  kpi_percentage?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transaction_date?: string;
}

export class QueryCargoTransactionDto {
  @IsOptional()
  @IsUUID('4')
  employee_id?: string;

  @IsOptional()
  @IsUUID('4')
  department_id?: string;

  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  end_date?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  statuses?: string[] | string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  offset?: string;

  @IsOptional()
  @IsString()
  group_by_status?: string;
}
