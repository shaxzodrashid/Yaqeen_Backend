import { IsEnum, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Currency } from '../currency.types';

export class ConvertCurrencyDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'amount must be a number' })
  @Min(0, { message: 'amount cannot be negative' })
  amount: number;

  @IsEnum(Currency, {
    message: 'currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  from: Currency;

  @IsEnum(Currency, {
    message: 'currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  to: Currency;
}
