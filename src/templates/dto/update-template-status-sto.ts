import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateTemplateStatusDto {
  @IsEnum(['pending', 'published', 'rejected'], {
    message: 'Status must be pending, published, or rejected'
  })
  status: string;
  
  @IsOptional()
  @IsString()
  adminComment?: string;
}