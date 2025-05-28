import { Body, Controller, Post, Get, Param, Put, Delete } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  create(@Body() createTemplateDto: CreateTemplateDto) {
    const transformedDto = {
      ...createTemplateDto,
      createdBy: createTemplateDto.createdBy ? new ObjectId(createTemplateDto.createdBy) : undefined,
    };
    return this.templatesService.create(transformedDto);
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