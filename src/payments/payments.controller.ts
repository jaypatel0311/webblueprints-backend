import { 
    Controller, 
    Post, 
    Body, 
    UseGuards, 
    Req, 
    Get, 
    Param,
    Headers,
    RawBodyRequest,
    HttpCode,
    HttpStatus,
    BadRequestException
  } from '@nestjs/common';
  import { PaymentsService } from './payments.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  
  @Controller('payments')
  export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) {}
  
    @Post('create-payment-intent')
    @UseGuards(JwtAuthGuard)
    async createPaymentIntent(
      @Body() body: any,
      @Req() req
    ) {
      console.log('Request body:', body);
      
      let templateId: string;
      
      // Handle different body structures
      if (body.templateId) {
        // Single template format: { templateId: "xxx" }
        templateId = body.templateId;
      } else if (body.templates && body.templates.length > 0) {
        // Multiple templates format: { templates: [{ templateId: "xxx" }] }
        templateId = body.templates[0].templateId;
      } else {
        throw new BadRequestException('Template ID is required');
      }
      
      console.log('Template ID:', templateId);
      console.log('User ID:', req.user.userId);
      
      if (!templateId) {
        throw new BadRequestException('Template ID is required');
      }
      
      return this.paymentsService.createPaymentIntent(
        templateId,
        req.user.userId
      );
    }

    @Post('create-order')
    @UseGuards(JwtAuthGuard)
    async createOrder(
      @Body() body: {
        paymentIntentId: string;
        templates: string[]; // Array of template IDs
        totalAmount: number;
        status: string;
      },
      @Req() req
    ) {
      console.log('Create order request body:', body);
      
      if (!body.templates || body.templates.length === 0) {
        throw new BadRequestException('Templates array is required');
      }
      
      if (!body.paymentIntentId) {
        throw new BadRequestException('Payment Intent ID is required');
      }
      
      // For now, handle the first template (you can modify this for multiple templates later)
      const templateId = body.templates[0];
      
      // You might want to fetch template details to get the title
      // For now, using a placeholder title
      return this.paymentsService.createOrder(
        body.paymentIntentId,
        req.user.userId,
        templateId,
        body.totalAmount,
        'Template Purchase' // You can fetch actual template title if needed
      );
    }
  
    @Post('webhook')
    @HttpCode(HttpStatus.OK)
    async handleWebhook(
      @Headers('stripe-signature') signature: string,
      @Req() req: RawBodyRequest<Request>
    ) {
      if (!req.rawBody) {
        throw new BadRequestException('Request raw body is missing');
      }
      return this.paymentsService.handleWebhook(signature, req.rawBody);
    }
  
    @Get('orders')
    @UseGuards(JwtAuthGuard)
    async getUserOrders(@Req() req) {
      return this.paymentsService.getUserOrders(req.user.userId);
    }
  
    @Get('order/:paymentIntentId')
    @UseGuards(JwtAuthGuard)
    async getOrder(@Param('paymentIntentId') paymentIntentId: string) {
      return this.paymentsService.getOrderByPaymentIntent(paymentIntentId);
    }
  }