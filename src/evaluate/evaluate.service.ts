import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import simpleGit from 'simple-git';
import * as fs from 'fs-extra';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import axios from 'axios';
import { EvaluateRequestDto } from './dto/evaluate-request.dto';
import { EvaluateResponseDto, CheckResult } from './dto/evaluate-response.dto';

const execAsync = promisify(exec);

@Injectable()
export class EvaluateService {
  private readonly logger = new Logger(EvaluateService.name);
  private readonly tempDir = path.join(process.cwd(), 'temp-repos');
  private readonly groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions';
  private readonly assignmentDescription = `Create a Todo app with:
- Add todo
- Delete todo
- Mark todo as complete`;

  constructor(private readonly configService: ConfigService) {
    // Ensure temp directory exists
    fs.ensureDirSync(this.tempDir);
  }

  async evaluate(repoUrl: string): Promise<EvaluateResponseDto> {
    const checks: CheckResult[] = [];
    let totalScore = 0;
    const maxScore = 20;
    let repoPath: string | null = null;

    try {
      // Validate repo URL
      if (!this.isValidGitHubUrl(repoUrl)) {
        throw new BadRequestException('Invalid GitHub repository URL');
      }

      // Step 1: Clone repository
      this.logger.log(`Cloning repository: ${repoUrl}`);
      repoPath = await this.cloneRepository(repoUrl);
      
      if (!repoPath) {
        checks.push({
          name: 'Clone Repository',
          passed: false,
          message: 'Failed to clone repository',
          score: 0,
        });
        return this.buildResponse(0, maxScore, checks, {
          cloneSuccessful: false,
          filesValid: false,
          pubGetSuccessful: false,
          buildSuccessful: false,
          testsPassed: false,
        }, 'Repository cloning failed. Score: 0/20');
      }

      checks.push({
        name: 'Clone Repository',
        passed: true,
        message: 'Repository cloned successfully',
        score: 0,
      });

      // Step 2: Check required files
      this.logger.log('Checking required files');
      const filesValid = await this.checkRequiredFiles(repoPath);
      
      if (!filesValid.valid) {
        checks.push({
          name: 'Required Files Check',
          passed: false,
          message: filesValid.message,
          score: 0,
        });
        return this.buildResponse(0, maxScore, checks, {
          cloneSuccessful: true,
          filesValid: false,
          pubGetSuccessful: false,
          buildSuccessful: false,
          testsPassed: false,
        }, filesValid.message || 'Required files missing. Score: 0/20');
      }

      checks.push({
        name: 'Required Files Check',
        passed: true,
        message: 'pubspec.yaml and lib/main.dart exist',
        score: 0,
      });

      // Step 3: Run flutter pub get
      this.logger.log('Running flutter pub get');
      const pubGetResult = await this.runFlutterPubGet(repoPath);
      
      if (!pubGetResult.success) {
        checks.push({
          name: 'Flutter Pub Get',
          passed: false,
          message: pubGetResult.message,
          score: 0,
        });
        return this.buildResponse(5, maxScore, checks, {
          cloneSuccessful: true,
          filesValid: true,
          pubGetSuccessful: false,
          buildSuccessful: false,
          testsPassed: false,
        }, 'Dependencies installation failed. Maximum score: 5/20');
      }

      checks.push({
        name: 'Flutter Pub Get',
        passed: true,
        message: 'Dependencies installed successfully',
        score: 0,
      });

      // Step 4: Check if app compiles (flutter analyze)
      this.logger.log('Checking if app compiles');
      const buildResult = await this.checkBuild(repoPath);
      
      if (!buildResult.success) {
        checks.push({
          name: 'Build Check',
          passed: false,
          message: buildResult.message,
          score: 0,
        });
        return this.buildResponse(5, maxScore, checks, {
          cloneSuccessful: true,
          filesValid: true,
          pubGetSuccessful: true,
          buildSuccessful: false,
          testsPassed: false,
        }, 'App does not compile. Maximum score: 5/20');
      }

      checks.push({
        name: 'Build Check',
        passed: true,
        message: 'App compiles successfully',
        score: 0,
      });

      // Step 5: Run flutter test
      this.logger.log('Running flutter test');
      const testResult = await this.runFlutterTest(repoPath);
      let testScore = 0;
      
      if (testResult.success) {
        testScore = 5;
        totalScore += testScore;
        checks.push({
          name: 'Flutter Test',
          passed: true,
          message: testResult.message || 'Tests passed',
          score: testScore,
        });
      } else {
        checks.push({
          name: 'Flutter Test',
          passed: false,
          message: testResult.message || 'Tests failed or no tests found',
          score: 0,
        });
      }

      // Step 6: Get lib/ files and send to Groq
      this.logger.log('Collecting lib/ files for Groq evaluation');
      const libFiles = await this.collectLibFiles(repoPath);
      
      if (libFiles.length === 0) {
        this.logger.warn('No files found in lib/ directory');
        return this.buildResponse(totalScore, maxScore, checks, {
          cloneSuccessful: true,
          filesValid: true,
          pubGetSuccessful: true,
          buildSuccessful: true,
          testsPassed: testResult.success,
        }, `Evaluation completed. Score: ${totalScore}/20`);
      }

      // Step 7: Send to Groq for evaluation
      this.logger.log('Sending code to Groq for evaluation');
      const remainingScore = maxScore - totalScore;
      const groqResult = await this.evaluateWithGroq(libFiles, remainingScore);
      
      const groqScore = Math.min(groqResult.score, remainingScore);
      totalScore += groqScore;

      checks.push({
        name: 'Groq Code Evaluation',
        passed: true,
        message: 'Code evaluated by Groq',
        score: groqScore,
      });

      return this.buildResponse(
        totalScore,
        maxScore,
        checks,
        {
          cloneSuccessful: true,
          filesValid: true,
          pubGetSuccessful: true,
          buildSuccessful: true,
          testsPassed: testResult.success,
          groqEvaluation: {
            score: groqScore,
            summary: groqResult.summary,
            strengths: groqResult.strengths,
            weaknesses: groqResult.weaknesses,
            recommendations: groqResult.recommendations,
          },
        },
        groqResult.summary,
        groqResult.summary,
      );
    } catch (error) {
      this.logger.error(`Evaluation error: ${error.message}`, error.stack);
      
      // Re-throw known exceptions as-is
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      
      // Wrap unknown errors
      throw new InternalServerErrorException(
        `Evaluation failed: ${error.message || 'Unknown error'}`,
      );
    } finally {
      // Cleanup: Remove cloned repository
      if (repoPath) {
        try {
          await fs.remove(repoPath);
          this.logger.log(`Cleaned up repository: ${repoPath}`);
        } catch (error) {
          this.logger.warn(`Failed to cleanup repository: ${error.message}`);
        }
      }
    }
  }

