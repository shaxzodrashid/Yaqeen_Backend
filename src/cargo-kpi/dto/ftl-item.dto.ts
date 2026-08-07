import {
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsUUID,
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsInt,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFtlItemDto {
  @IsUUID('4', { message: 'manager_id must be a valid UUID' })
  @IsNotEmpty({ message: 'manager_id is required' })
  manager_id: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'Month must be in YYYY-MM format',
  })
  month: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Agent price cannot be negative' })
  agent_price: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Sell price cannot be negative' })
  sell_price: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30, { message: 'Planned days (B) cannot exceed 30' })
  planned_days: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  actual_days: number;

  @IsOptional()
  @IsBoolean()
  kpi_received?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty?: number;
}

export class UpdateFtlItemDto {
  @IsOptional()
  @IsUUID('4', { message: 'manager_id must be a valid UUID' })
  manager_id?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  agent_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sell_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  planned_days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  actual_days?: number;

  @IsOptional()
  @IsBoolean()
  kpi_received?: boolean;
}
