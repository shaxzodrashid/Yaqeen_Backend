import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsISO8601,
  ValidateIf,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  TimeframePeriod,
  Granularity,
  TransportType,
} from '../dashboard.types';
import { Currency } from '../../currency/currency.types';

export class SalesProgressQueryDto {
  @IsOptional()
  @IsEnum(TimeframePeriod, {
    message: 'period must be one of: 1D, 5D, 1M, 6M, YTD, 1Y, 5Y, MAX, CUSTOM',
  })
  period?: TimeframePeriod = TimeframePeriod.ONE_MONTH;

  @IsOptional()
  @IsEnum(Granularity, {
    message: 'granularity must be one of: hour, day, week, month, year',
  })
  granularity?: Granularity;

  @ValidateIf((o) => o.period === TimeframePeriod.CUSTOM)
  @IsISO8601({}, { message: 'start_date must be a valid ISO 8601 date string' })
  start_date?: string;

  @ValidateIf((o) => o.period === TimeframePeriod.CUSTOM)
  @IsISO8601({}, { message: 'end_date must be a valid ISO 8601 date string' })
  end_date?: string;

  @IsOptional()
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  employee_id?: string;

  @IsOptional()
  @IsUUID('4', { message: 'client_id must be a valid UUID' })
  client_id?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  cargo_type?: string;

  @IsOptional()
  @IsEnum(TransportType, {
    message: 'transport_type must be one of: auto, railway, air, sea, other',
  })
  transport_type?: TransportType;

  @IsOptional()
  @IsEnum(Currency, {
    message: 'currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  currency?: Currency;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === '1')
  @IsBoolean()
  include_expenses?: boolean = true;
}

export class DashboardSummaryQueryDto {
  @IsOptional()
  @IsEnum(TimeframePeriod)
  period?: TimeframePeriod = TimeframePeriod.ONE_MONTH;

  @IsOptional()
  @IsISO8601()
  start_date?: string;

  @IsOptional()
  @IsISO8601()
  end_date?: string;

  @IsOptional()
  @IsUUID('4')
  employee_id?: string;

  @IsOptional()
  @IsUUID('4')
  client_id?: string;

  @IsOptional()
  @IsString()
  cargo_type?: string;

  @IsOptional()
  @IsEnum(TransportType)
  transport_type?: TransportType;

  @IsOptional()
  @IsEnum(Currency, {
    message: 'currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  currency?: Currency;
}

export class TopPerformersQueryDto extends DashboardSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 5;
}

export class RouteAnalyticsQueryDto extends DashboardSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export class DebtSummaryQueryDto extends DashboardSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export class DeliveryEfficiencyQueryDto extends DashboardSummaryQueryDto {}
