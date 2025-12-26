import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EvaluateModule } from './evaluate/evaluate.module';

@Module({
  imports: [EvaluateModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
