import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { Template, TemplateSchema } from './template.schema';
import { AwsS3Service } from 'src/common/services/aws-s3.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Template.name, schema: TemplateSchema }])
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService, AwsS3Service],
  exports: [TemplatesService],
})
export class TemplatesModule {}
