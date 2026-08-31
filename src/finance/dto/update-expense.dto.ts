import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseCategory, ExpenseSection } from './create-expense.dto';
import { Currency } from '../../currency/currency.types';

export class UpdateExpenseDto {
  @IsOptional()
  @IsEnum(ExpenseSection, {
    message: 'section must be one of: ftl, ltl',
  })
  section?: ExpenseSection;

  @IsOptional()
  @IsEnum(ExpenseCategory, {
    message:
      'category must be one of: tax, utility, rent, salary_payout, cleaner, kpi, food, other, china_warehouse, firm_service, declarant',
  })
  category?: ExpenseCategory;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'amount must be a number' })
  @Min(0.01, { message: 'amount must be greater than 0' })
  amount?: number;

  @IsOptional()
  @IsEnum(Currency, {
    message: 'currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  currency?: Currency;

  @IsOptional()
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  employee_id?: string;

  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'expense_date must be a valid ISO date string (YYYY-MM-DD)' },
  )
  expense_date?: string;
}
