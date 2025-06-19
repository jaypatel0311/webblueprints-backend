import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { CreateTemplateDto } from './dto/create-template.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Template, TemplateDocument } from './template.schema';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectModel(Template.name) private templateModel: Model<TemplateDocument>,
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
    template.reviewedAt = new Date();
    
    
    template.adminComment = adminComment || '';
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