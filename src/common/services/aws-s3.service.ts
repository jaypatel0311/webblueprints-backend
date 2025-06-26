import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AwsS3Service {
  private readonly s3Client: S3Client;
  private readonly logger = new Logger(AwsS3Service.name);

  constructor() {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error('AWS S3 configuration is missing required environment variables.');
    }

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    try {
      const originalname = file.originalname.replace(/\s+/g, '_');
      const key = `${folder}/${Date.now()}-${originalname}`;
      
      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        // REMOVED: ACL: 'public-read'
      };

      const command = new PutObjectCommand(params);
      await this.s3Client.send(command);
      
      const fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      return fileUrl;
    } catch (error) {
      this.logger.error(`Error uploading file to S3: ${error.message}`, error.stack);
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  async downloadFile(key: string, localFilePath: string): Promise<void> {
    try {
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
      });
      
      const response = await this.s3Client.send(command);
      const writeStream = fs.createWriteStream(localFilePath);
      
      return new Promise((resolve, reject) => {
        if (!response.Body) {
          throw new Error('Response body is undefined.');
        }

        const readableStream = response.Body as NodeJS.ReadableStream;
        readableStream.pipe(writeStream)
          .on('finish', () => resolve())
          .on('error', err => reject(err));
      });
    } catch (error) {
      this.logger.error(`Error downloading file from S3: ${error.message}`);
      throw error;
    }
  }

  async uploadDirectory(directory: string, prefix: string, bucket: string): Promise<string> {
    try {
      const files = this.getAllFiles(directory);
      let indexPath = '';
      if (!fs.existsSync(path.join(directory, 'index.html'))) {
        // Find which subfolder has the index.html
        const contents = fs.readdirSync(directory);
        for (const item of contents) {
          const itemPath = path.join(directory, item);
          if (fs.statSync(itemPath).isDirectory() && 
              fs.existsSync(path.join(itemPath, 'index.html'))) {
            indexPath = `/${item}`;
            break;
          }
        }
      }
      
      // Construct URL with potential subfolder path
      const websiteUrl = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${prefix}${indexPath}/index.html`;      
      for (const file of files) {
        const relativePath = path.relative(directory, file);
        const key = `${prefix}/${relativePath}`;
        
        const fileBuffer = fs.readFileSync(file);
        const contentType = this.getContentType(file);
        
        await this.s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
          // ACL: 'public-read'
        }));
      }
      
      return websiteUrl;
    } catch (error) {
      this.logger.error(`Error uploading directory to S3: ${error.message}`);
      throw error;
    }
  }

  async deleteDirectory(prefix: string, bucket: string): Promise<void> {
    try {
      // List all objects with the prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
      });
      
      const listedObjects = await this.s3Client.send(listCommand);
      
      if (!listedObjects.Contents || listedObjects.Contents.length === 0) return;
      
      // Delete each object
      for (const object of listedObjects.Contents) {
        await this.s3Client.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: object.Key,
        }));
      }
    } catch (error) {
      this.logger.error(`Error deleting directory from S3: ${error.message}`);
      throw error;
    }
  }
  
  private getAllFiles(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat && stat.isDirectory()) {
        results = results.concat(this.getAllFiles(filePath));
      } else {
        results.push(filePath);
      }
    }
    
    return results;
  }
  
  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
    };
    
    return types[ext] || 'application/octet-stream';
  }
}