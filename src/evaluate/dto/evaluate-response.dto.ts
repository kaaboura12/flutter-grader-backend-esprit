export class CheckResult {
  name: string;
  passed: boolean;
  message?: string;
  score?: number;
}

export class EvaluateResponseDto {
  totalScore: number;
  maxScore: number;
  checks: CheckResult[];
  feedback?: string;
  details?: {
    cloneSuccessful: boolean;
    filesValid: boolean;
    pubGetSuccessful: boolean;
    buildSuccessful: boolean;
    testsPassed: boolean;
    groqEvaluation?: {
      score: number;
      feedback: string;
    };
  };
}


