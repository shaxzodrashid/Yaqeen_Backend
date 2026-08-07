import {
  IsNumber,
  IsPositive,
  IsOptional,
  IsUUID,
  IsString,
  IsNotEmpty,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LtlCalcDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'Volume must be a number' })
  @IsPositive({ message: 'Volume must be a positive number' })
  volume: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Weight must be a number' })
  @IsPositive({ message: 'Weight must be a positive number' })
  weight: number;
}

export enum CargoType {
  LYUSTRA = 'lyustra',
  ODDIY = 'oddiy',
  POD_KLYUCH = 'pod_klyuch',
}

export class CreateLtlItemDto {
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  @IsNotEmpty({ message: 'employee_id is required' })
  employee_id: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Volume must be a number' })
  @IsPositive({ message: 'Volume must be a positive number' })
  volume: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Weight must be a number' })
  @IsPositive({ message: 'Weight must be a positive number' })
  weight: number;

  @IsEnum(CargoType, {
    message: 'cargo_type must be one of: lyustra, oddiy, pod_klyuch',
  })
  cargo_type: CargoType;
}

export class UpdateLtlItemDto {
  @IsOptional()
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  employee_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  volume?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  weight?: number;

  @IsOptional()
  @IsEnum(CargoType)
  cargo_type?: CargoType;
}
