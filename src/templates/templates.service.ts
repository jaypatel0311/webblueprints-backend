import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Template, TemplateDocument } from './template.schema';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(Template.name) private templateModel: Model<TemplateDocument>,
  ) {}

  async create(data: Partial<Template>): Promise<Template> {
    const newTemplate = new this.templateModel(data);
    return newTemplate.save();
  }

  async findAll(): Promise<Template[]> {
    return this.templateModel.find().exec();
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