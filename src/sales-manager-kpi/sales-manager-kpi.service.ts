import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { CurrencyService } from '../currency/currency.service';
import { Currency } from '../currency/currency.types';
import {
  CareerLevel,
  EvaluationApprovalStatus,
  DemotionReviewAction,
  CalculateEvaluationDto,
  ApproveSrCheckDto,
  ReviewDemotionDto,
  QueryEvaluationDto,
  UpdateCareerLevelDto,
} from './dto/sales-manager-kpi.dto';

export interface LevelConfig {
  fixedSalary: number;
  planMin: number;
  planMax: number;
  srCheckMin: number;
  srCheckTarget: number;
  menteeRequirement: number;
  promotionConsecutiveMonths: number;
  demotionConsecutiveMonths: number;
  nextLevel: CareerLevel | null;
  prevLevel: CareerLevel | null;
}

export const CAREER_LEVEL_CONFIG: Record<CareerLevel, LevelConfig> = {
  [CareerLevel.JUNIOR]: {
    fixedSalary: 300,
    planMin: 0,
    planMax: 3000,
    srCheckMin: 150,
    srCheckTarget: 300,
    menteeRequirement: 0,
    promotionConsecutiveMonths: 2,
    demotionConsecutiveMonths: 0,
    nextLevel: CareerLevel.MID,
    prevLevel: null,
  },
  [CareerLevel.MID]: {
    fixedSalary: 500,
    planMin: 5000,
    planMax: 6000,
    srCheckMin: 200,
    srCheckTarget: 400,
    menteeRequirement: 0,
    promotionConsecutiveMonths: 3,
    demotionConsecutiveMonths: 2,
    nextLevel: CareerLevel.SENIOR,
    prevLevel: CareerLevel.JUNIOR,
  },
  [CareerLevel.SENIOR]: {
    fixedSalary: 700,
    planMin: 6001,
    planMax: 8000,
    srCheckMin: 250,
    srCheckTarget: 500,
    menteeRequirement: 1,
    promotionConsecutiveMonths: 4,
    demotionConsecutiveMonths: 2,
    nextLevel: CareerLevel.EXPERT,
    prevLevel: CareerLevel.MID,
  },
  [CareerLevel.EXPERT]: {
    fixedSalary: 1000,
    planMin: 8001,
    planMax: 10000,
    srCheckMin: 300,
    srCheckTarget: 600,
    menteeRequirement: 3,
    promotionConsecutiveMonths: 0,
    demotionConsecutiveMonths: 3,
    nextLevel: null,
    prevLevel: CareerLevel.SENIOR,
  },
};

