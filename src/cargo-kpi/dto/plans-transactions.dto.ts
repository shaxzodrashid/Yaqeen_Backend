import {
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsUUID,
  IsString,
  IsNotEmpty,
  IsPositive,
  Matches,
  IsEnum,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency } from '../../currency/currency.types';

export class CreateEmployeePlanDto {
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  employee_id: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'Target amount must be a positive number' })
  target_amount: number;

  @IsOptional()
  @IsEnum(Currency, {
    message: 'currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  currency?: Currency;

  @IsString()
  @IsNotEmpty({ message: 'Period is required' })
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/, {
    message: 'period must be in YYYY-MM or YYYY-MM-DD format',
  })
  period: string; // YYYY-MM or YYYY-MM-DD
}

export class UpdateEmployeePlanDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  target_amount?: number;

  @IsOptional()
  @IsEnum(Currency, {
    message: 'currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  currency?: Currency;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/, {
    message: 'period must be in YYYY-MM or YYYY-MM-DD format',
  })
  period?: string;
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
