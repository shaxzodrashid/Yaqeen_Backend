import { IsString, IsNotEmpty } from 'class-validator';

export class CreateTaskCommentDto {
  @IsString()
  @IsNotEmpty()
  content: string;
}
