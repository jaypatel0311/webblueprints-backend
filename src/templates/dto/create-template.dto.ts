import { Transform, Type } from 'class-transformer';
import { IsString, IsOptional, IsBoolean, IsArray, IsNumber, Min, IsEnum } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    // Handle string input from form data
    if (typeof value === 'string') {
      try {
        // Try to parse JSON string
        return JSON.parse(value);
      } catch (e) {
        // If parsing fails, split by comma
        return value ? value.split(',').map(tag => tag.trim()) : [];
      }
    }
    return value || [];
  })
  tags?: string[];

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  techStack?: string;

  @IsOptional()
  @IsNumber({
    allowNaN: false,
    allowInfinity: false,
    maxDecimalPlaces: 2
  })
  @Min(0)
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsString()
  previewImageUrl?: string;

  @IsOptional()
  @IsString()
  downloadUrl?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      // Convert string to boolean
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  @Type(() => Boolean)
  isPremium?: boolean;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsEnum(['pending', 'published', 'rejected'], {
    message: 'Status must be either pending, published, or rejected'
  })
  status?: string;

  @IsOptional()
  @IsString()
  adminComment?: string;
}