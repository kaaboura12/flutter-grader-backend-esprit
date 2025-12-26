import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { EvaluateService } from './evaluate.service';
import { EvaluateRequestDto } from './dto/evaluate-request.dto';
import { EvaluateResponseDto } from './dto/evaluate-response.dto';

@Controller('evaluate')
export class EvaluateController {
  private readonly logger = new Logger(EvaluateController.name);

  constructor(private readonly evaluateService: EvaluateService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async evaluate(@Body() evaluateRequest: EvaluateRequestDto): Promise<EvaluateResponseDto> {
    this.logger.log(`Received evaluation request for: ${evaluateRequest.repoUrl}`);
    const result = await this.evaluateService.evaluate(evaluateRequest.repoUrl);
    this.logger.log(`Evaluation completed. Score: ${result.totalScore}/${result.maxScore}`);
    return result;
  }
}
