import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsObject,
  IsBoolean,
  Length,
  Matches,
} from 'class-validator';

export class CreateRoleDto {
  @IsNotEmpty()
  @IsString()
  @Length(2, 100)
  @Matches(/^[A-Za-z0-9_\-\s]+$/, {
    message:
      'Role name can only contain letters, numbers, spaces, underscores, and hyphens.',
  })
  name: string;

  @IsNotEmpty()
  @IsString()
  @Length(2, 100)
  display_name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_plan_settable?: boolean;

  @IsNotEmpty()
  @IsObject()
  permissions: Record<
    string,
    {
      create?: boolean;
      read?: boolean;
      view?: boolean;
      update?: boolean;
      delete?: boolean;
      assign_cargo?: boolean;
      register_for_everyone?: boolean;
      can_work_with_all_clients?: boolean;
      plan_settable?: boolean;
    }
  >;
}
