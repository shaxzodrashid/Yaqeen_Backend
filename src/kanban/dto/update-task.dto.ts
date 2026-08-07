import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
  IsArray,
  MaxLength,
  IsInt,
  Min,
} from 'class-validator';
import { TaskPriority } from './create-task.dto';

export class UpdateTaskDto {
  @IsUUID()
  @IsOptional()
  column_id?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  assignee_id?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  assignee_ids?: string[];

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @IsInt()
  @Min(0)
  @IsOptional()
  position?: number;

  @IsDateString()
  @IsOptional()
  due_date?: string;

  @IsDateString()
  @IsOptional()
  target_time?: string;
}
