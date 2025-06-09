import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TemplatesModule } from './templates/templates.module';
import { CommonModule } from './common/common.module';

const MONGODB_DEFAULT_URI = 'mongodb://localhost:27017/webblueprints';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forRoot(process.env.MONGO_URI || MONGODB_DEFAULT_URI, {
      serverSelectionTimeoutMS: 5000
    }),
    AuthModule,
    UsersModule,
    TemplatesModule,
    CommonModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}