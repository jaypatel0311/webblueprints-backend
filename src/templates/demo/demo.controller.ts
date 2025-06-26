import { 
    Controller, Post, Delete, Param, 
    UseGuards, Req, Body, Get, 
    ForbiddenException, NotFoundException 
  } from '@nestjs/common';
  import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
  import { DemoService } from './demo.service';
  import { GenerateDemoDto } from './dto/generate-demo.dto';
  import { InjectModel } from '@nestjs/mongoose';
  import { Model } from 'mongoose';
  import { Template } from '../template.schema';
  
  import { Logger } from '@nestjs/common';

  @Controller('templates')
  export class DemoController {
    private readonly logger = new Logger(DemoController.name);
    constructor(
      private readonly demoService: DemoService,
      @InjectModel(Template.name) private templateModel: Model<Template>
    ) {}
  
    @Post(':id/demo')
    @UseGuards(JwtAuthGuard)
    async generateDemo(
      @Param('id') id: string,
      @Body() generateDemoDto: GenerateDemoDto,
      @Req() req
    ) {
      try {
        this.logger.log(`Auth user: ${req.user?.userId}, role: ${req.user?.role}`);
        
        const isAdmin = req.user?.role === 'admin';
        
        const template = await this.templateModel.findById(id);
        if (!template) {
          throw new NotFoundException(`Template with ID ${id} not found`);
        }
        
        this.logger.log(`Template creator: ${template.createdBy.toString()}`);
        const isOwner = template.createdBy.toString() === req.user.userId;
        
        this.logger.log(`isAdmin: ${isAdmin}, isOwner: ${isOwner}`);
        if (!isAdmin && !isOwner) {
          throw new ForbiddenException('Unauthorized to generate demo for this template');
        }
        
        const demoUrl = await this.demoService.generateDemo(id, req.user.userId);
        return { demoUrl };
      } catch (error) {
        this.logger.error(`Error in generateDemo: ${error.message}`);
        throw error; // Let the exception filter handle this
      }
    }
  }