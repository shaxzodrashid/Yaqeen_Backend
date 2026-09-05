import { IsOptional, IsString, IsIn } from 'class-validator';

export class QueryAgentDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false', '1', '0'])
  all?: string;

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false', '1', '0'])
  is_active?: string;

  @IsOptional()
  @IsString()
  sort_by?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'], {
    message: 'sort_order must be ASC or DESC',
  })
  sort_order?: 'ASC' | 'DESC' | 'asc' | 'desc';
}
