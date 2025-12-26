import { Module } from '@nestjs/common';
import { EvaluateService } from './evaluate.service';
import { EvaluateController } from './evaluate.controller';

@Module({
  controllers: [EvaluateController],
  providers: [EvaluateService],
})
export class EvaluateModule {}
