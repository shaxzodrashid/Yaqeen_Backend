import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUUID,
  Matches,
  Length,
  IsBoolean,
} from 'class-validator';

export class CreateClientDto {
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
      'phone number must be in international format (e.g., +998901234567)',
  })
  phone: string;

  @IsNotEmpty()
  @IsString()
  @Length(2, 200)
  company_name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsUUID('4', { message: 'assigned_employee_id must be a valid UUID' })
  assigned_employee_id?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
