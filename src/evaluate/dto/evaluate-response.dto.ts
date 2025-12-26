export class CheckResult {
  name: string;
  passed: boolean;
  message?: string;
  score?: number;
}

export class GroqEvaluationSummary {
  score: number;
  summary: string;
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: string;
}

export class EvaluateResponseDto {
  totalScore: number;
  maxScore: number;
  checks: CheckResult[];
  feedback?: string;
  summary?: string; // Main summary for frontend display
  details?: {
    cloneSuccessful: boolean;
    filesValid: boolean;
    pubGetSuccessful: boolean;
    buildSuccessful: boolean;
    testsPassed: boolean;
    groqEvaluation?: GroqEvaluationSummary;
  };
}


