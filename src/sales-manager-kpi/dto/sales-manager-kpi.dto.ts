import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  Matches,
  IsBoolean,
  IsArray,
  IsIn,
} from 'class-validator';

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

export enum CargoPaymentStatus {
  WAITING = 'waiting',
  UNPAID = 'unpaid',
  PAID = 'paid',
}

export const ALLOWED_PAYMENT_STATUS_INPUTS = [
  'waiting',
  'unpaid',
  'paid',
  'kutilmoqda',
  'klient_bermadi',
  'klient bermadi',
  'tolandi',
  "to'landi",
  'klient berdi',
  'olindi',
  'Kutilmoqda',
  'Klient bermadi',
  "To'landi",
] as const;

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

export class QueryCargosMonitoringDto {
  @IsOptional()
  @IsUUID()
  employee_id?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month must be in YYYY-MM format',
  })
  month?: string;

  @IsOptional()
  @IsString()
  payment_status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class UpdateCargoPaymentStatusDto {
  @IsString()
  @IsIn(ALLOWED_PAYMENT_STATUS_INPUTS, {
    message: `payment_status must be one of: waiting, unpaid, paid (or Kutilmoqda, Klient bermadi, To'landi)`,
  })
  payment_status: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  payment_deadline_days?: number;
}

export class ConfirmCargoKpiDto {
  @IsOptional()
  @IsBoolean()
  is_kpi_received?: boolean;

  @IsOptional()
  @IsString()
  review_notes?: string;
}

export class BulkConfirmKpiDto {
  @IsUUID()
  employee_id: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month must be in YYYY-MM format',
  })
  month: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  cargo_ids?: string[];

  @IsOptional()
  @IsBoolean()
  is_kpi_received?: boolean;
}

export class BulkUpdatePaymentStatusDto {
  @IsArray()
  @IsUUID('4', { each: true })
  cargo_ids: string[];

  @IsString()
  @IsIn(ALLOWED_PAYMENT_STATUS_INPUTS, {
    message: `payment_status must be one of: waiting, unpaid, paid (or Kutilmoqda, Klient bermadi, To'landi)`,
  })
  payment_status: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  payment_deadline_days?: number;
}
