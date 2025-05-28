import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type TemplateDocument = Template & Document;

@Schema({ timestamps: true })
export class Template {
  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop([String])
  tags: string[];

  @Prop()
  category: string;

  @Prop()
  techStack: string;

  @Prop()
  previewImageUrl: string;

  @Prop()
  downloadUrl: string;

  @Prop()
  isPremium: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const TemplateSchema = SchemaFactory.createForClass(Template);