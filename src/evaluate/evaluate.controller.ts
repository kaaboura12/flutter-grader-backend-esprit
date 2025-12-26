import { Controller } from '@nestjs/common';
import { EvaluateService } from './evaluate.service';

@Controller('evaluate')
export class EvaluateController {
  constructor(private readonly evaluateService: EvaluateService) {}
}