@Injectable()
export class SalesManagerKpiService {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    @Optional() private readonly currencyService?: CurrencyService,
  ) {}

  /**
   * Section 1: Sales Bonus Matrix Calculation
   * $0 - $1,999 => 0%
   * $2,000 - $3,999 => 10%
   * $4,000 - $5,999 => 15%
   * $6,000 - $7,999 => 20%
   * $8,000 - $9,999 => 22%
   * >= $10,000 => 25%
   */
  getSalesBonusRate(totalSales: number): number {
    if (totalSales < 2000) return 0.0;
    if (totalSales < 4000) return 0.1;
    if (totalSales < 6000) return 0.15;
    if (totalSales < 8000) return 0.2;
    if (totalSales < 10000) return 0.22;
    return 0.25;
  }

  /**
   * Helper to get previous month string (YYYY-MM).
   */
  private getPreviousMonth(monthStr: string): string {
    const [year, month] = monthStr.split('-').map(Number);
    const date = new Date(year, month - 1 - 1, 1);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  /**
   * Compute total monthly sales amount (in USD) and deal count for an employee.
   */
  private async calculateEmployeeMonthlySales(
    employeeId: string,
    monthStr: string,
  ): Promise<{ totalSales: number; dealCount: number }> {
    let totalSalesUsd = 0;
    let totalDeals = 0;

    const rates = this.currencyService
      ? await this.currencyService.getLatestRates()
      : undefined;

    // 1. Cargo Transactions
    const [year, month] = monthStr.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const startDate = `${monthStr}-01`;
    const endDate = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

    const txRows = await this.knex('cargo_transactions')
      .where('employee_id', employeeId)
      .where('transaction_date', '>=', startDate)
      .where('transaction_date', '<=', endDate)
      .select('sell_price', 'currency');

    for (const tx of txRows) {
      const rawAmt = Number(tx.sell_price || 0);
      const txCurr = (tx.currency as Currency) || Currency.USD;
      let amtUsd = rawAmt;
      if (txCurr !== Currency.USD && this.currencyService) {
        const amtUzs = await this.currencyService.convertToUzs(
          rawAmt,
          txCurr,
          rates,
        );
        const conv = await this.currencyService.convert(
          amtUzs,
          Currency.UZS,
          Currency.USD,
        );
        amtUsd = conv.converted_amount;
      }
      totalSalesUsd += amtUsd;
      totalDeals += 1;
    }

    // 2. ROP Worker Sales
    const ropRows = await this.knex('rop_worker_sales')
      .where('employee_id', employeeId)
      .where('month', monthStr)
      .select('sales_amount');

    for (const rop of ropRows) {
      totalSalesUsd += Number(rop.sales_amount || 0);
      totalDeals += 1;
    }

    // 3. FTL Fura Items
    const ftlRows = await this.knex('ftl_fura_items')
      .where('manager_id', employeeId)
      .where('month', monthStr)
      .select('sell_price');

    for (const ftl of ftlRows) {
      totalSalesUsd += Number(ftl.sell_price || 0);
      totalDeals += 1;
    }

    return {
      totalSales: Math.round(totalSalesUsd * 100) / 100,
      dealCount: totalDeals,
    };
  }

  /**
   * Update employee's career level and mentee count.
   */
  async updateEmployeeCareerLevel(
    employeeId: string,
    dto: UpdateCareerLevelDto,
  ) {
    const employee = await this.knex('employees')
      .where({ id: employeeId })
      .first();
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const payload: Record<string, any> = {
      career_level: dto.career_level,
    };
    if (dto.mentees_count !== undefined) {
      payload.mentees_count = dto.mentees_count;
    }

    await this.knex('employees').where({ id: employeeId }).update(payload);

    return this.knex('employees').where({ id: employeeId }).first();
  }

  /**
   * Calculate and record monthly evaluation for an employee or all sales managers.
   */
  async calculateEvaluation(dto: CalculateEvaluationDto) {
    const { month, employee_id, additional_bonus_amount = 0 } = dto;

    let employeesQuery = this.knex('employees').where('is_active', true);
    if (employee_id) {
      employeesQuery = employeesQuery.where('id', employee_id);
    }

    const employees = await employeesQuery;
    if (employee_id && employees.length === 0) {
      throw new NotFoundException('Employee not found or inactive');
    }

    const prevMonth = this.getPreviousMonth(month);
    const results = [];

    for (const emp of employees) {
      const currentLevel =
        (emp.career_level as CareerLevel) || CareerLevel.JUNIOR;
      const levelConfig =
        CAREER_LEVEL_CONFIG[currentLevel] ||
        CAREER_LEVEL_CONFIG[CareerLevel.JUNIOR];

      const { totalSales, dealCount } =
        await this.calculateEmployeeMonthlySales(emp.id, month);

      const averageCheck = dealCount > 0 ? totalSales / dealCount : 0;
      const roundedAverageCheck = Math.round(averageCheck * 100) / 100;

      const isPlanAchieved = totalSales >= levelConfig.planMin;
      const isSrCheckAchieved = roundedAverageCheck >= levelConfig.srCheckMin;

      // Look up previous month evaluation to calculate consecutive stats
      const prevEval = await this.knex('sales_manager_evaluations')
        .where({ employee_id: emp.id, month: prevMonth })
        .first();

      let consecutiveSuccesses = 0;
      let consecutiveFailures = 0;

      if (isPlanAchieved) {
        consecutiveSuccesses = (prevEval?.consecutive_successes || 0) + 1;
        consecutiveFailures = 0;
      } else {
        consecutiveSuccesses = 0;
        consecutiveFailures = (prevEval?.consecutive_failures || 0) + 1;
      }

      let approvalStatus = EvaluationApprovalStatus.APPROVED;
      let newLevel = currentLevel;

      // Check promotion requirement
      const hasEnoughMentees =
        (emp.mentees_count || 0) >= levelConfig.menteeRequirement;
      if (
        isPlanAchieved &&
        isSrCheckAchieved &&
        hasEnoughMentees &&
        levelConfig.promotionConsecutiveMonths > 0 &&
        consecutiveSuccesses >= levelConfig.promotionConsecutiveMonths &&
        levelConfig.nextLevel
      ) {
        // Promoted automatically!
        newLevel = levelConfig.nextLevel;
        await this.knex('employees')
          .where({ id: emp.id })
          .update({ career_level: newLevel });
        consecutiveSuccesses = 0; // Reset after promotion
      }

      // Check demotion escalation requirement
      if (
        !isPlanAchieved &&
        levelConfig.demotionConsecutiveMonths > 0 &&
        consecutiveFailures >= levelConfig.demotionConsecutiveMonths
      ) {
        approvalStatus = EvaluationApprovalStatus.DEMOTION_PENDING_REVIEW;
      } else if (isPlanAchieved && !isSrCheckAchieved) {
        // Average check rule: sales plan met but average check is low -> requires ROP/CEO approval
        approvalStatus = EvaluationApprovalStatus.PENDING_SR_CHECK_APPROVAL;
      }

      // Calculate Earnings
      const bonusRate = this.getSalesBonusRate(totalSales);
      const salesBonusAmount = Math.round(totalSales * bonusRate * 100) / 100;
      const kpiBonusAmount = isPlanAchieved
        ? Math.round(totalSales * 0.05 * 100) / 100
        : 0;
      const totalEarnings =
        Math.round(
          (levelConfig.fixedSalary +
            salesBonusAmount +
            kpiBonusAmount +
            additional_bonus_amount) *
            100,
        ) / 100;

      const evalData = {
        employee_id: emp.id,
        month,
        career_level: newLevel,
        fixed_salary: levelConfig.fixedSalary,
        total_sales: totalSales,
        deal_count: dealCount,
        average_check: roundedAverageCheck,
        plan_target_min: levelConfig.planMin,
        plan_target_max: levelConfig.planMax,
        sr_check_min: levelConfig.srCheckMin,
        sr_check_target: levelConfig.srCheckTarget,
        is_plan_achieved: isPlanAchieved,
        is_sr_check_achieved: isSrCheckAchieved,
        sales_bonus_rate: Math.round(bonusRate * 100 * 100) / 100, // percentage e.g. 15.00
        sales_bonus_amount: salesBonusAmount,
        kpi_bonus_amount: kpiBonusAmount,
        additional_bonus_amount: additional_bonus_amount,
        total_earnings: totalEarnings,
        consecutive_successes: consecutiveSuccesses,
        consecutive_failures: consecutiveFailures,
        approval_status: approvalStatus,
        updated_at: this.knex.fn.now(),
      };

      // Upsert evaluation record
      const existing = await this.knex('sales_manager_evaluations')
        .where({ employee_id: emp.id, month })
        .first();

      if (existing) {
        await this.knex('sales_manager_evaluations')
          .where({ id: existing.id })
          .update(evalData);
      } else {
        await this.knex('sales_manager_evaluations').insert(evalData);
      }

      const rec = await this.knex('sales_manager_evaluations')
        .where({ employee_id: emp.id, month })
        .first();
      results.push(rec);
    }

    return {
      month,
      evaluations_calculated: results.length,
      evaluations: results,
    };
  }

  /**
   * ROP/CEO approves average check exception.
   */
  async approveSrCheck(
    id: string,
    reviewerUserId: string,
    dto: ApproveSrCheckDto,
  ) {
    const evalRecord = await this.knex('sales_manager_evaluations')
      .where({ id })
      .first();
    if (!evalRecord) {
      throw new NotFoundException('Evaluation record not found');
    }

    if (
      evalRecord.approval_status !==
      EvaluationApprovalStatus.PENDING_SR_CHECK_APPROVAL
    ) {
      throw new BadRequestException(
        `Evaluation status is '${evalRecord.approval_status}', not pending SR check approval`,
      );
    }

    await this.knex('sales_manager_evaluations')
      .where({ id })
      .update({
        approval_status: EvaluationApprovalStatus.APPROVED,
        reviewed_by: reviewerUserId,
        review_notes: dto.review_notes || 'SR Check approved by ROP/CEO',
        updated_at: this.knex.fn.now(),
      });

    return this.getEvaluationById(id);
  }

  /**
   * ROP/CEO reviews demotion escalation.
   */
  async reviewDemotion(
    id: string,
    reviewerUserId: string,
    dto: ReviewDemotionDto,
  ) {
    const evalRecord = await this.knex('sales_manager_evaluations')
      .where({ id })
      .first();
    if (!evalRecord) {
      throw new NotFoundException('Evaluation record not found');
    }

    if (
      evalRecord.approval_status !==
      EvaluationApprovalStatus.DEMOTION_PENDING_REVIEW
    ) {
      throw new BadRequestException(
        `Evaluation status is '${evalRecord.approval_status}', not pending demotion review`,
      );
    }

    const currentLevel = evalRecord.career_level as CareerLevel;
    const levelConfig =
      CAREER_LEVEL_CONFIG[currentLevel] ||
      CAREER_LEVEL_CONFIG[CareerLevel.JUNIOR];

    if (dto.action === DemotionReviewAction.APPROVE_DEMOTION) {
      const prevLevel = levelConfig.prevLevel || CareerLevel.JUNIOR;

      // Update employee level to lower rank
      await this.knex('employees')
        .where({ id: evalRecord.employee_id })
        .update({ career_level: prevLevel });

      // Update evaluation record
      await this.knex('sales_manager_evaluations')
        .where({ id })
        .update({
          approval_status: EvaluationApprovalStatus.DEMOTION_APPROVED,
          consecutive_failures: 0, // reset counter after demotion
          reviewed_by: reviewerUserId,
          review_notes:
            dto.review_notes || `Demotion to ${prevLevel} approved by ROP/CEO`,
          updated_at: this.knex.fn.now(),
        });
    } else {
      // Maintain level
      await this.knex('sales_manager_evaluations')
        .where({ id })
        .update({
          approval_status: EvaluationApprovalStatus.DEMOTION_REJECTED,
          reviewed_by: reviewerUserId,
          review_notes:
            dto.review_notes ||
            'Demotion rejected by ROP/CEO. Career level maintained.',
          updated_at: this.knex.fn.now(),
        });
    }

    return this.getEvaluationById(id);
  }

  /**
   * Find single evaluation by ID.
   */
  async getEvaluationById(id: string) {
    const record = await this.knex('sales_manager_evaluations')
      .join(
        'employees',
        'sales_manager_evaluations.employee_id',
        'employees.id',
      )
      .leftJoin('users', 'sales_manager_evaluations.reviewed_by', 'users.id')
      .leftJoin(
        'employees as reviewer_emp',
        'users.employee_id',
        'reviewer_emp.id',
      )
      .select(
        'sales_manager_evaluations.*',
        'employees.first_name as employee_first_name',
        'employees.last_name as employee_last_name',
        'employees.phone as employee_phone',
        'employees.mentees_count',
        this.knex.raw(
          "COALESCE(NULLIF(TRIM(CONCAT(reviewer_emp.first_name, ' ', reviewer_emp.last_name)), ''), users.username) as reviewer_name",
        ),
      )
      .where('sales_manager_evaluations.id', id)
      .first();

    if (!record) {
      throw new NotFoundException('Evaluation record not found');
    }

    return {
      ...record,
      employee_name: `${record.employee_first_name} ${record.employee_last_name}`,
    };
  }

  /**
   * List evaluations with query filters.
   */
  async findAllEvaluations(query: QueryEvaluationDto) {
    const page = query.page ? Math.max(1, parseInt(query.page, 10)) : 1;
    const limit = query.limit
      ? Math.min(100, Math.max(1, parseInt(query.limit, 10)))
      : 20;
    const offset = (page - 1) * limit;

    const baseQuery = this.knex('sales_manager_evaluations')
      .join(
        'employees',
        'sales_manager_evaluations.employee_id',
        'employees.id',
      )
      .leftJoin('users', 'sales_manager_evaluations.reviewed_by', 'users.id')
      .leftJoin(
        'employees as reviewer_emp',
        'users.employee_id',
        'reviewer_emp.id',
      )
      .select(
        'sales_manager_evaluations.*',
        'employees.first_name as employee_first_name',
        'employees.last_name as employee_last_name',
        'employees.mentees_count',
        this.knex.raw(
          "COALESCE(NULLIF(TRIM(CONCAT(reviewer_emp.first_name, ' ', reviewer_emp.last_name)), ''), users.username) as reviewer_name",
        ),
      );

    if (query.month) {
      baseQuery.where('sales_manager_evaluations.month', query.month);
    }
    if (query.employee_id) {
      baseQuery.where(
        'sales_manager_evaluations.employee_id',
        query.employee_id,
      );
    }
    if (query.approval_status) {
      baseQuery.where(
        'sales_manager_evaluations.approval_status',
        query.approval_status,
      );
    }

    const countQuery = this.knex('sales_manager_evaluations');
    if (query.month) countQuery.where('month', query.month);
    if (query.employee_id) countQuery.where('employee_id', query.employee_id);
    if (query.approval_status)
      countQuery.where('approval_status', query.approval_status);

    const [{ total }] = await countQuery.count('id as total');
    const totalCount = parseInt(total as string, 10);
    const totalPages = Math.ceil(totalCount / limit);

    const rows = await baseQuery
      .orderBy('sales_manager_evaluations.month', 'desc')
      .orderBy('sales_manager_evaluations.total_sales', 'desc')
      .limit(limit)
      .offset(offset);

    const data = rows.map((r) => ({
      ...r,
      employee_name: `${r.employee_first_name} ${r.employee_last_name}`,
    }));

    return {
      meta: {
        total: totalCount,
        page,
        limit,
        totalPages,
      },
      data,
    };
  }
}
