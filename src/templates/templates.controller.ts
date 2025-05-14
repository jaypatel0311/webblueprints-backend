import { Controller, Get, Post, Body } from '@nestjs/common';
import { TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  create(@Body() data: any) {
    return this.templatesService.create(data);
  }

  @Get()
  findAll() {
    return this.templatesService.findAll();
  }
}
