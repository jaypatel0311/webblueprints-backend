// src/templates/demo/demo.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Template } from '../template.schema';
import { AwsS3Service } from '../../common/services/aws-s3.service';
import * as fs from 'fs';
import * as path from 'path';
import * as extract from 'extract-zip';
import * as os from 'os';

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    @InjectModel(Template.name) private templateModel: Model<Template>,
    private readonly awsS3Service: AwsS3Service
  ) {}

  async generateDemo(templateId: string, userId: string): Promise<string> {
    // Find template
    const template = await this.templateModel.findById(templateId);
    if (!template) {
      throw new NotFoundException(`Template with ID ${templateId} not found`);
    }
    
    if (!template.downloadUrl) {
      throw new Error('Template has no downloadable files');
    }
    
    try {
      // Get template file
      const key = this.extractKeyFromUrl(template.downloadUrl);
      const demoId = `demo-${templateId}-${Date.now()}`;
      const tempZipPath = path.join(os.tmpdir(), `${demoId}.zip`);
      const extractPath = path.join(os.tmpdir(), demoId);
      
      // Download template zip from S3
      await this.awsS3Service.downloadFile(key, tempZipPath);
      
      // Extract zip
      await extract(tempZipPath, { dir: extractPath });

      // Check directory structure after extraction
      let deployPath = extractPath;
      let subfolderName = '';
      
      // Look for index.html in root or in a subfolder
      if (!fs.existsSync(path.join(extractPath, 'index.html'))) {
        // Check if there's a single subfolder containing index.html
        const entries = fs.readdirSync(extractPath);
        for (const entry of entries) {
          const entryPath = path.join(extractPath, entry);
          if (fs.statSync(entryPath).isDirectory() && 
              fs.existsSync(path.join(entryPath, 'index.html'))) {
            deployPath = entryPath;
            subfolderName = entry;
            this.logger.log(`Found index.html in subfolder: ${entry}`);
            break;
          }
        }
      }
      
      // Upload extracted files to demo bucket
      const demoUrl = await this.awsS3Service.uploadDirectory(
        deployPath, 
        demoId + (subfolderName ? `/${subfolderName}` : ''), 
        process.env.AWS_DEMO_BUCKET || (() => { throw new Error('AWS_DEMO_BUCKET is not defined'); })()
      );
      
      // Clean up temp files
      fs.unlinkSync(tempZipPath);
      fs.rmdirSync(extractPath, { recursive: true });
      
      // Update template with demo URL
      template.demoUrl = demoUrl;
      template.hasLiveDemo = true;
      template.demoDeploymentId = demoId;
      await template.save();
      
      return demoUrl;
    } catch (error) {
      this.logger.error(`Failed to generate demo: ${error.message}`);
      throw new Error(`Demo generation failed: ${error.message}`);
    }
  }

  async removeDemo(templateId: string): Promise<void> {
    const template = await this.templateModel.findById(templateId);
    if (!template || !template.demoDeploymentId) return;

    try {
      await this.awsS3Service.deleteDirectory(
        template.demoDeploymentId,
        process.env.AWS_DEMO_BUCKET || (() => { throw new Error('AWS_DEMO_BUCKET is not defined'); })()
      );
      
      template.demoUrl = '';
      template.hasLiveDemo = false;
      template.demoDeploymentId = '';
      await template.save();
    } catch (error) {
      this.logger.error(`Failed to remove demo: ${error.message}`);
      throw new Error(`Demo removal failed: ${error.message}`);
    }
  }
  
  private extractKeyFromUrl(url: string): string {
    const parsedUrl = new URL(url);
    return decodeURIComponent(parsedUrl.pathname.substring(1));
  }
}