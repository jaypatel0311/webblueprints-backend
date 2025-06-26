import { IsString, IsOptional } from 'class-validator';

export class GenerateDemoDto {
  @IsOptional()
  @IsString()
  customizationOptions?: string;
  
  @IsOptional()
  @IsString()
  demoTitle?: string;
}