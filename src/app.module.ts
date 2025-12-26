import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EvaluateModule } from './evaluate/evaluate.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EvaluateModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
