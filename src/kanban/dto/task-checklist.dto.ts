import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsBoolean()
  @IsOptional()
  is_completed?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  position?: number;
}

export class UpdateChecklistItemDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  title?: string;

  @IsBoolean()
  @IsOptional()
  is_completed?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  position?: number;
}