  private isValidGitHubUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === 'github.com' || urlObj.hostname === 'www.github.com';
    } catch {
      return false;
    }
  }

  private async cloneRepository(repoUrl: string): Promise<string | null> {
    try {
      const repoName = this.extractRepoName(repoUrl);
      const repoPath = path.join(this.tempDir, `${repoName}-${Date.now()}`);

      // Remove directory if it exists
      if (await fs.pathExists(repoPath)) {
        await fs.remove(repoPath);
      }

      const git = simpleGit();
      await git.clone(repoUrl, repoPath, ['--depth', '1']);

      return repoPath;
    } catch (error) {
      this.logger.error(`Clone failed: ${error.message}`);
      return null;
    }
  }

  private extractRepoName(url: string): string {
    try {
      const match = url.match(/github\.com[/:]([^/]+)\/([^/]+)(?:\.git)?$/);
      if (match) {
        return `${match[1]}-${match[2]}`;
      }
      return 'repo';
    } catch {
      return 'repo';
    }
  }

  private async checkRequiredFiles(repoPath: string): Promise<{ valid: boolean; message?: string }> {
    const pubspecPath = path.join(repoPath, 'pubspec.yaml');
    const mainDartPath = path.join(repoPath, 'lib', 'main.dart');

    const pubspecExists = await fs.pathExists(pubspecPath);
    const mainDartExists = await fs.pathExists(mainDartPath);

    if (!pubspecExists && !mainDartExists) {
      return { valid: false, message: 'pubspec.yaml and lib/main.dart are missing' };
    }
    if (!pubspecExists) {
      return { valid: false, message: 'pubspec.yaml is missing' };
    }
    if (!mainDartExists) {
      return { valid: false, message: 'lib/main.dart is missing' };
    }

    return { valid: true };
  }

  private async runFlutterPubGet(repoPath: string): Promise<{ success: boolean; message?: string }> {
    try {
      const { stdout, stderr } = await execAsync('flutter pub get', {
        cwd: repoPath,
        timeout: 60000, // 60 seconds timeout
      });

      if (stderr && !stderr.includes('Warning')) {
        // Some warnings are acceptable
        return { success: false, message: stderr };
      }

      return { success: true, message: 'Dependencies installed successfully' };
    } catch (error: any) {
      this.logger.error(`flutter pub get failed: ${error.message}`);
      return { success: false, message: error.message || 'flutter pub get failed' };
    }
  }

  private async checkBuild(repoPath: string): Promise<{ success: boolean; message?: string }> {
    try {
      // Use flutter analyze to check if the code compiles
      const { stdout, stderr } = await execAsync('flutter analyze', {
        cwd: repoPath,
        timeout: 120000, // 2 minutes timeout
      });

      // Check if there are errors (not just warnings)
      const hasErrors = stderr.includes('error') || stdout.includes('error •');
      
      if (hasErrors && !stderr.includes('info') && !stdout.includes('info •')) {
        return { success: false, message: 'Code contains errors and does not compile' };
      }

      return { success: true, message: 'Code compiles successfully' };
    } catch (error: any) {
      // If analyze fails, try to build
      try {
        await execAsync('flutter build', {
          cwd: repoPath,
          timeout: 180000, // 3 minutes timeout
        });
        return { success: true, message: 'Code compiles successfully' };
      } catch (buildError: any) {
        this.logger.error(`Build check failed: ${buildError.message}`);
        return { success: false, message: buildError.message || 'Build failed' };
      }
    }
  }

  private async runFlutterTest(repoPath: string): Promise<{ success: boolean; message?: string }> {
    try {
      const { stdout, stderr } = await execAsync('flutter test', {
        cwd: repoPath,
        timeout: 120000, // 2 minutes timeout
      });

      // Check if tests passed
      const allTestsPassed = stdout.includes('All tests passed!') || 
                            (stdout.includes('+') && !stdout.includes('Some tests failed'));

      if (allTestsPassed) {
        return { success: true, message: 'All tests passed' };
      }

      return { success: false, message: 'Tests failed or no tests found' };
    } catch (error: any) {
      // If no tests directory exists, that's acceptable
      if (error.message.includes('No tests found') || error.message.includes('No test file')) {
        return { success: false, message: 'No tests found' };
      }
      this.logger.error(`flutter test failed: ${error.message}`);
      return { success: false, message: error.message || 'Tests failed' };
    }
  }

  private async collectLibFiles(repoPath: string): Promise<Array<{ path: string; content: string }>> {
    const libPath = path.join(repoPath, 'lib');
    
    if (!(await fs.pathExists(libPath))) {
      return [];
    }

    const files: Array<{ path: string; content: string }> = [];
    
    try {
      await this.collectFilesRecursively(libPath, libPath, files);
    } catch (error) {
      this.logger.error(`Error collecting lib files: ${error.message}`);
    }

    return files;
  }

  private async collectFilesRecursively(
    dir: string,
    baseDir: string,
    files: Array<{ path: string; content: string }>,
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        await this.collectFilesRecursively(fullPath, baseDir, files);
      } else if (entry.isFile() && entry.name.endsWith('.dart')) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          files.push({ path: relativePath, content });
        } catch (error) {
          this.logger.warn(`Failed to read file ${relativePath}: ${error.message}`);
        }
      }
    }
  }

  private async evaluateWithGroq(
    files: Array<{ path: string; content: string }>,
    maxAvailableScore: number,
  ): Promise<{
    score: number;
    summary: string;
    strengths?: string[];
    weaknesses?: string[];
    recommendations?: string;
  }> {
    const groqApiKey = this.configService.get<string>('GROQ_API_KEY');

    if (!groqApiKey) {
      this.logger.error('GROQ_API_KEY not configured');
      throw new InternalServerErrorException('Groq API key not configured. Please set GROQ_API_KEY environment variable.');
    }

    // Prepare code content
    const codeContent = files
      .map((file) => `// File: ${file.path}\n${file.content}`)
      .join('\n\n');

    const prompt = `Evaluate the following Flutter code for the assignment:

${this.assignmentDescription}

The evaluation should be out of ${maxAvailableScore} points (this represents the code quality portion of the total 20-point assignment).

Here is the code:

${codeContent}

Evaluate based on:
- Code quality and structure
- Implementation of requirements (Add todo, Delete todo, Mark todo as complete)
- Best practices and Flutter conventions
- Error handling
- Code organization

Provide a CONCISE evaluation. Keep responses brief and to the point.

Respond in the following JSON format (keep text fields short - max 200 characters each):
{
  "score": <number between 0 and ${maxAvailableScore}>,
  "summary": "<brief overall summary in 2-3 sentences>",
  "strengths": ["<brief point 1>", "<brief point 2>"],
  "weaknesses": ["<brief point 1>", "<brief point 2>"],
  "recommendations": "<brief recommendation in 1-2 sentences>"
}`;

    try {
      const response = await axios.post(
        this.groqApiUrl,
        {
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          model: 'openai/gpt-oss-120b',
          temperature: 0.3,
          max_completion_tokens: 800,
          top_p: 1,
          stream: false,
        },
        {
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000, // 60 seconds timeout
        },
      );

      const result = response.data.choices?.[0]?.message?.content;
      if (!result) {
        this.logger.error('No response content from Groq API', response.data);
        throw new Error('No response from Groq API');
      }

      // Try to parse JSON from the response
      let parsed;
      try {
        // Sometimes the response might be wrapped in markdown code blocks
        const cleanedResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(cleanedResult);
      } catch (parseError) {
        this.logger.error(`Failed to parse Groq response as JSON: ${result}`);
        // Try to extract score from text if JSON parsing fails
        const scoreMatch = result.match(/"score":\s*(\d+)/i) || result.match(/score[:\s]+(\d+)/i);
        const extractedScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;
        return {
          score: Math.min(Math.max(extractedScore, 0), maxAvailableScore),
          summary: result.substring(0, 200) || 'Evaluation completed',
          strengths: [],
          weaknesses: [],
          recommendations: '',
        };
      }

      const score = Math.min(Math.max(parseInt(parsed.score) || 0, 0), maxAvailableScore);
      const summary = (parsed.summary || parsed.feedback || 'No summary provided').substring(0, 300);
      const strengths = Array.isArray(parsed.strengths) 
        ? parsed.strengths.map((s: string) => String(s).substring(0, 150)).slice(0, 5)
        : [];
      const weaknesses = Array.isArray(parsed.weaknesses)
        ? parsed.weaknesses.map((w: string) => String(w).substring(0, 150)).slice(0, 5)
        : [];
      const recommendations = (parsed.recommendations || '').substring(0, 200);

      return {
        score,
        summary,
        strengths,
        weaknesses,
        recommendations,
      };
    } catch (error: any) {
      this.logger.error(`Groq evaluation failed: ${error.message}`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
      
      // Return default score if Groq fails
      return {
        score: 0,
        summary: `Evaluation failed: ${error.response?.data?.error?.message || error.message}`,
        strengths: [],
        weaknesses: [],
        recommendations: '',
      };
    }
  }

  private buildResponse(
    totalScore: number,
    maxScore: number,
    checks: CheckResult[],
    details: any,
    feedback?: string,
    summary?: string,
  ): EvaluateResponseDto {
    return {
      totalScore,
      maxScore,
      checks,
      feedback,
      summary: summary || feedback,
      details,
    };
  }
}
