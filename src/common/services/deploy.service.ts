// deploy.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as extract from 'extract-zip';
import * as rimraf from 'rimraf';

@Injectable()
export class DeployService {
  private readonly logger = new Logger(DeployService.name);
  private s3Client: AWS.S3;
  private cloudfront: AWS.CloudFront;

  constructor() {
    this.s3Client = new AWS.S3({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    
    this.cloudfront = new AWS.CloudFront({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  async deployTemplate(templateUrl: string): Promise<{ url: string, deploymentId: string }> {
    try {
      // 1. Download template zip from S3
      const key = this.getS3KeyFromUrl(templateUrl);
      const deploymentId = `demo-${Date.now()}`;
      const localZipPath = path.join('/tmp', `${deploymentId}.zip`);
      const extractPath = path.join('/tmp', deploymentId);
      
      await this.downloadFromS3(key, localZipPath);
      
      // 2. Extract zip
      await extract(localZipPath, { dir: extractPath });
      
      // 3. Upload files to demo bucket
      const demoBucket = process.env.AWS_DEMO_BUCKET;
      if (!demoBucket) {
        throw new Error('AWS_DEMO_BUCKET environment variable is not defined');
      }
      await this.uploadDirectory(extractPath, demoBucket, deploymentId);
      
      // 4. Create CloudFront invalidation if needed
      if (process.env.CLOUDFRONT_DISTRIBUTION_ID) {
        await this.invalidateCache(`/${deploymentId}/*`);
      }
      
      // 5. Clean up local files
      fs.unlinkSync(localZipPath);
      rimraf.sync(extractPath);
      
      // 6. Return demo URL
      const demoUrl = `https://${demoBucket}.s3.amazonaws.com/${deploymentId}/index.html`;
      
      return { url: demoUrl, deploymentId };
    } catch (error) {
      this.logger.error(`Error deploying template: ${error.message}`);
      throw error;
    }
  }

  async removeDeployment(deploymentId: string): Promise<void> {
    // Delete all files with this deployment ID prefix
    await this.s3Client.deleteObjects({
      Bucket: process.env.AWS_DEMO_BUCKET || (() => { throw new Error('AWS_DEMO_BUCKET environment variable is not defined'); })(),
      Delete: {
        Objects: await this.listObjects(process.env.AWS_DEMO_BUCKET, deploymentId)
      }
    }).promise();
  }

  // Helper methods
  private getS3KeyFromUrl(url: string): string {
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1);
  }

  private async downloadFromS3(key: string, localPath: string): Promise<void> {
    const file = fs.createWriteStream(localPath);
    const stream = this.s3Client
      .getObject({
        Bucket: process.env.AWS_S3_BUCKET || (() => { throw new Error('AWS_S3_BUCKET environment variable is not defined'); })(),
        Key: key,
      })
      .createReadStream();

    return new Promise((resolve, reject) => {
      stream.pipe(file)
        .on('error', reject)
        .on('close', resolve);
    });
  }

  private async uploadDirectory(directory: string, bucket: string, prefix: string): Promise<void> {
    const files = this.getAllFiles(directory);
    
    for (const file of files) {
      const relPath = path.relative(directory, file);
      const key = `${prefix}/${relPath}`;
      
      await this.s3Client.putObject({
        Bucket: bucket,
        Key: key,
        Body: fs.createReadStream(file),
        ContentType: this.getContentType(file),
      }).promise();
    }
  }

  private getAllFiles(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    
    list.forEach(file => {
      file = path.join(dir, file);
      const stat = fs.statSync(file);
      
      if (stat && stat.isDirectory()) {
        results = results.concat(this.getAllFiles(file));
      } else {
        results.push(file);
      }
    });
    
    return results;
  }

  private getContentType(file: string): string {
    const ext = path.extname(file).toLowerCase();
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

  private async listObjects(bucket: string, prefix: string): Promise<AWS.S3.ObjectIdentifier[]> {
    const objects: AWS.S3.ObjectIdentifier[] = [];
    let continuationToken: string | undefined = undefined;
    
    do {
      const response = await this.s3Client.listObjectsV2({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }).promise();
      
      (response.Contents ?? []).forEach(obj => {
        if (obj.Key) {
          objects.push({ Key: obj.Key });
        }
      });
      
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    
    return objects;
  }

  private async invalidateCache(path: string): Promise<void> {
    await this.cloudfront.createInvalidation({
      DistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID || (() => { throw new Error('CLOUDFRONT_DISTRIBUTION_ID environment variable is not defined'); })(),
      InvalidationBatch: {
        CallerReference: Date.now().toString(),
        Paths: {
          Quantity: 1,
          Items: [path],
        },
      },
    }).promise();
  }
}