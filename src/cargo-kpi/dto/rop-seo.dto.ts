import {
  IsNumber,
  Min,
  IsOptional,
  IsUUID,
  IsString,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRopWorkerDto {
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  @IsNotEmpty({ message: 'employee_id is required' })
  employee_id: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Sales amount cannot be negative' })
  sales_amount: number;

  @IsOptional()
  @IsString()
  month?: string;
}

export class CreateRopTruckDto {
  @IsString()
  @IsNotEmpty({ message: 'Truck number is required' })
  truck_number: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Profit cannot be negative' })
  profit: number;

  @IsOptional()
  @IsString()
  month?: string;
}

export class SeoCalcDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'Net profit must be a number' })
  net_profit: number;
}
