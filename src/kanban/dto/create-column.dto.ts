import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsInt,
  IsOptional,
  MaxLength,
  Min,
  IsArray,
  IsBoolean,
} from 'class-validator';

export class CreateColumnDto {
  @IsUUID()
  @IsNotEmpty()
  board_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

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
