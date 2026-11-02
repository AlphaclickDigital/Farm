import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const AU_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

export class UpdateVendorDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  storeName?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  photo?: string;

  @IsString()
  @IsOptional()
  coverPhoto?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  location?: string;

  // An empty string clears the field.
  @ValidateIf((o: UpdateVendorDto) => o.state !== '')
  @IsIn(AU_STATES)
  @IsOptional()
  state?: string;

  @ValidateIf((o: UpdateVendorDto) => o.phone !== '')
  @IsString()
  @Matches(/^[0-9+()\s-]{8,20}$/, {
    message: 'Phone number may only contain digits, spaces, +, - and brackets',
  })
  @IsOptional()
  phone?: string;
}
