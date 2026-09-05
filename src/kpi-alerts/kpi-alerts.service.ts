import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import {
  SalesManagerKpiService,
  CAREER_LEVEL_CONFIG,
} from '../sales-manager-kpi/sales-manager-kpi.service';
import {
  CareerLevel,
  EvaluationApprovalStatus,
  DemotionReviewAction,
  PromotionReviewAction,
} from '../sales-manager-kpi/dto/sales-manager-kpi.dto';
import {
  KpiAlertPopupQueryDto,
  KpiAlertDecisionDto,
  KpiAlertBulkDecisionDto,
  KpiAlertType,
  KpiAlertStatus,
  KpiAlertDecisionType,
  KpiAlertDecisionAction,
} from './dto/kpi-alerts.dto';

export interface MonthPeriodInfo {
  isLastWeek: boolean;
  currentDay: number;
  totalDays: number;
  daysRemaining: number;
  startDate: string;
  endDate: string;
  lastWeekStartDate: string;
}

@Injectable()
export class KpiAlertsService {
  private readonly logger = new Logger(KpiAlertsService.name);

  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly salesManagerKpiService: SalesManagerKpiService,
  ) {}

  /**
   * Evaluates whether a date is in the last week of the month (calendar days 22-31 or last 7 calendar days).
   */
  getMonthPeriodInfo(targetDate: Date = new Date()): MonthPeriodInfo {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth(); // 0-indexed
    const currentDay = targetDate.getDate();

    const totalDays = new Date(year, month + 1, 0).getDate();
    const monthStr = String(month + 1).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-${String(totalDays).padStart(2, '0')}`;

    const lastWeekStartDay = Math.max(1, totalDays - 6);
    const lastWeekStartDate = `${year}-${monthStr}-${String(lastWeekStartDay).padStart(2, '0')}`;

    const isLastWeek = currentDay >= lastWeekStartDay || currentDay >= 22;
    const daysRemaining = Math.max(0, totalDays - currentDay);

    return {
      isLastWeek,
      currentDay,
      totalDays,
      daysRemaining,
      startDate,
      endDate,
      lastWeekStartDate,
    };
  }

  /**
   * Main pop-up endpoint payload:
   * Recalculates real-time monthly KPIs, populates kpi_alerts, and returns summary + suggestions + employee cards.
   */
  async getPopupAlerts(query: KpiAlertPopupQueryDto) {
    const currentYearMonth = new Date().toISOString().slice(0, 7);
    const targetMonth = query.month || currentYearMonth;
    const isCurrentMonth = targetMonth === currentYearMonth;

    const periodInfo = this.getMonthPeriodInfo(
      isCurrentMonth ? new Date() : new Date(`${targetMonth}-15`),
    );

    // If month is past, consider last week passed and active for review; if current, use calendar rule
    const isLastWeek = !isCurrentMonth ? true : periodInfo.isLastWeek;
    const shouldPopup = query.force_popup === true || isLastWeek;

    // 1. Recalculate real-time KPI evaluations for all active sales managers for this month
    const evalResult = await this.salesManagerKpiService.calculateEvaluation({
      month: targetMonth,
    });

    const evaluations = evalResult.evaluations || [];

    // 2. Fetch employee details
    const employeeIds = evaluations.map((e) => e.employee_id);
    const employees = await this.knex('employees')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .whereIn('employees.id', employeeIds)
      .select(
        'employees.id',
        'employees.first_name',
        'employees.last_name',
        'employees.phone',
        'employees.career_level',
        'employees.fixed_salary',
        'employees.mentees_count',
        'departments.name as department_name',
      );

    const empMap = new Map(employees.map((e) => [e.id, e]));

    // 3. Ensure alerts are synchronized into kpi_alerts table
    for (const ev of evaluations) {
      const emp = empMap.get(ev.employee_id);
      if (!emp) continue;

      const currentLevel =
        (emp.career_level as CareerLevel) || CareerLevel.JUNIOR;
      const levelConfig =
        CAREER_LEVEL_CONFIG[currentLevel] ||
        CAREER_LEVEL_CONFIG[CareerLevel.JUNIOR];

      let alertType: KpiAlertType | null = null;
      let suggestedLevel: CareerLevel | null = null;
      let suggestedSalary: number | null = null;
      let title = '';
      let message = '';

      if (
        ev.approval_status === EvaluationApprovalStatus.PROMOTION_PENDING_REVIEW
      ) {
        alertType = KpiAlertType.PROMOTION_SUGGESTION;
        suggestedLevel = levelConfig.nextLevel;
        if (suggestedLevel) {
          suggestedSalary = CAREER_LEVEL_CONFIG[suggestedLevel].fixedSalary;
          title = `Promotion Suggestion: ${emp.first_name} ${emp.last_name} (${currentLevel} → ${suggestedLevel})`;
          message = `Achieved plan ($${Number(ev.total_sales).toLocaleString()} / $${Number(ev.plan_target_min).toLocaleString()}) for ${ev.consecutive_successes} consecutive months with average check $${ev.average_check}. Eligible for promotion to ${suggestedLevel} with salary adjusted to $${suggestedSalary}.`;
        }
      } else if (
        ev.approval_status === EvaluationApprovalStatus.DEMOTION_PENDING_REVIEW
      ) {
        alertType = KpiAlertType.DEMOTION_SUGGESTION;
        suggestedLevel = levelConfig.prevLevel || CareerLevel.JUNIOR;
        suggestedSalary = CAREER_LEVEL_CONFIG[suggestedLevel]?.fixedSalary || 0;
        title = `Demotion Escalation: ${emp.first_name} ${emp.last_name} (${currentLevel} → ${suggestedLevel})`;
        message = `Failed to achieve sales plan for ${ev.consecutive_failures} consecutive months. Demotion suggested to ${suggestedLevel} with salary adjusted to $${suggestedSalary}.`;
      } else if (
        ev.approval_status ===
        EvaluationApprovalStatus.PENDING_SR_CHECK_APPROVAL
      ) {
        alertType = KpiAlertType.SR_CHECK_PENDING;
        title = `Average Check Approval: ${emp.first_name} ${emp.last_name}`;
        message = `Sales plan met ($${Number(ev.total_sales).toLocaleString()}), but average check ($${ev.average_check}) is below standard ($${ev.sr_check_min}). Requires executive approval.`;
      } else {
        alertType = KpiAlertType.MONTH_END_KPI_UPDATE;
        title = `Month-End KPI Snapshot: ${emp.first_name} ${emp.last_name}`;
        message = `Total Sales: $${Number(ev.total_sales).toLocaleString()}, Bonus: $${Number(ev.sales_bonus_amount).toLocaleString()}, Total Earnings: $${Number(ev.total_earnings).toLocaleString()}.`;
      }

      if (alertType) {
        const existingAlert = await this.knex('kpi_alerts')
          .where({
            employee_id: emp.id,
            month: targetMonth,
            alert_type: alertType,
          })
          .first();

        const metricsPayload = {
          total_sales: Number(ev.total_sales),
          deal_count: Number(ev.deal_count),
          average_check: Number(ev.average_check),
          plan_target_min: Number(ev.plan_target_min),
          plan_target_max: Number(ev.plan_target_max),
          is_plan_achieved: Boolean(ev.is_plan_achieved),
          is_sr_check_achieved: Boolean(ev.is_sr_check_achieved),
          sales_bonus_amount: Number(ev.sales_bonus_amount),
          total_earnings: Number(ev.total_earnings),
          consecutive_successes: Number(ev.consecutive_successes),
          consecutive_failures: Number(ev.consecutive_failures),
        };

        if (existingAlert) {
          // If already decided, preserve status
          const isDecided = [
            KpiAlertStatus.APPROVED,
            KpiAlertStatus.REJECTED,
            KpiAlertStatus.MAINTAINED,
          ].includes(existingAlert.status);

          await this.knex('kpi_alerts')
            .where({ id: existingAlert.id })
            .update({
              evaluation_id: ev.id,
              current_level: currentLevel,
              suggested_level: suggestedLevel,
              current_salary: Number(emp.fixed_salary || 0),
              suggested_salary: suggestedSalary,
              metrics: JSON.stringify(metricsPayload),
              title,
              message,
              status: isDecided ? existingAlert.status : KpiAlertStatus.PENDING,
              updated_at: this.knex.fn.now(),
            });
        } else {
          await this.knex('kpi_alerts').insert({
            month: targetMonth,
            employee_id: emp.id,
            evaluation_id: ev.id,
            alert_type: alertType,
            status: KpiAlertStatus.PENDING,
            title,
            message,
            current_level: currentLevel,
            suggested_level: suggestedLevel,
            current_salary: Number(emp.fixed_salary || 0),
            suggested_salary: suggestedSalary,
            metrics: JSON.stringify(metricsPayload),
          });
        }
      }
    }

    // 4. Fetch all active alerts for this month
    const alertRows = await this.knex('kpi_alerts')
      .where({ month: targetMonth })
      .orderBy('created_at', 'desc');

    const alertMap = new Map(alertRows.map((a) => [a.evaluation_id, a]));

    // 5. Structure suggestions (pending decisions that require CEO action)
    const suggestions = [];
    let promotionsCount = 0;
    let demotionsCount = 0;
    let srCheckCount = 0;

    for (const ev of evaluations) {
      const emp = empMap.get(ev.employee_id);
      if (!emp) continue;

      const alert = alertMap.get(ev.id);
      const isPending =
        ev.approval_status ===
          EvaluationApprovalStatus.PROMOTION_PENDING_REVIEW ||
        ev.approval_status ===
          EvaluationApprovalStatus.DEMOTION_PENDING_REVIEW ||
        ev.approval_status ===
          EvaluationApprovalStatus.PENDING_SR_CHECK_APPROVAL;

      if (
        ev.approval_status === EvaluationApprovalStatus.PROMOTION_PENDING_REVIEW
      ) {
        promotionsCount++;
      } else if (
        ev.approval_status === EvaluationApprovalStatus.DEMOTION_PENDING_REVIEW
      ) {
        demotionsCount++;
      } else if (
        ev.approval_status ===
        EvaluationApprovalStatus.PENDING_SR_CHECK_APPROVAL
      ) {
        srCheckCount++;
      }

      if (isPending) {
        const currentLevel =
          (emp.career_level as CareerLevel) || CareerLevel.JUNIOR;
        const levelConfig =
          CAREER_LEVEL_CONFIG[currentLevel] ||
          CAREER_LEVEL_CONFIG[CareerLevel.JUNIOR];

        const isPromo =
          ev.approval_status ===
          EvaluationApprovalStatus.PROMOTION_PENDING_REVIEW;
        const isDemo =
          ev.approval_status ===
          EvaluationApprovalStatus.DEMOTION_PENDING_REVIEW;

        const targetLevel = isPromo
          ? levelConfig.nextLevel
          : isDemo
            ? levelConfig.prevLevel || CareerLevel.JUNIOR
            : currentLevel;

        const suggestedSal = targetLevel
          ? CAREER_LEVEL_CONFIG[targetLevel]?.fixedSalary || 0
          : Number(emp.fixed_salary || 0);

        suggestions.push({
          alert_id: alert?.id || null,
          evaluation_id: ev.id,
          employee_id: emp.id,
          employee_name: `${emp.first_name} ${emp.last_name}`.trim(),
          department_name: emp.department_name || 'Sales Department',
          phone: emp.phone,
          decision_type: isPromo
            ? KpiAlertDecisionType.PROMOTION
            : isDemo
              ? KpiAlertDecisionType.DEMOTION
              : KpiAlertDecisionType.SR_CHECK,
          current_level: currentLevel,
          suggested_level: targetLevel,
          current_salary: Number(emp.fixed_salary || 0),
          suggested_salary: suggestedSal,
          approval_status: ev.approval_status,
          consecutive_successes: Number(ev.consecutive_successes || 0),
          consecutive_failures: Number(ev.consecutive_failures || 0),
          mentees_count: Number(emp.mentees_count || 0),
          mentees_required: levelConfig.menteeRequirement,
          metrics: {
            total_sales: Number(ev.total_sales),
            deal_count: Number(ev.deal_count),
            average_check: Number(ev.average_check),
            plan_target_min: Number(ev.plan_target_min),
            plan_target_max: Number(ev.plan_target_max),
            sales_bonus_amount: Number(ev.sales_bonus_amount),
            total_earnings: Number(ev.total_earnings),
            is_plan_achieved: Boolean(ev.is_plan_achieved),
            is_sr_check_achieved: Boolean(ev.is_sr_check_achieved),
          },
        });
      }
    }

    // 6. Structure all employee KPI cards
    const totalKpiBonus = evaluations.reduce(
      (sum, e) => sum + Number(e.sales_bonus_amount || 0),
      0,
    );

    const employeesKpi = evaluations.map((ev) => {
      const emp = empMap.get(ev.employee_id);
      const alert = alertMap.get(ev.id);
      const planMin = Number(ev.plan_target_min || 0);
      const sales = Number(ev.total_sales || 0);
      const planProgressPct =
        planMin > 0 ? Math.round((sales / planMin) * 10000) / 100 : 100;

      return {
        evaluation_id: ev.id,
        alert_id: alert?.id || null,
        employee_id: ev.employee_id,
        employee_name: emp
          ? `${emp.first_name} ${emp.last_name}`.trim()
          : 'Unknown',
        department_name: emp?.department_name || 'Sales Department',
        career_level: ev.career_level,
        fixed_salary: Number(ev.fixed_salary),
        total_sales: sales,
        deal_count: Number(ev.deal_count),
        average_check: Number(ev.average_check),
        plan_target_min: planMin,
        plan_target_max: Number(ev.plan_target_max),
        plan_progress_percentage: planProgressPct,
        is_plan_achieved: Boolean(ev.is_plan_achieved),
        is_sr_check_achieved: Boolean(ev.is_sr_check_achieved),
        sales_bonus_amount: Number(ev.sales_bonus_amount),
        paid_sales_bonus_amount: Number(ev.paid_sales_bonus_amount || 0),
        unpaid_sales_bonus_amount: Number(ev.unpaid_sales_bonus_amount || 0),
        additional_bonus_amount: Number(ev.additional_bonus_amount || 0),
        total_earnings: Number(ev.total_earnings),
        consecutive_successes: Number(ev.consecutive_successes),
        consecutive_failures: Number(ev.consecutive_failures),
        approval_status: ev.approval_status,
        reviewed_by: ev.reviewed_by,
        review_notes: ev.review_notes,
      };
    });

    return {
      month: targetMonth,
      is_last_week: isLastWeek,
      should_popup: shouldPopup,
      period: {
        start_date: periodInfo.startDate,
        end_date: periodInfo.endDate,
        last_week_start: periodInfo.lastWeekStartDate,
        current_day: periodInfo.currentDay,
        total_days: periodInfo.totalDays,
        days_remaining: periodInfo.daysRemaining,
      },
      summary: {
        total_employees: evaluations.length,
        total_kpi_bonus: Math.round(totalKpiBonus * 100) / 100,
        pending_decisions_count: suggestions.length,
        promotions_count: promotionsCount,
        demotions_count: demotionsCount,
        sr_check_approvals_count: srCheckCount,
      },
      suggestions,
      employees_kpi: employeesKpi,
    };
  }

  /**
   * Directly executes an executive CEO decision for promotion, demotion, or sr check.
   */
  async decideAlert(dto: KpiAlertDecisionDto, reviewerUserId: string) {
    let evaluationId = dto.evaluation_id;

    // Resolve evaluation_id from alert_id if omitted
    if (!evaluationId && dto.alert_id) {
      const alert = await this.knex('kpi_alerts')
        .where({ id: dto.alert_id })
        .first();
      if (!alert || !alert.evaluation_id) {
        throw new NotFoundException('Alert or linked evaluation not found');
      }
      evaluationId = alert.evaluation_id;
    }

    if (!evaluationId) {
      throw new BadRequestException(
        'Either evaluation_id or alert_id must be provided',
      );
    }

    let updatedEvaluation: any = null;

    if (dto.decision_type === KpiAlertDecisionType.PROMOTION) {
      const action =
        dto.action === KpiAlertDecisionAction.APPROVE
          ? PromotionReviewAction.APPROVE_PROMOTION
          : PromotionReviewAction.REJECT_PROMOTION;

      updatedEvaluation = await this.salesManagerKpiService.reviewPromotion(
        evaluationId,
        reviewerUserId,
        {
          action,
          update_salary: dto.update_salary,
          new_salary: dto.new_salary,
          review_notes: dto.review_notes,
        },
      );
    } else if (dto.decision_type === KpiAlertDecisionType.DEMOTION) {
      const action =
        dto.action === KpiAlertDecisionAction.APPROVE
          ? DemotionReviewAction.APPROVE_DEMOTION
          : DemotionReviewAction.MAINTAIN_LEVEL;

      updatedEvaluation = await this.salesManagerKpiService.reviewDemotion(
        evaluationId,
        reviewerUserId,
        {
          action,
          update_salary: dto.update_salary,
          new_salary: dto.new_salary,
          review_notes: dto.review_notes,
        },
      );
    } else if (dto.decision_type === KpiAlertDecisionType.SR_CHECK) {
      updatedEvaluation = await this.salesManagerKpiService.approveSrCheck(
        evaluationId,
        reviewerUserId,
        {
          review_notes: dto.review_notes,
        },
      );

      // Update linked alert
      await this.knex('kpi_alerts')
        .where({ evaluation_id: evaluationId })
        .update({
          status: KpiAlertStatus.APPROVED,
          reviewed_by: reviewerUserId,
          review_notes: dto.review_notes || 'Average check approved',
          reviewed_at: this.knex.fn.now(),
          updated_at: this.knex.fn.now(),
        });
    } else if (dto.decision_type === KpiAlertDecisionType.KPI) {
      await this.knex('sales_manager_evaluations')
        .where({ id: evaluationId })
        .update({
          approval_status: EvaluationApprovalStatus.APPROVED,
          reviewed_by: reviewerUserId,
          review_notes: dto.review_notes || 'Monthly KPI calculation approved',
          updated_at: this.knex.fn.now(),
        });

      await this.knex('kpi_alerts')
        .where({ evaluation_id: evaluationId })
        .update({
          status: KpiAlertStatus.APPROVED,
          reviewed_by: reviewerUserId,
          review_notes: dto.review_notes || 'KPI approved',
          reviewed_at: this.knex.fn.now(),
          updated_at: this.knex.fn.now(),
        });

      updatedEvaluation =
        await this.salesManagerKpiService.getEvaluationById(evaluationId);
    }

    return {
      message: `Decision successfully executed for evaluation ${evaluationId}`,
      decision_type: dto.decision_type,
      action: dto.action,
      evaluation: updatedEvaluation,
    };
  }

  /**
   * Bulk executes multiple or all pending recommendations in one click.
   */
  async bulkDecideAlerts(dto: KpiAlertBulkDecisionDto, reviewerUserId: string) {
    const results = [];
    const errors = [];

    for (const item of dto.decisions) {
      try {
        const res = await this.decideAlert(
          {
            ...item,
            update_salary:
              item.update_salary !== undefined
                ? item.update_salary
                : dto.update_salaries,
          },
          reviewerUserId,
        );
        results.push(res);
      } catch (err: any) {
        errors.push({
          evaluation_id: item.evaluation_id,
          alert_id: item.alert_id,
          error: err.message,
        });
      }
    }

    return {
      total_requested: dto.decisions.length,
      successful_count: results.length,
      failed_count: errors.length,
      results,
      errors,
    };
  }

  /**
   * Dismisses an alert for the pop-up modal.
   */
  async dismissAlert(alertId: string) {
    const alert = await this.knex('kpi_alerts').where({ id: alertId }).first();
    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    await this.knex('kpi_alerts')
      .where({ id: alertId })
      .update({ is_dismissed: true, updated_at: this.knex.fn.now() });

    return { message: 'Alert dismissed successfully', id: alertId };
  }
}
