import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUUID,
  IsNumberString,
  Matches,
  Length,
  IsIn,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsNotEmpty({ message: 'role_id is required' })
  @IsUUID('4', { message: 'role_id must be a valid UUID' })
  role_id: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsNotEmpty()
  @IsString()
  @Length(2, 100)
  first_name: string;

  @IsNotEmpty()
  @IsString()
  @Length(2, 100)
  last_name: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\+?\d{9,15}$/, {
    message:
      'phone number must be in international format (e.g., +998330094112)',
  })
  phone: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?\d{9,15}$/, {
    message:
      'secondary phone number must be in international format (e.g., +998330094112)',
  })
  secondary_phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsNotEmpty()
  @IsUUID()
  department_id: string;

  @IsOptional()
  @IsNumberString()
  fixed_salary?: string;

  @IsOptional()
  @IsString()
  @IsIn(['UZS', 'USD', 'RUB'], {
    message: 'currency must be UZS, USD, or RUB',
  })
  currency?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a valid hex code (e.g., #FF5733 or #CCCCCC)',
  })
  color?: string;
}
