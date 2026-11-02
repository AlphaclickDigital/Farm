import { IsString, IsOptional } from 'class-validator';

export class UpdateConfigurationDto {
  @IsString()
  value: string;

  @IsString()
  @IsOptional()
  description?: string;
}
