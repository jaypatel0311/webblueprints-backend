import { Body, Controller, Post, Get, Param, Put, Delete, UseInterceptors, UploadedFiles, Req, UseGuards, BadRequestException, ForbiddenException, Query, Patch, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AwsS3Service } from '../common/services/aws-s3.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Logger } from '@nestjs/common';
import { UpdateTemplateStatusDto } from './dto/update-template-status-sto';
import { Response } from 'express';

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
    // Debug authentication
    this.logger.log(`Authorization header: ${req.headers.authorization ? 'Present' : 'Missing'}`);
    this.logger.log(`User object: ${JSON.stringify(req.user)}`);
    
    if (!req.user) {
      this.logger.error('No user found in request - authentication failed');
      throw new UnauthorizedException('Authentication required');
    }
    
    this.logger.log(`Creating template: ${createTemplateDto.title}`);
    this.logger.log(`User ID: ${req.user.userId}, Role: ${req.user.role}`);
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
      
      // Set status based on user role
      const isAdmin = req.user?.role === 'admin';
      const status = isAdmin ? 'published' : 'pending';
      
      this.logger.log(`Template will be created with status: ${status}`);
      
      const template = await this.templatesService.create({
        ...createTemplateDto,
        status,
        adminComment: '',
        previewImageUrl,
        downloadUrl,
        createdBy: req.user?.userId
      });
      
      return {
        ...template,
        message: isAdmin ? 'Template published successfully' : 
          'Template submitted for review. It will be available after admin approval.'
      };
    } catch (error) {
      this.logger.error(`Error creating template: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('my-submissions')
  @UseGuards(JwtAuthGuard)
  async getUserSubmissions(@Req() req) {
  this.logger.log(`Fetching submissions for user: ${req.user.userId}`);
  
    try {
    const templates = await this.templatesService.findByUser(req.user.userId);
    return {
      templates,
      count: templates.length
    };
  } catch (error) {
    this.logger.error(`Error fetching user submissions: ${error.message}`);
    throw new InternalServerErrorException('Failed to fetch your submissions');
  }
}

@Get(':id/download')
@UseGuards(JwtAuthGuard)
async downloadTemplate(
  @Param('id') id: string,
  @Req() req,
  @Res() res
) {
  try {
    const downloadInfo = await this.templatesService.downloadTemplate(id, req.user.userId);
    
    this.logger.log(`User ${req.user.userId} downloading template ${id}`);
    
    // Return download URL (for client to redirect)
    return res.json({
      success: true,
      downloadUrl: downloadInfo.downloadUrl,
      templateTitle: downloadInfo.templateTitle,
      message: 'Download link generated successfully'
    });
  } catch (error) {
    this.logger.error(`Download error: ${error.message}`);
    throw error;
  }
}

@Get('user/purchased')
@UseGuards(JwtAuthGuard)
async getUserPurchasedTemplates(@Req() req) {
  return this.templatesService.getUserPurchasedTemplates(req.user.userId);
}

@Get(':id/check-ownership')
@UseGuards(JwtAuthGuard)
async checkTemplateOwnership(
  @Param('id') id: string,
  @Req() req
) {
  const owns = await this.templatesService.checkUserOwnsTemplate(id, req.user.userId);
  return {
    owns,
    templateId: id,
    userId: req.user.userId
  };
}

  @Get()
  async findAll(@Query() query, @Req() req) {
    // Extract query parameters
    const { 
      page = 1, 
      limit = 10, 
      status, 
      category,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = query;
    
    // Determine if user is admin
    const isAdmin = req.user?.role === 'admin';
    
    // For non-admin users or public access, only show published templates
    const statusFilter = isAdmin && status ? status : 'published';
    
    // Build the query object
    const filters = {
      status: statusFilter,
      ...(category && { category }),
      ...(search && { 
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ] 
      })
    };
    
    // Get paginated results
    return this.templatesService.findAll({
      filters,
      page: Number(page),
      limit: Number(limit),
      sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 }
    });
  }

 

@Get('admin/pending')
@UseGuards(JwtAuthGuard)
async getPendingTemplates(@Req() req) {
  const isAdmin = req.user?.role === 'admin';
  if (!isAdmin) {
    throw new ForbiddenException('Only admins can access pending templates');
  }

  return this.templatesService.findByStatus('pending');
}

@Get('admin/all')
@UseGuards(JwtAuthGuard)
async getAllTemplatesForAdmin(@Req() req, @Query() query) {
  const isAdmin = req.user?.role === 'admin';
  if (!isAdmin) {
    throw new ForbiddenException('Only admins can access all templates');
  }

  return this.templatesService.findAll(query);
}

@Get(':id')
findOne(@Param('id') id: string) {
  return this.templatesService.findOne(id);
}


@Delete(':id')
remove(@Param('id') id: string) {
  return this.templatesService.remove(id);
}

@Patch(':id/status')  // Remove leading slash for consistency
@UseGuards(JwtAuthGuard)
async updateStatus(
  @Param('id') id: string,
  @Body() updateStatusDto: UpdateTemplateStatusDto,
  @Req() req
) {
  this.logger.log(`Updating template ${id} status to ${updateStatusDto.status}`);
  this.logger.log(updateStatusDto.adminComment, 'updateStatusDto.rejectionReason');
  const isAdmin = req.user?.role === 'admin';
  if (!isAdmin) {
    throw new ForbiddenException('Only admins can update template status');
  }

  try {
    
    
    const updatedTemplate = await this.templatesService.updateStatus(
      id,
      updateStatusDto.status,
      updateStatusDto.adminComment,
      req.user.userId
    );
    
    // Return appropriate message based on status
    const message = updateStatusDto.status === 'published' 
      ? 'Template published successfully'
      : updateStatusDto.status === 'rejected'
        ? 'Template rejected with feedback'
        : 'Template status updated successfully';
        
    return {
      ...updatedTemplate,
      message
    };
  } catch (error) {
    this.logger.error(`Error updating template status: ${error.message}`);
    throw error;
  }
}
}

function Res(): (target: TemplatesController, propertyKey: "downloadTemplate", parameterIndex: 2) => void {
  return (target, propertyKey, parameterIndex) => {
    const existingMetadata = Reflect.getMetadata('custom:res', target, propertyKey) || [];
    existingMetadata.push(parameterIndex);
    Reflect.defineMetadata('custom:res', existingMetadata, target, propertyKey);
  };
}
//   throw new Error('Function not implemented.');
// }
