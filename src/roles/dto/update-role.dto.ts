import {
  IsOptional,
  IsString,
  IsObject,
  Length,
  Matches,
} from 'class-validator';

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  @Matches(/^[A-Za-z0-9_\-\s]+$/, {
    message:
      'Role name can only contain letters, numbers, spaces, underscores, and hyphens.',
  })
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  display_name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  permissions?: Record<
    string,
    { create?: boolean; read?: boolean; update?: boolean; delete?: boolean }
  >;
}
