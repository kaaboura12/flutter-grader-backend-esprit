import { IsString, IsUrl, IsNotEmpty } from 'class-validator';

export class EvaluateRequestDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl({}, { message: 'repoUrl must be a valid URL' })
  repoUrl: string;
}

