import { IsUUID, IsNotEmpty, IsInt, Min } from 'class-validator';

export class MoveTaskDto {
  @IsUUID()
  @IsNotEmpty()
  column_id: string;

  @IsInt()
  @Min(0)
  @IsNotEmpty()
  position: number;
}
