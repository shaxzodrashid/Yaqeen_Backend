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
import { Type } from 'class-transformer';
export const ALLOWED_CURRENCIES = ['UZS', 'RUB', 'USD', 'RMB'] as const;
export type ConsolidationCurrency = (typeof ALLOWED_CURRENCIES)[number];

export const CONSOLIDATION_STATUSES = [
  'Planning',
  'Loading',
  'On the way',
  'Station',
  'On the border',
  'Reload',
  'Arrived',
  'Completed',
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
  loaded_date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  departure_date?: string;

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
  departure_date?: string;

  @IsOptional()
  @IsString()
  @IsIn(CONSOLIDATION_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
