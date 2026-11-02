import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class AdminUpdateVendorDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  storeName?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isApproved?: boolean;

  @IsBoolean()
  @IsOptional()
  isSuspended?: boolean;

  @IsString()
  @IsOptional()
  suspendedReason?: string;
}
