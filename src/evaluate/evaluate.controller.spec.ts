import { Test, TestingModule } from '@nestjs/testing';
import { EvaluateController } from './evaluate.controller';
import { EvaluateService } from './evaluate.service';

describe('EvaluateController', () => {
  let controller: EvaluateController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EvaluateController],
      providers: [EvaluateService],
    }).compile();

    controller = module.get<EvaluateController>(EvaluateController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
