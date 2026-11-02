import { IsString } from 'class-validator';

export class ConfirmPromotionDto {
  @IsString()
  paymentIntentId: string;
}
