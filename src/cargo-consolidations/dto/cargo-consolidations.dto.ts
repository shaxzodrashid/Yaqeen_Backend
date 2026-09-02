import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsNumber,
  Min,
  IsUUID,
  Matches,
  IsArray,
  ArrayMinSize,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export const ALLOWED_TRANSPORT_TYPES = [
  'auto',
  'railway',
  'air',
  'sea',
  'other',
] as const;
export type ConsolidationTransportType =
  (typeof ALLOWED_TRANSPORT_TYPES)[number];

export const ALLOWED_CURRENCIES = ['UZS', 'RUB', 'USD', 'RMB'] as const;
export type ConsolidationCurrency = (typeof ALLOWED_CURRENCIES)[number];

export const CONSOLIDATION_STATUSES = [
  'Waiting',
  'Station',
  'On the way',
  'On the border',
  'Reload',
  'Arrived',
] as const;

export type ConsolidationStatus = (typeof CONSOLIDATION_STATUSES)[number];

export class CreateCargoConsolidationDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message:
      'consolidation_code must contain only letters, numbers, hyphens and underscores',
  })
  consolidation_code?: string;

  @IsString()
  @IsNotEmpty({ message: 'container_truck_id is required' })
  @Matches(/^[a-zA-Z0-9 -]+$/, {
    message:
      'container_truck_id must contain only letters, numbers, hyphens, and spaces',
  })
  container_truck_id: string;

  @IsOptional()
  @IsString()
  container_type?: string;

  @IsOptional()
  @IsArray({ message: 'transport_types must be an array of transport types' })
  @IsIn(ALLOWED_TRANSPORT_TYPES, {
    each: true,
    message: `Each transport_type must be one of: ${ALLOWED_TRANSPORT_TYPES.join(', ')}`,
  })
  transport_types?: ConsolidationTransportType[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'max_volume_capacity must be a number' })
  @Min(0, { message: 'max_volume_capacity cannot be negative' })
  max_volume_capacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'max_weight_capacity must be a number' })
  @Min(0, { message: 'max_weight_capacity cannot be negative' })
  max_weight_capacity?: number;

  @IsOptional()
  @IsString()
  carrier_name?: string;

  @IsOptional()
  @IsString()
  carrier_phone?: string;

  @IsOptional()
  @IsString()
  origin_place?: string;

  @IsOptional()
  @IsString()
  destination_place?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'load_date must be in YYYY-MM-DD format',
  })
  load_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'loaded_date must be in YYYY-MM-DD format',
  })
  loaded_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'departure_date must be in YYYY-MM-DD format',
  })
  departure_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'border_arrival_date must be in YYYY-MM-DD format',
  })
  border_arrival_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'tashkent_arrival_date must be in YYYY-MM-DD format',
  })
  tashkent_arrival_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'estimated_arrival_date must be in YYYY-MM-DD format',
  })
  estimated_arrival_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'arrived_date must be in YYYY-MM-DD format',
  })
  arrived_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'total_carrier_cost must be a number' })
  @Min(0, { message: 'total_carrier_cost cannot be negative' })
  total_carrier_cost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'agent must be a number' })
  @Min(0, { message: 'agent cannot be negative' })
  agent?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES, {
    message: 'agent_currency must be UZS, RUB, USD, or RMB',
  })
  agent_currency?: ConsolidationCurrency;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'customs_clearance_of_goods must be a number' })
  @Min(0, { message: 'customs_clearance_of_goods cannot be negative' })
  customs_clearance_of_goods?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'tomojnya must be a number' })
  @Min(0, { message: 'tomojnya cannot be negative' })
  tomojnya?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'tamojnya must be a number' })
  @Min(0, { message: 'tamojnya cannot be negative' })
  tamojnya?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES, {
    message:
      'customs_clearance_of_goods_currency must be UZS, RUB, USD, or RMB',
  })
  customs_clearance_of_goods_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES, {
    message: 'tomojnya_currency must be UZS, RUB, USD, or RMB',
  })
  tomojnya_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES, {
    message: 'tamojnya_currency must be UZS, RUB, USD, or RMB',
  })
  tamojnya_currency?: ConsolidationCurrency;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'cct must be a number' })
  @Min(0, { message: 'cct cannot be negative' })
  cct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'certificate must be a number' })
  @Min(0, { message: 'certificate cannot be negative' })
  certificate?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES, {
    message: 'cct_currency must be UZS, RUB, USD, or RMB',
  })
  cct_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES, {
    message: 'certificate_currency must be UZS, RUB, USD, or RMB',
  })
  certificate_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES, {
    message: 'carrier_cost_currency must be UZS, RUB, USD, or RMB',
  })
  carrier_cost_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(CONSOLIDATION_STATUSES, {
    message: `status must be one of: ${CONSOLIDATION_STATUSES.join(', ')}`,
  })
  status?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray({ message: 'cargo_registration_ids must be an array of UUIDs' })
  @IsUUID('4', {
    each: true,
    message: 'Each cargo_registration_id must be a valid UUID',
  })
  cargo_registration_ids?: string[];
}

export class UpdateCargoConsolidationDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/)
  consolidation_code?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9 -]+$/)
  container_truck_id?: string;

  @IsOptional()
  @IsString()
  container_type?: string;

  @IsOptional()
  @IsArray({ message: 'transport_types must be an array of transport types' })
  @IsIn(ALLOWED_TRANSPORT_TYPES, {
    each: true,
    message: `Each transport_type must be one of: ${ALLOWED_TRANSPORT_TYPES.join(', ')}`,
  })
  transport_types?: ConsolidationTransportType[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  max_volume_capacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  max_weight_capacity?: number;

  @IsOptional()
  @IsString()
  carrier_name?: string;

  @IsOptional()
  @IsString()
  carrier_phone?: string;

  @IsOptional()
  @IsString()
  origin_place?: string;

  @IsOptional()
  @IsString()
  destination_place?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  load_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  loaded_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  departure_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  border_arrival_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  tashkent_arrival_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  estimated_arrival_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  arrived_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total_carrier_cost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  agent?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  agent_currency?: ConsolidationCurrency;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  customs_clearance_of_goods?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tomojnya?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tamojnya?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  customs_clearance_of_goods_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  tomojnya_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  tamojnya_currency?: ConsolidationCurrency;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  certificate?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  cct_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  certificate_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  carrier_cost_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(CONSOLIDATION_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  sync_status_to_cargos?: boolean;

  @IsOptional()
  @IsBoolean()
  sync_dates_to_cargos?: boolean;

  @IsOptional()
  @IsBoolean()
  sync_transport_types_to_cargos?: boolean;
}

export class QueryCargoConsolidationDto {
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
  transport_types?: ConsolidationTransportType[];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  departure_start_date?: string;

  @IsOptional()
  @IsString()
  departure_end_date?: string;

  @IsOptional()
  @IsString()
  arrived_start_date?: string;

  @IsOptional()
  @IsString()
  arrived_end_date?: string;

  @IsOptional()
  @IsString()
  origin_place?: string;

  @IsOptional()
  @IsString()
  destination_place?: string;

  @IsOptional()
  @IsString()
  carrier_name?: string;

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
}

export class AssignCargosDto {
  @IsArray({ message: 'cargo_registration_ids must be an array of UUIDs' })
  @ArrayMinSize(1, {
    message: 'cargo_registration_ids must contain at least 1 ID',
  })
  @IsUUID('4', {
    each: true,
    message: 'Each cargo_registration_id must be a valid UUID',
  })
  cargo_registration_ids: string[];
}

export class RemoveCargosDto {
  @IsArray({ message: 'cargo_registration_ids must be an array of UUIDs' })
  @ArrayMinSize(1, {
    message: 'cargo_registration_ids must contain at least 1 ID',
  })
  @IsUUID('4', {
    each: true,
    message: 'Each cargo_registration_id must be a valid UUID',
  })
  cargo_registration_ids: string[];
}

export class CreateConsolidationInlineDto {
  @IsString()
  @IsNotEmpty({ message: 'container_truck_id is required' })
  @Matches(/^[a-zA-Z0-9 -]+$/, {
    message:
      'container_truck_id must contain only letters, numbers, hyphens, and spaces',
  })
  container_truck_id: string;

  @IsOptional()
  @IsString()
  container_type?: string;

  @IsOptional()
  @IsArray({ message: 'transport_types must be an array of transport types' })
  @IsIn(ALLOWED_TRANSPORT_TYPES, {
    each: true,
    message: `Each transport_type must be one of: ${ALLOWED_TRANSPORT_TYPES.join(', ')}`,
  })
  transport_types?: ConsolidationTransportType[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  max_volume_capacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  max_weight_capacity?: number;

  @IsOptional()
  @IsString()
  carrier_name?: string;

  @IsOptional()
  @IsString()
  carrier_phone?: string;

  @IsOptional()
  @IsString()
  origin_place?: string;

  @IsOptional()
  @IsString()
  origin_country?: string;

  @IsOptional()
  @IsString()
  origin_country_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  origin_geoname_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  origin_lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  origin_lng?: number;

  @IsOptional()
  @IsString()
  destination_place?: string;

  @IsOptional()
  @IsString()
  destination_country?: string;

  @IsOptional()
  @IsString()
  destination_country_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destination_geoname_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destination_lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destination_lng?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  load_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  loaded_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  departure_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  border_arrival_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  tashkent_arrival_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  estimated_arrival_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  arrived_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total_carrier_cost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  agent?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  agent_currency?: ConsolidationCurrency;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  customs_clearance_of_goods?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tomojnya?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tamojnya?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  customs_clearance_of_goods_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  tomojnya_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  tamojnya_currency?: ConsolidationCurrency;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  certificate?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  cct_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  certificate_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  carrier_cost_currency?: ConsolidationCurrency;

  @IsOptional()
  @IsString()
  @IsIn(CONSOLIDATION_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
