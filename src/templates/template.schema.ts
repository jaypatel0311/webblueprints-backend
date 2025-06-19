import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

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

  @Prop({ type: Number, min: 0, default: 0 })
  price: number;

  @Prop()
  previewImageUrl: string;

  @Prop()
  downloadUrl: string;

  @Prop({ default: false })
  isPremium: boolean;

  @Prop({ 
    type: String, 
    enum: ['pending', 'published', 'rejected'], 
    default: 'pending' 
  })
  status: string;

  @Prop({ type: String, default: '' })
  adminComment: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  reviewedBy: MongooseSchema.Types.ObjectId;

  @Prop()
  reviewedAt: Date;
}

export const TemplateSchema = SchemaFactory.createForClass(Template);
export type TemplateDocument = Template & Document;