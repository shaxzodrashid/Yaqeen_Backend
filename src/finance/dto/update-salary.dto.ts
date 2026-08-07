import {
  IsUUID,
  IsNumber,
  Min,
  IsArray,
  ValidateNested,
  IsOptional,
  IsString,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateEmployeeSalaryDto {
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  employee_id: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'fixed_salary must be a number' })
  @Min(0, { message: 'fixed_salary cannot be negative' })
  fixed_salary: number;

  @IsOptional()
  @IsString()
  @IsIn(['UZS', 'USD', 'RUB', 'RMB', 'CNY'], {
    message: 'currency must be UZS, USD, RUB, RMB, or CNY',
  })
  currency?: string;
}

export class BatchUpdateSalariesDto {
  @IsArray({ message: 'salaries must be an array' })
  @ValidateNested({ each: true })
  @Type(() => UpdateEmployeeSalaryDto)
  salaries: UpdateEmployeeSalaryDto[];
}
