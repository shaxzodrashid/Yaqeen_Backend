import {
  IsString,
  IsOptional,
  MaxLength,
  IsInt,
  Min,
  IsArray,
  IsBoolean,
} from 'class-validator';

export class UpdateColumnDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  name?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  position?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowed_roles?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(30)
  color?: string;

  @IsBoolean()
  @IsOptional()
  is_done_status?: boolean;
}
