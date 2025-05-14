import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Template, TemplateDocument } from './template.schema';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(Template.name) private templateModel: Model<TemplateDocument>,
  ) {}

  async create(data: any): Promise<Template> {
    const newTemplate = new this.templateModel(data);
    return newTemplate.save();
  }

  async findAll(): Promise<Template[]> {
    return this.templateModel.find().exec();
  }
}
