import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsNumber,
  Min,
  IsUUID,
  Matches,
  ValidateNested,
  IsBoolean,
  IsInt,
  IsArray,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CreateConsolidationInlineDto } from '../../cargo-consolidations/dto/cargo-consolidations.dto';

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

export const ALLOWED_TRANSPORT_TYPES = [
  'auto',
  'railway',
  'air',
  'sea',
  'other',
] as const;

export type TransportType = (typeof ALLOWED_TRANSPORT_TYPES)[number];

export const ALLOWED_CURRENCIES = ['UZS', 'RUB', 'USD', 'RMB'] as const;
export type CargoCurrency = (typeof ALLOWED_CURRENCIES)[number];

export const CARGO_STATUSES = [
  'Waiting',
  'Station',
  'On the way',
  'On the border',
  'Reload',
  'Arrived',
] as const;

export type CargoStatus = (typeof CARGO_STATUSES)[number];

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
  load_code?: string;

  @IsOptional()
  @IsBoolean()
  is_turnkey?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'turnkey_price must be a number' })
  @Min(0, { message: 'turnkey_price cannot be negative' })
  turnkey_price?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES, {
    message: 'turnkey_currency must be UZS, RUB, USD, or RMB',
  })
  turnkey_currency?: CargoCurrency;

  @IsOptional()
  @IsBoolean()
  is_speed_up?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'speed_up must be a number' })
  @Min(0, { message: 'speed_up cannot be negative' })
  speed_up?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'speed_up_price must be a number' })
  @Min(0, { message: 'speed_up_price cannot be negative' })
  speed_up_price?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES, {
    message: 'speed_up_currency must be UZS, RUB, USD, or RMB',
  })
  speed_up_currency?: CargoCurrency;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'additional_expense must be a number' })
  @Min(0, { message: 'additional_expense cannot be negative' })
  additional_expense?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES, {
    message: 'additional_expense_currency must be UZS, RUB, USD, or RMB',
  })
  additional_expense_currency?: CargoCurrency;

  @IsOptional()
  @IsString()
  container_type?: string;

  @IsOptional()
  @IsArray({ message: 'transport_types must be an array of transport types' })
  @IsIn(ALLOWED_TRANSPORT_TYPES, {
    each: true,
    message: `Each transport_type must be one of: ${ALLOWED_TRANSPORT_TYPES.join(', ')}`,
  })
  transport_types?: TransportType[];

  @IsOptional()
  @IsUUID('4', { message: 'consolidation_id must be a valid UUID' })
  consolidation_id?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateConsolidationInlineDto)
  new_consolidation?: CreateConsolidationInlineDto;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9 -]+$/, {
    message:
      'container_truck_id must contain only letters, numbers, hyphens, and spaces',
  })
  container_truck_id?: string;

  @IsOptional()
  @IsString()
  agent_name?: string;

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

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'purchase_price must be a number' })
  @Min(0, { message: 'purchase_price cannot be negative' })
  purchase_price?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES, {
    message: 'purchase_currency must be UZS, RUB, USD, or RMB',
  })
  purchase_currency?: CargoCurrency;

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

  @IsOptional()
  @IsString()
  payment_status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  payment_deadline_days?: number;

  @IsOptional()
  @IsBoolean()
  is_kpi_received?: boolean;

  @IsUUID('4', { message: 'client_id must be a valid UUID' })
  client_id: string;

  @IsOptional()
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  employee_id?: string;

  // Origin Location Fields
  @IsOptional()
  @IsString()
  origin_city?: string;

  @IsOptional()
  @IsString()
  origin_country?: string;

  @IsOptional()
  @IsString()
  origin_country_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  origin_geoname_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  origin_lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  origin_lng?: number;

  // Destination Location Fields
  @IsOptional()
  @IsString()
  destination_city?: string;

  @IsOptional()
  @IsString()
  destination_country?: string;

  @IsOptional()
  @IsString()
  destination_country_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  destination_geoname_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destination_lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destination_lng?: number;

  // Duplicate Prevention & Idempotency Controls
  @IsOptional()
  @IsBoolean()
  prevent_duplicate?: boolean;

  @IsOptional()
  @IsString()
  idempotency_key?: string;
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
  load_code?: string;

  @IsOptional()
  @IsBoolean()
  is_turnkey?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  turnkey_price?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  turnkey_currency?: CargoCurrency;

  @IsOptional()
  @IsBoolean()
  is_speed_up?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  speed_up?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  speed_up_price?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  speed_up_currency?: CargoCurrency;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  additional_expense?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  additional_expense_currency?: CargoCurrency;

  @IsOptional()
  @IsString()
  container_type?: string;

  @IsOptional()
  @IsArray({ message: 'transport_types must be an array of transport types' })
  @IsIn(ALLOWED_TRANSPORT_TYPES, {
    each: true,
    message: `Each transport_type must be one of: ${ALLOWED_TRANSPORT_TYPES.join(', ')}`,
  })
  transport_types?: TransportType[];

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
  @IsString()
  payment_status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  payment_deadline_days?: number;

  @IsOptional()
  @IsBoolean()
  is_kpi_received?: boolean;

  @IsOptional()
  @IsUUID('4')
  client_id?: string;

  @IsOptional()
  @IsUUID('4')
  employee_id?: string;

  @IsOptional()
  @IsUUID('4')
  consolidation_id?: string | null;

  // Origin Location Fields
  @IsOptional()
  @IsString()
  origin_city?: string;

  @IsOptional()
  @IsString()
  origin_country?: string;

  @IsOptional()
  @IsString()
  origin_country_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  origin_geoname_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  origin_lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  origin_lng?: number;

  // Destination Location Fields
  @IsOptional()
  @IsString()
  destination_city?: string;

  @IsOptional()
  @IsString()
  destination_country?: string;

  @IsOptional()
  @IsString()
  destination_country_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  destination_geoname_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destination_lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destination_lng?: number;
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
  payment_status?: string;

  @IsOptional()
  @IsString()
  is_kpi_received?: string;

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
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    }
    return value;
  })
  @IsArray()
  @IsIn(ALLOWED_TRANSPORT_TYPES, {
    each: true,
    message: `Each transport_type must be one of: ${ALLOWED_TRANSPORT_TYPES.join(', ')}`,
  })
  transport_types?: TransportType[];

  @IsOptional()
  @IsString()
  purchase_start_date?: string;

  @IsOptional()
  @IsString()
  purchase_end_date?: string;

  @IsOptional()
  @IsString()
  purchase_date_start?: string;

  @IsOptional()
  @IsString()
  purchase_date_end?: string;

  @IsOptional()
  @IsString()
  purchase_date?: string;

  @IsOptional()
  @IsString()
  sell_start_date?: string;

  @IsOptional()
  @IsString()
  sell_end_date?: string;

  @IsOptional()
  @IsString()
  sell_date_start?: string;

  @IsOptional()
  @IsString()
  sell_date_end?: string;

  @IsOptional()
  @IsString()
  sell_date?: string;

  // Origin & Destination Query Filters
  @IsOptional()
  @IsString()
  origin_city?: string;

  @IsOptional()
  @IsString()
  origin_country_code?: string;

  @IsOptional()
  @IsString()
  origin_geoname_id?: string;

  @IsOptional()
  @IsString()
  destination_city?: string;

  @IsOptional()
  @IsString()
  destination_country_code?: string;

  @IsOptional()
  @IsString()
  destination_geoname_id?: string;

  @IsOptional()
  @IsString()
  sort_by?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'], {
    message: 'sort_order must be ASC or DESC',
  })
  sort_order?: 'ASC' | 'DESC' | 'asc' | 'desc';

  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'], {
    message: 'order must be ASC or DESC',
  })
  order?: 'ASC' | 'DESC' | 'asc' | 'desc';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID('4')
  consolidation_id?: string;

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false', '1', '0'])
  has_consolidation?: string;

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false', '1', '0'])
  is_turnkey?: string;

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false', '1', '0'])
  is_speed_up?: string;
}

export class CheckDuplicateCargoDto {
  @IsUUID('4', { message: 'client_id must be a valid UUID' })
  client_id: string;

  @IsOptional()
  @IsString()
  container_truck_id?: string;

  @IsOptional()
  @IsUUID('4')
  consolidation_id?: string;

  @IsString()
  @IsNotEmpty({ message: 'cargo is required' })
  cargo: string;

  @IsOptional()
  @IsString()
  @IsIn(['LTL', 'FTL'])
  cargo_type?: 'LTL' | 'FTL';

  @IsOptional()
  @IsString()
  origin_city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  origin_geoname_id?: number;

  @IsOptional()
  @IsString()
  destination_city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  destination_geoname_id?: number;

  @IsOptional()
  @IsString()
  confirmed_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  purchase_price?: number;
}
