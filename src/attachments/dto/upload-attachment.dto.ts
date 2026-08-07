import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class UploadAttachmentDto {
  @IsNotEmpty()
  @IsString()
  entity_type: string;

  @IsNotEmpty()
  @IsUUID()
  entity_id: string;
}
