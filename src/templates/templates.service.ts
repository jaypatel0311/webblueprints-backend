import { Injectable, NotFoundException, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { CreateTemplateDto } from './dto/create-template.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Template, TemplateDocument } from './template.schema';
import { AwsS3Service } from 'src/common/services/aws-s3.service';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as extract from 'extract-zip';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectModel(Template.name) private templateModel: Model<TemplateDocument>,
    private readonly awsS3Service: AwsS3Service
  ) {}

  async create(createTemplateDto: CreateTemplateDto): Promise<Template> {
    // Ensure price is correctly formatted
    const price = createTemplateDto.price ? 
      parseFloat(createTemplateDto.price.toFixed(2)) : 
      0;
      
    const newTemplate = new this.templateModel({
      ...createTemplateDto,
      price
    });
    
    return newTemplate.save();
  }

  async generateDemo(templateId: string, userId: string, userRole: string): Promise<string> {
    const template = await this.templateModel.findById(templateId);
    
    if (!template) {
      throw new NotFoundException(`Template with ID ${templateId} not found`);
    }
    
    if (!template.downloadUrl) {
      throw new BadRequestException('Template has no downloadable files');
    }
    
    // Check permissions
    const isAdmin = userRole === 'admin';
    const isOwner = template.createdBy.toString() === userId;
    
    if (!isAdmin && !isOwner) {
      throw new BadRequestException('You do not have permission to generate a demo for this template');
    }
    
    try {
      this.logger.log(`Generating demo for template ${templateId}`);
      
      // Generate a unique demo ID
      const demoId = `demo-${templateId}-${Date.now()}`;
      
      // Process and deploy the demo
      const demoUrl = await this.processAndDeployDemo(template.downloadUrl, demoId);
      
      // Update template with demo data
      template.demoUrl = demoUrl;
      template.hasLiveDemo = true;
      template.demoDeploymentId = demoId;
      await template.save();
      
      this.logger.log(`Demo generated successfully for template ${templateId}: ${demoUrl}`);
      return demoUrl;
    } catch (error) {
      this.logger.error(`Error generating demo: ${error.message}`);
      throw new InternalServerErrorException(`Failed to generate demo: ${error.message}`);
    }
  }

  private async processAndDeployDemo(downloadUrl: string, demoId: string): Promise<string> {
    try {
      this.logger.log(`Starting demo deployment process for ${demoId}`);
      
      // 1. Extract the S3 key from the download URL
      const key = this.extractKeyFromUrl(downloadUrl);
      if (!key) {
        throw new Error(`Could not extract S3 key from URL: ${downloadUrl}`);
      }
      
      // Create temporary file paths
      const tempDir = os.tmpdir();
      const zipFilePath = path.join(tempDir, `${demoId}.zip`);
      const extractDir = path.join(tempDir, demoId);
      
      this.logger.log(`Downloading template files from ${key} to ${zipFilePath}`);
      
      // 2. Download the template zip file from S3
      try {
        await this.awsS3Service.downloadFile(key, zipFilePath);
      } catch (err) {
        throw new Error(`Failed to download template file: ${err.message}`);
      }
      
      // 3. Create extraction directory
      if (!fs.existsSync(extractDir)) {
        fs.mkdirSync(extractDir, { recursive: true });
      }
      
      // 4. Extract the zip file
      this.logger.log(`Extracting zip to ${extractDir}`);
      try {
        await extract(zipFilePath, { dir: extractDir });
      } catch (err) {
        throw new Error(`Failed to extract template files: ${err.message}`);
      }
      
      // 5. Check for valid template structure
      // First check for direct index.html
      const hasIndexHtml = fs.existsSync(path.join(extractDir, 'index.html'));
      
      // Check for React/TypeScript project structure
      const isReactProject = fs.existsSync(path.join(extractDir, 'package.json')) && (
        fs.existsSync(path.join(extractDir, 'src/App.tsx')) || 
        fs.existsSync(path.join(extractDir, 'src/app.tsx')) ||
        fs.existsSync(path.join(extractDir, 'src/App.jsx')) ||
        fs.existsSync(path.join(extractDir, 'src/app.jsx'))
      );
      
      // Check for build directory with index.html
      const hasBuildDir = fs.existsSync(path.join(extractDir, 'build/index.html')) || 
                          fs.existsSync(path.join(extractDir, 'dist/index.html'));
      
      // Determine deployment source directory
      let deployDir = extractDir;
      
      if (hasIndexHtml) {
        this.logger.log('Found index.html at root level, using as-is');
      } else if (hasBuildDir) {
        this.logger.log('Found pre-built files, using build/dist directory');
        deployDir = fs.existsSync(path.join(extractDir, 'build')) 
          ? path.join(extractDir, 'build')
          : path.join(extractDir, 'dist');
      } else if (isReactProject) {
        this.logger.log('This is a React source project without a build directory.');
        this.logger.log('For React templates, please include a pre-built version with an index.html file.');
        
        // Create a simple index.html that explains the situation
        const placeholderHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>WebBlueprints Template Demo</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
              .container { max-width: 800px; margin: 0 auto; }
              h1 { color: #333; }
              .note { background: #f8f9fa; padding: 20px; border-radius: 5px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Template Demo Not Available</h1>
              <div class="note">
                <p>This template contains React/TypeScript source files but no compiled version.</p>
                <p>To view a live demo, the template must include a pre-built version with an index.html file.</p>
                <p>Please contact the template creator for more information.</p>
              </div>
            </div>
          </body>
          </html>
        `;
        
        fs.writeFileSync(path.join(extractDir, 'index.html'), placeholderHtml);
        this.logger.log('Created placeholder index.html file');
      } else {
        throw new Error('Template package does not contain index.html or recognized project structure');
      }
      
      // 6. Upload extracted files to demos bucket
      this.logger.log(`Uploading files from ${deployDir} to demo bucket for ${demoId}`);
      try {
        await this.awsS3Service.uploadDirectory(
          deployDir, 
          demoId, 
          process.env.AWS_DEMO_BUCKET || (() => { throw new Error('AWS_DEMO_BUCKET is not defined'); })()
        );
      } catch (err) {
        throw new Error(`Failed to upload demo files: ${err.message}`);
      }
      
      // 7. Clean up temporary files
      this.logger.log('Cleaning up temporary files');
      try {
        if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
        if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
      } catch (err) {
        this.logger.warn(`Failed to clean up temporary files: ${err.message}`);
        // Continue despite cleanup errors
      }
      
      // 8. Build and return the demo URL
      const bucketUrl = process.env.AWS_DEMO_BUCKET_URL || 
        `https://${process.env.AWS_DEMO_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;
      const demoUrl = `${bucketUrl}/${demoId}/index.html`;
      
      this.logger.log(`Demo deployment successful. Demo URL: ${demoUrl}`);
      return demoUrl;
      
    } catch (error) {
      this.logger.error(`Demo processing failed: ${error.message}`);
      throw error;
    }
  }
  
  // Helper method to extract S3 key from URL
  private extractKeyFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove leading slash from pathname
      return urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
    } catch (error) {
      this.logger.error(`Failed to parse URL: ${url}, Error: ${error.message}`);
      return '';
    }
  }
  
  // async removeDemo(templateId: string, userId: string, userRole: string): Promise<void> {
  //   const template = await this.templateModel.findById(templateId);
    
  //   if (!template) {
  //     throw new NotFoundException(`Template with ID ${templateId} not found`);
  //   }
    
  //   // Check permissions
  //   const isAdmin = userRole === 'admin';
  //   const isOwner = template.createdBy.toString() === userId;
    
  //   if (!isAdmin && !isOwner) {
  //     throw new BadRequestException('You do not have permission to remove the demo for this template');
  //   }
    
  //   if (!template.hasLiveDemo || !template.demoDeploymentId) {
  //     throw new BadRequestException('This template does not have a demo');
  //   }
    
  //   try {
  //     // Remove demo files from S3
  //     await this.awsS3Service.deleteDirectory(
  //       template.demoDeploymentId,
  //       process.env.AWS_DEMO_BUCKET || (() => { throw new Error('AWS_DEMO_BUCKET is not defined'); })()
  //     );
      
  //     // Update template
  //     template.demoUrl = null;
  //     template.hasLiveDemo = false;
  //     template.demoDeploymentId = null;
  //     await template.save();
      
  //     this.logger.log(`Demo removed successfully for template ${templateId}`);
  //   } catch (error) {
  //     this.logger.error(`Failed to remove demo: ${error.message}`);
  //     throw new InternalServerErrorException(`Demo removal failed: ${error.message}`);
  //   }
  // }

  async getDemoDetails(templateId: string): Promise<{ hasDemo: boolean; demoUrl?: string; }> {
    const template = await this.templateModel.findById(templateId);
    
    if (!template) {
      throw new NotFoundException(`Template with ID ${templateId} not found`);
    }
    
    return {
      hasDemo: template.hasLiveDemo || false,
      demoUrl: template.demoUrl ?? undefined
    };
  }

  async findTemplatesWithDemo(): Promise<TemplateDocument[]> {
    return this.templateModel.find({ hasLiveDemo: true, status: 'published' })
      .sort({ createdAt: -1 })
      .exec();
  }


  async findByStatus(status: string): Promise<TemplateDocument[]> {
    return this.templateModel.find({ status })
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 })
      .exec();
  }
  
  async findByUser(userId: string): Promise<Template[]> {
    this.logger.log(`Finding templates for user with ID: ${userId}`);
    return this.templateModel.find({ createdBy: userId })
      .sort({ createdAt: -1 })
      .exec();
  }
  
  async updateStatus(
    id: string, 
    status: string, 
    adminComment?: string,
    reviewerId?: string
  ): Promise<TemplateDocument> {
    const template = await this.templateModel.findById(id);
    
    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }
    
    template.status = status;
    // template.reviewedAt = new Date();
    
    
    template.adminComments = adminComment || '';
    const updatedTemplate = await template.save();
    
    // TODO: Add notification logic here (email, in-app notification, etc.)
    
    return updatedTemplate;
  }
  
  async findAll(query: any): Promise<{ templates: TemplateDocument[], total: number }> {
    const { page = 1, limit = 10, status, category, search } = query;
    const skip = (page - 1) * limit;
    
    const filter: any = {};
    
    if (status) {
      filter.status = status;
    }
    
    if (category) {
      filter.category = category;
    }
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { techStack: { $regex: search, $options: 'i' } }
      ];
    }
    
    const [templates, total] = await Promise.all([
      this.templateModel.find(filter)
        .populate('createdBy', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.templateModel.countDocuments(filter)
    ]);
    
    return { templates, total };
  }

  async findOne(id: string): Promise<Template> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Invalid template id: ${id}`);
    }
    const template = await this.templateModel.findById(id).exec();
    if (!template) {
      throw new NotFoundException(`Template with id ${id} not found`);
    }
    return template;
  }

  async update(id: string, data: Partial<Template>): Promise<Template> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Invalid template id: ${id}`);
    }
    const updated = await this.templateModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!updated) {
      throw new NotFoundException(`Template with id ${id} not found`);
    }
    return updated;
  }

  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Invalid template id: ${id}`);
    }
    const result = await this.templateModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Template with id ${id} not found`);
    }
  }
}