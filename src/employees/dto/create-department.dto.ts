import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class CreateDepartmentDto {
  @IsNotEmpty()
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-z0-9_-]+$/, {
    message:
      'name must contain only lowercase alphanumeric characters, underscores, or hyphens',
  })
  name: string;

  @IsNotEmpty()
  @IsString()
  @Length(2, 100)
  display_name: string;
}
