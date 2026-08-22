import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsInt,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class SearchCitiesQueryDto {
  @IsString()
  @IsNotEmpty({ message: 'Search query (q) cannot be empty' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 15;

  @IsOptional()
  @IsString()
  lang?: string = 'en';
}

export class CreateCityDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  geoname_id?: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  ascii_name?: string;

  @IsOptional()
  @IsString()
  country_name?: string;

  @IsOptional()
  @IsString()
  country_code?: string;

  @IsOptional()
  @IsString()
  admin1_name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  population?: number;
}
