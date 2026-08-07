import { IsOptional, IsString, IsUUID, IsIn } from 'class-validator';

export class QueryCommercialOfferDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(['draft', 'sent', 'accepted', 'rejected'], {
    message: 'status must be one of: draft, sent, accepted, rejected',
  })
  status?: string;

  @IsOptional()
  @IsUUID('4', { message: 'client_id must be a valid UUID' })
  client_id?: string;

  @IsOptional()
  @IsUUID('4', { message: 'created_by must be a valid UUID' })
  created_by?: string;

  @IsOptional()
  @IsString()
  date_from?: string;

  @IsOptional()
  @IsString()
  date_to?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
