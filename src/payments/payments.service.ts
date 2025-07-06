import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Stripe from 'stripe';
import { Order, OrderDocument } from './schemas/order.schema';
import { TemplatesService } from '../templates/templates.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private templatesService: TemplatesService,
  ) {
    const stripeSecretKey = this.configService.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined in the configuration');
    }
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-06-30.basil',
    });
  }

  async createPaymentIntent(templateId: string, userId: string) {
    try {
      // Get template details
      const template = await this.templatesService.findOne(templateId);
      if (!template) {
        throw new BadRequestException('Template not found');
      }

      // Convert price to cents (Stripe expects amount in smallest currency unit)
      const amount = Math.round(template.price * 100);

      // Create payment intent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        metadata: {
          templateId,
          userId,
          templateTitle: template.title,
        },
      });

      this.logger.log(`Payment intent created: ${paymentIntent.id} for template: ${templateId}`);

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: template.price,
        currency: 'usd',
        templateTitle: template.title,
      };
    } catch (error) {
      this.logger.error(`Error creating payment intent: ${error.message}`);
      throw new BadRequestException('Failed to create payment intent');
    }
  }

  async createOrder(
    paymentIntentId: string,
    userId: string,
    templateId: string,
    amount: number,
    templateTitle: string
  ): Promise<OrderDocument> {
    const order = new this.orderModel({
      stripePaymentIntentId: paymentIntentId,
      userId,
      templateId,
      amount,
      currency: 'usd',
      status: 'succeeded',
      metadata: {
        templateTitle,
      },
    });
  
    return await order.save();
  }

  async handleWebhook(signature: string, payload: Buffer) {
    const webhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET');
    
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );

      this.logger.log(`Received webhook: ${event.type}`);

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
          break;
        default:
          this.logger.log(`Unhandled event type: ${event.type}`);
      }

      return { received: true };
    } catch (error) {
      this.logger.error(`Webhook signature verification failed: ${error.message}`);
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
    try {
      const order = await this.orderModel.findOne({
        stripePaymentIntentId: paymentIntent.id,
      });

      if (order) {
        order.status = 'succeeded';
        await order.save();
        
        this.logger.log(`Payment succeeded for order: ${order._id}`);
        
        // Here you can add logic to:
        // 1. Send download link to user
        // 2. Grant access to template
        // 3. Send confirmation email
      }
    } catch (error) {
      this.logger.error(`Error handling payment success: ${error.message}`);
    }
  }

  private async handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
    try {
      const order = await this.orderModel.findOne({
        stripePaymentIntentId: paymentIntent.id,
      });

      if (order) {
        order.status = 'failed';
        await order.save();
        
        this.logger.log(`Payment failed for order: ${order._id}`);
      }
    } catch (error) {
      this.logger.error(`Error handling payment failure: ${error.message}`);
    }
  }

  async getUserOrders(userId: string) {
    try {
      // Get all orders for the user
      const orders = await this.orderModel
        .find({ userId })
        .populate('templateId')
        .sort({ createdAt: -1 })
        .exec();
  
      // Group orders by paymentIntentId to handle multiple templates in one order
      const groupedOrders = orders.reduce((acc, order) => {
        const paymentIntentId = order.stripePaymentIntentId;
        
        if (!acc[paymentIntentId]) {
          acc[paymentIntentId] = {
            paymentIntentId,
            status: order.status,
            currency: order.currency,
            totalAmount: 0,
            createdAt: order.createdAt,  
            updatedAt: order.updatedAt,
            templates: [],
            metadata: order.metadata
          };
        }
        
        // Add this template to the order
        acc[paymentIntentId].templates.push({
          templateId: order.templateId,
          amount: order.amount
        });
        
        // Add to total amount
        acc[paymentIntentId].totalAmount += order.amount;
        
        return acc;
      }, {});
  
      // Convert back to array and sort by creation date
      return Object.values(groupedOrders).sort((a: { createdAt: string }, b: { createdAt: string }) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      this.logger.error(`Error getting user orders: ${error.message}`);
      throw error;
    }
  }

  async getOrderByPaymentIntent(paymentIntentId: string) {
    return this.orderModel
      .findOne({ stripePaymentIntentId: paymentIntentId })
      .populate('templateId')
      .exec();
  }
}