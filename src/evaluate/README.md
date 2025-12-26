# Evaluate Service

Professional Flutter code evaluation service that automatically grades Flutter projects from GitHub repositories.

## Features

- **Git Repository Cloning**: Automatically clones GitHub repositories for evaluation
- **File Validation**: Verifies required files (`pubspec.yaml`, `lib/main.dart`) exist
- **Flutter Checks**: Runs `flutter pub get`, build verification, and tests
- **AI-Powered Evaluation**: Uses Groq API to evaluate code quality and implementation
- **Comprehensive Scoring**: Returns detailed scoring breakdown out of 20 points
- **Automatic Cleanup**: Removes cloned repositories after evaluation

## Scoring System

The evaluation follows a strict scoring system out of 20 points:

1. **Clone Failure**: 0/20 (if repository cannot be cloned)
2. **Missing Files**: 0/20 (if `pubspec.yaml` or `lib/main.dart` is missing)
3. **Dependencies**: Maximum 5/20 (if `flutter pub get` fails, evaluation stops at 5/20)
4. **Build Check**: Maximum 5/20 (if app doesn't compile, evaluation stops at 5/20)
5. **Tests**: +5 points (if `flutter test` passes)
6. **Groq Evaluation**: Remaining points up to 20 (code quality, implementation, best practices)

## API Endpoint

### POST /evaluate

Evaluates a Flutter project from a GitHub repository.

**Request Body:**
```json
{
  "repoUrl": "https://github.com/username/repo-name"
}
```

**Response:**
```json
{
  "totalScore": 18,
  "maxScore": 20,
  "checks": [
    {
      "name": "Clone Repository",
      "passed": true,
      "message": "Repository cloned successfully",
      "score": 0
    },
    {
      "name": "Required Files Check",
      "passed": true,
      "message": "pubspec.yaml and lib/main.dart exist",
      "score": 0
    },
    {
      "name": "Flutter Pub Get",
      "passed": true,
      "message": "Dependencies installed successfully",
      "score": 0
    },
    {
      "name": "Build Check",
      "passed": true,
      "message": "App compiles successfully",
      "score": 0
    },
    {
      "name": "Flutter Test",
      "passed": true,
      "message": "All tests passed",
      "score": 5
    },
    {
      "name": "Groq Code Evaluation",
      "passed": true,
      "message": "Code evaluated by Groq",
      "score": 13
    }
  ],
  "feedback": "Detailed feedback from Groq evaluation...",
  "details": {
    "cloneSuccessful": true,
    "filesValid": true,
    "pubGetSuccessful": true,
    "buildSuccessful": true,
    "testsPassed": true,
    "groqEvaluation": {
      "score": 13,
      "feedback": "Detailed feedback..."
    }
  }
}
```

## Setup

### Environment Variables

Create a `.env` file in the root directory:

```env
GROQ_API_KEY=your_groq_api_key_here
PORT=3000
```

### Requirements

- Node.js and npm
- Flutter SDK installed and available in PATH
- Groq API key (get one from https://console.groq.com)

## Usage

```typescript
import { EvaluateService } from './evaluate.service';

// Inject service
constructor(private readonly evaluateService: EvaluateService) {}

// Evaluate repository
const result = await this.evaluateService.evaluate('https://github.com/user/repo');
console.log(`Score: ${result.totalScore}/${result.maxScore}`);
```

## Evaluation Process

1. **Clone Repository**: Clones the GitHub repository to a temporary directory
2. **Validate Files**: Checks for `pubspec.yaml` and `lib/main.dart`
3. **Install Dependencies**: Runs `flutter pub get`
4. **Verify Build**: Runs `flutter analyze` or `flutter build` to check compilation
5. **Run Tests**: Executes `flutter test` (adds 5 points if successful)
6. **Collect Code**: Gathers all `.dart` files from `lib/` directory
7. **Groq Evaluation**: Sends code to Groq API for AI-powered evaluation
8. **Calculate Score**: Combines all scores (max 20 points)
9. **Cleanup**: Removes cloned repository directory

## Error Handling

The service includes comprehensive error handling:

- **Invalid URL**: Returns `400 Bad Request`
- **Clone Failure**: Returns score 0/20
- **Missing Files**: Returns score 0/20
- **Dependency Issues**: Returns maximum 5/20
- **Build Failures**: Returns maximum 5/20
- **Groq API Errors**: Returns partial score with error message
- **Server Errors**: Returns `500 Internal Server Error` with descriptive message

## Logging

The service logs all important events:

- Repository cloning status
- File validation results
- Flutter command outputs
- Groq API requests
- Score calculations
- Cleanup operations

## Notes

- Cloned repositories are automatically cleaned up after evaluation
- The service uses shallow clones (`--depth 1`) for faster cloning
- Flutter commands have timeouts to prevent hanging
- Only files in the `lib/` directory are sent to Groq for evaluation


