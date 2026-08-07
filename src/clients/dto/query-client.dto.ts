import { IsOptional, IsString, IsUUID, IsBooleanString } from 'class-validator';

export class QueryClientDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  assigned_employee_id?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsBooleanString()
  is_active?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
