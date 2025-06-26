import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Template {
  @Prop({ required: true, type: String })
  title: string;

  @Prop({ required: true, type: String })
  description: string;

  @Prop({ type: Number, default: 0 })
  price: number;

  @Prop({ type: String })
  category: string;

  @Prop({ type: String })
  previewImageUrl: string;

  @Prop({ type: String })
  downloadUrl: string;

  @Prop({ 
    type: MongooseSchema.Types.ObjectId, 
    ref: 'User',
    required: true 
  })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ 
    type: String, 
    enum: ['pending', 'published', 'rejected'], 
    default: 'pending' 
  })
  status: string;

  @Prop({ type: String, default: '' })
  rejectionReason: string;

  @Prop({ type: String, default: '' })
  adminComments: string;

  // Demo fields with explicit types
  @Prop({ type: String, default: null })
  demoUrl: string;

  @Prop({ type: Boolean, default: false })
  hasLiveDemo: boolean;

  @Prop({ type: String, default: null })
  demoDeploymentId: string;
}

export type TemplateDocument = Template & Document;
export const TemplateSchema = SchemaFactory.createForClass(Template);