import { Body, Controller, Post, Get, Param, Put, Delete, UseInterceptors, UploadedFiles, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AwsS3Service } from '../common/services/aws-s3.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Logger } from '@nestjs/common';

@Controller('templates')
export class TemplatesController {
  private readonly logger = new Logger(TemplatesController.name);

  constructor(private readonly templatesService: TemplatesService,
    private readonly awsS3Service: AwsS3Service
  ) {}

 @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'previewImage', maxCount: 1 }, 
    { name: 'templateFiles', maxCount: 1 }
  ]))
  async create(
    @UploadedFiles() files,
    @Body() createTemplateDto: CreateTemplateDto,
    @Req() req
  ) {
    this.logger.log(`Creating template: ${createTemplateDto.title}`);
    this.logger.log(`Received files: ${JSON.stringify(files ? Object.keys(files) : 'none')}`);
    
    if (!createTemplateDto.title) {
      throw new BadRequestException('Title is required');
    }
    
    try {
      let previewImageUrl: string | undefined = undefined;
      let downloadUrl: string | undefined = undefined;
      
      if (files && files.previewImage && files.previewImage.length > 0) {
        this.logger.log('Uploading preview image to S3');
        previewImageUrl = await this.awsS3Service.uploadFile(
          files.previewImage[0], 
          'previews'
        );
      }
      
      if (files && files.templateFiles && files.templateFiles.length > 0) {
        this.logger.log('Uploading template files to S3');
        downloadUrl = await this.awsS3Service.uploadFile(
          files.templateFiles[0], 
          'templates'
        );
      }
      
      const template = await this.templatesService.create({
        ...createTemplateDto,
        previewImageUrl,
        downloadUrl,
        createdBy: req.user.userId
      });
      
      // this.logger.log(`Template created successfully with id: ${template.id}`);
      return template;
    } catch (error) {
      this.logger.error(`Error creating template: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get()
  findAll() {
    return this.templatesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templatesService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateTemplateDto: UpdateTemplateDto) {
    const transformedDto = {
      ...updateTemplateDto,
      createdBy: updateTemplateDto.createdBy ? new ObjectId(updateTemplateDto.createdBy) : undefined,
    };
    return this.templatesService.update(id, transformedDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.templatesService.remove(id);
  }
}