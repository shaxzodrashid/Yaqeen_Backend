import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsNumber,
  Min,
  IsUUID,
  Matches,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export const ALLOWED_CONTAINER_TYPES = [
  '40HQ',
  '40GP',
  '20GP',
  '20HQ',
  '45HQ',
  '96m3',
  '105m3',
  '110m3',
  '120m3',
  '130m3',
  '145m3',
  'Ref Fura',
  'air-delivery',
  '96 CBM',
  '105 CBM',
  '120 CBM',
  '130 CBM',
  '145 CBM',
  '40 GP',
  '40 HC',
  '45 HC',
  '127 CBM',
] as const;

export type ContainerType = (typeof ALLOWED_CONTAINER_TYPES)[number];

export const ALLOWED_CURRENCIES = ['UZS', 'RUB', 'USD', 'RMB'] as const;
export type CargoCurrency = (typeof ALLOWED_CURRENCIES)[number];

export const CARGO_STATUSES = [
  'Waiting',
  'In Transit',
  'Border',
  'At Station',
  'Delivered',
] as const;

export class CreateCargoRegistrationDto {
  @IsString()
  @IsNotEmpty({ message: 'cargo_type is required' })
  @IsIn(['LTL', 'FTL'], { message: 'cargo_type must be either LTL or FTL' })
  cargo_type: 'LTL' | 'FTL';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'volume must be a number' })
  @Min(0.0001, { message: 'volume must be positive' })
  volume?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'weight must be a number' })
  @Min(0.0001, { message: 'weight must be positive' })
  weight?: number;

  @IsOptional()
  @IsString()
  container_type?: string;

  @IsString()
  @IsNotEmpty({ message: 'container_truck_id is required' })
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message:
      'container_truck_id must contain only letters, numbers, and hyphens',
  })
  container_truck_id: string;

  @IsString()
  @IsNotEmpty({ message: 'agent_name is required' })
  agent_name: string;

  @IsString()
  @IsNotEmpty({ message: 'cargo is required' })
  cargo: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'confirmed_date must be in YYYY-MM-DD format',
  })
  confirmed_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'loaded_date must be in YYYY-MM-DD format',
  })
  loaded_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'arrived_date must be in YYYY-MM-DD format',
  })
  arrived_date?: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'purchase_price must be a number' })
  @Min(0, { message: 'purchase_price cannot be negative' })
  purchase_price: number;

  @IsString()
  @IsIn(ALLOWED_CURRENCIES, {
    message: 'purchase_currency must be UZS, RUB, USD, or RMB',
  })
  purchase_currency: CargoCurrency;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'purchase_date must be in YYYY-MM-DD format',
  })
  purchase_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'purchase_exchange_rate must be a number' })
  @Min(0.0001, { message: 'purchase_exchange_rate must be positive' })
  purchase_exchange_rate?: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'sell_price must be a number' })
  @Min(0, { message: 'sell_price cannot be negative' })
  sell_price: number;

  @IsString()
  @IsIn(ALLOWED_CURRENCIES, {
    message: 'sell_currency must be UZS, RUB, USD, or RMB',
  })
  sell_currency: CargoCurrency;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'sell_date must be in YYYY-MM-DD format',
  })
  sell_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'sell_exchange_rate must be a number' })
  @Min(0.0001, { message: 'sell_exchange_rate must be positive' })
  sell_exchange_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'usd_rmb_rate must be a number' })
  @Min(0.0001, { message: 'usd_rmb_rate must be positive' })
  usd_rmb_rate?: number;

  @IsOptional()
  @IsString()
  @IsIn(CARGO_STATUSES, {
    message: `status must be one of: ${CARGO_STATUSES.join(', ')}`,
  })
  status?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID('4', { message: 'client_id must be a valid UUID' })
  client_id: string;

  @IsOptional()
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  employee_id?: string;
}

export class UpdateCargoRegistrationDto {
  @IsOptional()
  @IsString()
  @IsIn(['LTL', 'FTL'])
  cargo_type?: 'LTL' | 'FTL';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  volume?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  weight?: number;

  @IsOptional()
  @IsString()
  container_type?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9-]+$/)
  container_truck_id?: string;

  @IsOptional()
  @IsString()
  agent_name?: string;

  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  confirmed_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  loaded_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  arrived_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchase_price?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  purchase_currency?: CargoCurrency;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  purchase_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  purchase_exchange_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sell_price?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  sell_currency?: CargoCurrency;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  sell_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  sell_exchange_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  usd_rmb_rate?: number;

  @IsOptional()
  @IsString()
  @IsIn(CARGO_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID('4')
  client_id?: string;

  @IsOptional()
  @IsUUID('4')
  employee_id?: string;
}

export class QueryCargoRegistrationDto {
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
  status?: string;

  @IsOptional()
  @IsString()
  confirmed_start_date?: string;

  @IsOptional()
  @IsString()
  confirmed_end_date?: string;

  @IsOptional()
  @IsString()
  loaded_start_date?: string;

  @IsOptional()
  @IsString()
  loaded_end_date?: string;

  @IsOptional()
  @IsString()
  arrived_start_date?: string;

  @IsOptional()
  @IsString()
  arrived_end_date?: string;

  @IsOptional()
  @IsString()
  created_start_date?: string;

  @IsOptional()
  @IsString()
  created_end_date?: string;

  @IsOptional()
  @IsString()
  created_at_start?: string;

  @IsOptional()
  @IsString()
  created_at_end?: string;

  @IsOptional()
  @IsUUID('4')
  employee_id?: string;

  @IsOptional()
  @IsUUID('4')
  client_id?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.toUpperCase() as any) : value,
  )
  @IsString()
  @IsIn(['LTL', 'FTL'])
  cargo_type?: 'LTL' | 'FTL';

  @IsOptional()
  @IsString()
  container_type?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
