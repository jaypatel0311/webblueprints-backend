import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);
  
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization;
    
    this.logger.log(`JWT Guard - URL: ${request.url}, Token: ${token ? 'Present' : 'Missing'}`);
    
    return super.canActivate(context);
  }

  handleRequest(err, user, info, context) {
    if (err || !user) {
      this.logger.error(`JWT Auth failed: ${err?.message || 'No user'} | Info: ${JSON.stringify(info)}`);
      throw err || new UnauthorizedException('Authentication required');
    }
    
    this.logger.log(`JWT Auth success: ${user.userId}`);
    return user;
  }
}