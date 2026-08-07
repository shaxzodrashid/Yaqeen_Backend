import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCommercialOfferDto {
  @IsOptional()
  @IsUUID('4', { message: 'client_id must be a valid UUID' })
  client_id?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  client_name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  client_company?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  origin?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  destination?: string;

  @IsOptional()
  @IsString()
  cargo_description?: string;

  @IsOptional()
  @IsNumber({}, { message: 'cargo_weight must be a number' })
  @Type(() => Number)
  @Min(0)
  cargo_weight?: number;

  @IsOptional()
  @IsNumber({}, { message: 'cargo_volume must be a number' })
  @Type(() => Number)
  @Min(0)
  cargo_volume?: number;

  @IsOptional()
  @IsNumber({}, { message: 'price_usd must be a number' })
  @Type(() => Number)
  @Min(0)
  price_usd?: number;

  @IsOptional()
  @IsNumber({}, { message: 'price_local must be a number' })
  @Type(() => Number)
  @Min(0)
  price_local?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inclusions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  exclusions?: string[];

  @IsOptional()
  @IsString()
  terms?: string;
}
