import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  IsArray,
  Min,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CareerLevel {
  JUNIOR = 'JUNIOR',
  MID = 'MID',
  SENIOR = 'SENIOR',
  EXPERT = 'EXPERT',
}

export enum EvaluationApprovalStatus {
  APPROVED = 'APPROVED',
  PENDING_SR_CHECK_APPROVAL = 'PENDING_SR_CHECK_APPROVAL',
  DEMOTION_PENDING_REVIEW = 'DEMOTION_PENDING_REVIEW',
  DEMOTION_APPROVED = 'DEMOTION_APPROVED',
  DEMOTION_REJECTED = 'DEMOTION_REJECTED',
}

export enum DemotionReviewAction {
  APPROVE_DEMOTION = 'APPROVE_DEMOTION',
  MAINTAIN_LEVEL = 'MAINTAIN_LEVEL',
}

export class UpdateCareerLevelDto {
  @IsEnum(CareerLevel)
  career_level: CareerLevel;

  @IsOptional()
  @IsNumber()
  @Min(0)
  mentees_count?: number;
}

export class CalculateEvaluationDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month must be in YYYY-MM format',
  })
  month: string;

  @IsOptional()
  @IsUUID()
  employee_id?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  additional_bonus_amount?: number;
}

export class ApproveSrCheckDto {
  @IsOptional()
  @IsString()
  review_notes?: string;
}

export class ReviewDemotionDto {
  @IsEnum(DemotionReviewAction)
  action: DemotionReviewAction;

  @IsOptional()
  @IsString()
  review_notes?: string;
}

export class QueryEvaluationDto {
  @IsOptional()
  @IsString()
  month?: string;

  @IsOptional()
  @IsUUID()
  employee_id?: string;

  @IsOptional()
  @IsString()
  approval_status?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
