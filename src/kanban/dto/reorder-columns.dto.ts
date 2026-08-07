import { IsArray, IsUUID, ArrayNotEmpty } from 'class-validator';

export class ReorderColumnsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  column_ids: string[];
}
