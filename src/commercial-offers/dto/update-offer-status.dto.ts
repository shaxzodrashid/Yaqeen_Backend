import { IsNotEmpty, IsString, IsIn } from 'class-validator';

export class UpdateOfferStatusDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['draft', 'sent', 'accepted', 'rejected'], {
    message: 'status must be one of: draft, sent, accepted, rejected',
  })
  status: string;
}
