import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsUUID,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  Matches,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum KpiAlertType {
  PROMOTION_SUGGESTION = 'PROMOTION_SUGGESTION',
  DEMOTION_SUGGESTION = 'DEMOTION_SUGGESTION',
  SR_CHECK_PENDING = 'SR_CHECK_PENDING',
  MONTH_END_KPI_UPDATE = 'MONTH_END_KPI_UPDATE',
}

export enum KpiAlertStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  MAINTAINED = 'MAINTAINED',
  DISMISSED = 'DISMISSED',
}

export enum KpiAlertDecisionType {
  PROMOTION = 'PROMOTION',
  DEMOTION = 'DEMOTION',
  SR_CHECK = 'SR_CHECK',
  KPI = 'KPI',
}

export enum KpiAlertDecisionAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  MAINTAIN = 'MAINTAIN',
}

export class KpiAlertPopupQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month must be in YYYY-MM format',
  })
  month?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === '1')
  @IsBoolean()
  force_popup?: boolean;
}

export class KpiAlertDecisionDto {
  @IsOptional()
  @IsUUID()
  alert_id?: string;

  @IsOptional()
  @IsUUID()
  evaluation_id?: string;

  @IsOptional()
  @IsUUID()
  employee_id?: string;

  @IsEnum(KpiAlertDecisionType)
  decision_type: KpiAlertDecisionType;

  @IsEnum(KpiAlertDecisionAction)
  action: KpiAlertDecisionAction;

  @IsOptional()
  @IsBoolean()
  update_salary?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  new_salary?: number;

  @IsOptional()
  @IsString()
  review_notes?: string;
}

export class KpiAlertBulkDecisionDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month must be in YYYY-MM format',
  })
  month?: string;

  @IsOptional()
  @IsBoolean()
  update_salaries?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KpiAlertDecisionDto)
  decisions: KpiAlertDecisionDto[];
}

export class KpiAlertDismissDto {
  @IsOptional()
  @IsUUID()
  alert_id?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month must be in YYYY-MM format',
  })
  month?: string;
}
