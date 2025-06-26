// src/templates/demo/demo.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Template, TemplateSchema } from '../template.schema';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { AwsS3Service } from '../../common/services/aws-s3.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Template.name, schema: TemplateSchema }])
  ],
  controllers: [DemoController],
  providers: [DemoService, AwsS3Service]
})
export class DemoModule {}