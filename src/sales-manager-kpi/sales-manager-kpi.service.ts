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
  CargoPaymentStatus,
  CalculateEvaluationDto,
  ApproveSrCheckDto,
  ReviewDemotionDto,
  QueryEvaluationDto,
  UpdateCareerLevelDto,
  QueryCargosMonitoringDto,
  UpdateCargoPaymentStatusDto,
  ConfirmCargoKpiDto,
  BulkConfirmKpiDto,
  BulkUpdatePaymentStatusDto,
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
   * Section 1: Sales Bonus Matrix Calculation (based on monthly net margin / profit sum in USD)
   * $0 - $1,999 => 0%
   * $2,000 - $3,999 => 10%
   * $4,000 - $5,999 => 15%
   * $6,000 - $7,999 => 20%
   * $8,000 - $9,999 => 22%
   * >= $10,000 => 25%
   */
  getSalesBonusRate(totalSalesNetMargin: number): number {
    if (totalSalesNetMargin < 2000) return 0.0;
    if (totalSalesNetMargin < 4000) return 0.1;
    if (totalSalesNetMargin < 6000) return 0.15;
    if (totalSalesNetMargin < 8000) return 0.2;
    if (totalSalesNetMargin < 10000) return 0.22;
    return 0.25;
  }

  /**
   * Helper to normalize payment status input into canonical enum string.
   */
  normalizePaymentStatus(status?: string | null): CargoPaymentStatus {
    if (!status) return CargoPaymentStatus.WAITING;
    const s = status.toLowerCase().trim();
    if (
      s === 'paid' ||
      s === 'tolandi' ||
      s === "to'landi" ||
      s === 'klient berdi' ||
      s === 'olindi'
    ) {
      return CargoPaymentStatus.PAID;
    }
    if (s === 'unpaid' || s === 'klient_bermadi' || s === 'klient bermadi') {
      return CargoPaymentStatus.UNPAID;
    }
    return CargoPaymentStatus.WAITING;
  }

  /**
   * Helper to get Uzbek UI label for payment status.
   */
  getPaymentStatusLabel(status: CargoPaymentStatus): string {
    switch (status) {
      case CargoPaymentStatus.PAID:
        return "To'landi";
      case CargoPaymentStatus.UNPAID:
        return 'Klient bermadi';
      case CargoPaymentStatus.WAITING:
      default:
        return 'Kutilmoqda';
    }
  }

  /**
   * Normalize level string (e.g. "Middle", "Senior") to CareerLevel enum.
   * Supports: "Junior", "Middle"/"Mid", "Senior", "Expert" (case-insensitive).
   */
  private normalizeLevel(level?: string | null): CareerLevel | null {
    if (!level || typeof level !== 'string') return null;
    const s = level.trim().toLowerCase();
    if (s === 'junior') return CareerLevel.JUNIOR;
    if (s === 'mid' || s === 'middle') return CareerLevel.MID;
    if (s === 'senior') return CareerLevel.SENIOR;
    if (s === 'expert') return CareerLevel.EXPERT;
    // Also accept raw enum values (JUNIOR, MID, etc.) case-insensitively
    const upper = s.toUpperCase();
    if ((Object.values(CareerLevel) as string[]).includes(upper)) {
      return upper as CareerLevel;
    }
    return null;
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
   * Helper to get start and end dates for a month (YYYY-MM).
   */
  private getMonthDateRange(monthStr: string) {
    const [year, month] = monthStr.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      startDate: `${monthStr}-01`,
      endDate: `${monthStr}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  /**
   * Convert currency amount to USD safely.
   */
  private async convertToUsd(
    amount: number,
    currency?: string | null,
    rates?: any,
    usdRmbRate?: number | null,
  ): Promise<number> {
    if (!amount || isNaN(amount)) return 0;
    const curr =
      ((currency || 'USD').toUpperCase() as Currency) || Currency.USD;

    if (curr === Currency.USD) {
      return amount;
    }

    if (
      (curr === Currency.RMB || curr === Currency.CNY) &&
      usdRmbRate &&
      usdRmbRate > 0
    ) {
      return amount / usdRmbRate;
    }

    if (this.currencyService) {
      try {
        const amtUzs = await this.currencyService.convertToUzs(
          amount,
          curr,
          rates,
        );
        const conv = await this.currencyService.convert(
          amtUzs,
          Currency.UZS,
          Currency.USD,
        );
        return conv.converted_amount;
      } catch {
        return amount;
      }
    }

    return amount;
  }

  /**
   * Compute total monthly net margin (profit) and deal counts for an employee.
   * Broken down into total, paid, and unpaid/waiting.
   */
  async calculateEmployeeMonthlySales(
    employeeId: string,
    monthStr: string,
  ): Promise<{
    totalSales: number;
    paidSales: number;
    unpaidSales: number;
    dealCount: number;
    paidDealCount: number;
    unpaidDealCount: number;
    waitingDealCount: number;
    kpiConfirmedCount: number;
    totalBuyPriceUsd: number;
    totalSellPriceUsd: number;
  }> {
    let totalProfitUsd = 0;
    let paidProfitUsd = 0;
    let unpaidProfitUsd = 0;
    let totalDeals = 0;
    let paidDeals = 0;
    let unpaidDeals = 0;
    let waitingDeals = 0;
    let kpiConfirmed = 0;
    let totalBuyUsd = 0;
    let totalSellUsd = 0;

    const { startDate, endDate } = this.getMonthDateRange(monthStr);
    const rates = this.currencyService
      ? await this.currencyService.getLatestRates()
      : undefined;

    // 1. Cargo Registrations (Primary cargo store)
    const hasRegTable = await this.knex.schema.hasTable('cargo_registrations');
    if (hasRegTable) {
      const regRows = await this.knex('cargo_registrations')
        .where('employee_id', employeeId)
        .where((b) => {
          b.whereBetween('confirmed_date', [startDate, endDate]).orWhere(
            (sub) => {
              sub
                .whereNull('confirmed_date')
                .whereBetween('created_at', [
                  `${startDate} 00:00:00`,
                  `${endDate} 23:59:59`,
                ]);
            },
          );
        })
        .select(
          'purchase_price',
          'purchase_currency',
          'sell_price',
          'sell_currency',
          'usd_rmb_rate',
          'payment_status',
          'is_kpi_received',
          'is_turnkey',
          'turnkey_price',
          'turnkey_currency',
          'is_speed_up',
          'speed_up',
          'speed_up_currency',
          'additional_expense',
          'additional_expense_currency',
        );

      for (const reg of regRows) {
        const rawBuy = Number(reg.purchase_price || 0);
        const rawSell = Number(reg.sell_price || 0);
        const usdRmb = reg.usd_rmb_rate ? Number(reg.usd_rmb_rate) : null;

        let buyUsd = await this.convertToUsd(
          rawBuy,
          reg.purchase_currency,
          rates,
          usdRmb,
        );
        let sellUsd = await this.convertToUsd(
          rawSell,
          reg.sell_currency,
          rates,
          usdRmb,
        );

        if (reg.is_turnkey) {
          const turnkeyAmt = Number(reg.turnkey_price || 0);
          const turnkeyCurr =
            reg.turnkey_currency || reg.sell_currency || 'USD';
          if (turnkeyAmt > 0) {
            sellUsd += await this.convertToUsd(
              turnkeyAmt,
              turnkeyCurr,
              rates,
              usdRmb,
            );
          }
        }

        const speedUpAmt = Number(reg.speed_up || 0);
        if (speedUpAmt > 0) {
          const speedUpCurr =
            reg.speed_up_currency || reg.sell_currency || 'USD';
          sellUsd += await this.convertToUsd(
            speedUpAmt,
            speedUpCurr,
            rates,
            usdRmb,
          );
        }

        const addExpAmt = Number(reg.additional_expense || 0);
        if (addExpAmt > 0) {
          const addExpCurr = reg.additional_expense_currency || 'USD';
          buyUsd += await this.convertToUsd(
            addExpAmt,
            addExpCurr,
            rates,
            usdRmb,
          );
        }

        const profit = sellUsd - buyUsd;

        totalBuyUsd += buyUsd;
        totalSellUsd += sellUsd;
        totalProfitUsd += profit;
        totalDeals += 1;

        const normStatus = this.normalizePaymentStatus(reg.payment_status);
        if (normStatus === CargoPaymentStatus.PAID) {
          paidProfitUsd += profit;
          paidDeals += 1;
        } else if (normStatus === CargoPaymentStatus.UNPAID) {
          unpaidProfitUsd += profit;
          unpaidDeals += 1;
        } else {
          unpaidProfitUsd += profit;
          waitingDeals += 1;
        }

        if (reg.is_kpi_received) {
          kpiConfirmed += 1;
        }
      }
    }

    // 2. Cargo Transactions (Legacy / Supplementary transactions)
    const hasTxTable = await this.knex.schema.hasTable('cargo_transactions');
    if (hasTxTable) {
      const txRows = await this.knex('cargo_transactions')
        .where('employee_id', employeeId)
        .where('transaction_date', '>=', startDate)
        .where('transaction_date', '<=', endDate)
        .select(
          'buy_price',
          'sell_price',
          'margin',
          'currency',
          'payment_status',
          'is_kpi_received',
        );

      for (const tx of txRows) {
        const rawBuy = Number(tx.buy_price || 0);
        const rawSell = Number(tx.sell_price || 0);
        const rawMargin =
          tx.margin !== undefined && tx.margin !== null
            ? Number(tx.margin)
            : rawSell - rawBuy;

        const buyUsd = await this.convertToUsd(rawBuy, tx.currency, rates);
        const sellUsd = await this.convertToUsd(rawSell, tx.currency, rates);
        const marginUsd = await this.convertToUsd(
          rawMargin,
          tx.currency,
          rates,
        );

        totalBuyUsd += buyUsd;
        totalSellUsd += sellUsd;
        totalProfitUsd += marginUsd;
        totalDeals += 1;

        const normStatus = this.normalizePaymentStatus(tx.payment_status);
        if (normStatus === CargoPaymentStatus.PAID) {
          paidProfitUsd += marginUsd;
          paidDeals += 1;
        } else if (normStatus === CargoPaymentStatus.UNPAID) {
          unpaidProfitUsd += marginUsd;
          unpaidDeals += 1;
        } else {
          unpaidProfitUsd += marginUsd;
          waitingDeals += 1;
        }

        if (tx.is_kpi_received) {
          kpiConfirmed += 1;
        }
      }
    }

    // 3. FTL Fura Items (If any recorded under manager_id)
    const hasFtlTable = await this.knex.schema.hasTable('ftl_fura_items');
    if (hasFtlTable) {
      const ftlRows = await this.knex('ftl_fura_items')
        .where('manager_id', employeeId)
        .where('month', monthStr)
        .select('agent_price', 'sell_price', 'profit', 'kpi_received');

      for (const ftl of ftlRows) {
        const buyUsd = Number(ftl.agent_price || 0);
        const sellUsd = Number(ftl.sell_price || 0);
        const profit = Number(ftl.profit || sellUsd - buyUsd);

        totalBuyUsd += buyUsd;
        totalSellUsd += sellUsd;
        totalProfitUsd += profit;
        totalDeals += 1;

        if (ftl.kpi_received) {
          paidProfitUsd += profit;
          paidDeals += 1;
          kpiConfirmed += 1;
        } else {
          unpaidProfitUsd += profit;
          waitingDeals += 1;
        }
      }
    }

    return {
      totalSales: Math.round(totalProfitUsd * 100) / 100,
      paidSales: Math.round(paidProfitUsd * 100) / 100,
      unpaidSales: Math.round(unpaidProfitUsd * 100) / 100,
      dealCount: totalDeals,
      paidDealCount: paidDeals,
      unpaidDealCount: unpaidDeals,
      waitingDealCount: waitingDeals,
      kpiConfirmedCount: kpiConfirmed,
      totalBuyPriceUsd: Math.round(totalBuyUsd * 100) / 100,
      totalSellPriceUsd: Math.round(totalSellUsd * 100) / 100,
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
    const { month, employee_id, additional_bonus_amount = 0, level } = dto;

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
      let currentLevel =
        (emp.career_level as CareerLevel) || CareerLevel.JUNIOR;
      if (level) {
        const normalized = this.normalizeLevel(level);
        if (!normalized) {
          throw new BadRequestException(
            `Invalid level value '${level}'. Allowed values: Junior, Middle/Mid, Senior, Expert`,
          );
        }
        currentLevel = normalized;
      }
      const levelConfig =
        CAREER_LEVEL_CONFIG[currentLevel] ||
        CAREER_LEVEL_CONFIG[CareerLevel.JUNIOR];

      const salesData = await this.calculateEmployeeMonthlySales(emp.id, month);
      const totalSales = salesData.totalSales; // Total Net Margin Sum in USD
      const dealCount = salesData.dealCount;

      const averageCheck = dealCount > 0 ? totalSales / dealCount : 0;
      const roundedAverageCheck = Math.round(averageCheck * 100) / 100;

      const isPlanAchieved = totalSales >= levelConfig.planMin;
      const isSrCheckAchieved =
        dealCount > 0 ? roundedAverageCheck >= levelConfig.srCheckMin : false;

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
      } else if (isPlanAchieved && !isSrCheckAchieved && dealCount > 0) {
        // Average check rule: sales plan met but average check is low -> requires ROP/CEO approval
        approvalStatus = EvaluationApprovalStatus.PENDING_SR_CHECK_APPROVAL;
      }

      // Calculate Sales Bonus (= KPI Bonus, identical concept)
      const bonusRate = this.getSalesBonusRate(totalSales);
      const salesBonusAmount = Math.round(totalSales * bonusRate * 100) / 100;
      const paidSalesBonusAmount =
        Math.round(salesData.paidSales * bonusRate * 100) / 100;
      const unpaidSalesBonusAmount =
        Math.round((salesBonusAmount - paidSalesBonusAmount) * 100) / 100;

      const totalEarnings =
        Math.round(
          (levelConfig.fixedSalary +
            salesBonusAmount +
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
        sales_bonus_rate: Math.round(bonusRate * 100 * 100) / 100, // percentage e.g. 20.00
        sales_bonus_amount: salesBonusAmount,
        kpi_bonus_amount: salesBonusAmount, // Exactly same as sales bonus amount
        paid_sales_bonus_amount: paidSalesBonusAmount,
        unpaid_sales_bonus_amount: unpaidSalesBonusAmount,
        paid_cargos_count: salesData.paidDealCount,
        unpaid_cargos_count: salesData.unpaidDealCount,
        waiting_cargos_count: salesData.waitingDealCount,
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
   * Section 2: Table in Image 2 - Employee's Assigned Cargos Monitoring & KPI
   * GET /api/sales-manager-kpi/cargos-monitoring
   */
  async getCargosMonitoring(query: QueryCargosMonitoringDto) {
    const month = query.month || new Date().toISOString().slice(0, 7);
    const { startDate, endDate } = this.getMonthDateRange(month);

    let employeeId = query.employee_id;
    if (!employeeId) {
      const firstSalesEmp = await this.knex('employees')
        .where('is_active', true)
        .first();
      if (!firstSalesEmp) {
        throw new NotFoundException('No active employees found');
      }
      employeeId = firstSalesEmp.id;
    }

    const employee = await this.knex('employees')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .where('employees.id', employeeId)
      .select('employees.*', 'departments.name as department_name')
      .first();

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const currentLevel =
      (employee.career_level as CareerLevel) || CareerLevel.JUNIOR;
    const levelConfig =
      CAREER_LEVEL_CONFIG[currentLevel] ||
      CAREER_LEVEL_CONFIG[CareerLevel.JUNIOR];

    const rates = this.currencyService
      ? await this.currencyService.getLatestRates()
      : undefined;

    // Fetch all cargos for this employee for the selected month
    const allCargos: any[] = [];

    // 1. Cargo Registrations
    const hasRegTable = await this.knex.schema.hasTable('cargo_registrations');
    if (hasRegTable) {
      const regRows = await this.knex('cargo_registrations as cr')
        .leftJoin('clients as c', 'cr.client_id', 'c.id')
        .where('cr.employee_id', employeeId)
        .where((b) => {
          b.whereBetween('cr.confirmed_date', [startDate, endDate]).orWhere(
            (sub) => {
              sub
                .whereNull('cr.confirmed_date')
                .whereBetween('cr.created_at', [
                  `${startDate} 00:00:00`,
                  `${endDate} 23:59:59`,
                ]);
            },
          );
        })
        .select(
          'cr.id',
          'cr.container_truck_id',
          'cr.cargo',
          'cr.cargo_type',
          'cr.confirmed_date',
          'cr.created_at',
          'cr.purchase_price',
          'cr.purchase_currency',
          'cr.sell_price',
          'cr.sell_currency',
          'cr.usd_rmb_rate',
          'cr.payment_status',
          'cr.payment_deadline_days',
          'cr.is_kpi_received',
          'cr.kpi_received_at',
          'cr.is_turnkey',
          'cr.turnkey_price',
          'cr.turnkey_currency',
          'cr.is_speed_up',
          'cr.speed_up',
          'cr.speed_up_currency',
          'cr.additional_expense',
          'cr.additional_expense_currency',
          'cr.client_id',
          'c.first_name as client_first_name',
          'c.last_name as client_last_name',
          'c.company_name as client_company',
          'c.phone as client_phone',
        );

      for (const r of regRows) {
        const rawBuy = Number(r.purchase_price || 0);
        const rawSell = Number(r.sell_price || 0);
        const usdRmb = r.usd_rmb_rate ? Number(r.usd_rmb_rate) : null;

        let buyUsd = await this.convertToUsd(
          rawBuy,
          r.purchase_currency,
          rates,
          usdRmb,
        );
        let sellUsd = await this.convertToUsd(
          rawSell,
          r.sell_currency,
          rates,
          usdRmb,
        );

        if (r.is_turnkey) {
          const turnkeyAmt = Number(r.turnkey_price || 0);
          const turnkeyCurr = r.turnkey_currency || r.sell_currency || 'USD';
          if (turnkeyAmt > 0) {
            sellUsd += await this.convertToUsd(
              turnkeyAmt,
              turnkeyCurr,
              rates,
              usdRmb,
            );
          }
        }

        const speedUpAmt = Number(r.speed_up || 0);
        if (speedUpAmt > 0) {
          const speedUpCurr = r.speed_up_currency || r.sell_currency || 'USD';
          sellUsd += await this.convertToUsd(
            speedUpAmt,
            speedUpCurr,
            rates,
            usdRmb,
          );
        }

        const addExpAmt = Number(r.additional_expense || 0);
        if (addExpAmt > 0) {
          const addExpCurr = r.additional_expense_currency || 'USD';
          buyUsd += await this.convertToUsd(
            addExpAmt,
            addExpCurr,
            rates,
            usdRmb,
          );
        }

        const profit = sellUsd - buyUsd;

        const normStatus = this.normalizePaymentStatus(r.payment_status);
        const clientName =
          `${r.client_first_name || ''} ${r.client_last_name || ''}`.trim() ||
          r.client_company ||
          'Client';

        allCargos.push({
          id: r.id,
          source: 'cargo_registration',
          container_truck_id: r.container_truck_id || 'N/A',
          cargo: r.cargo,
          cargo_type: r.cargo_type || 'FTL',
          client_id: r.client_id,
          client_name: clientName,
          client_company: r.client_company,
          client_phone: r.client_phone,
          buy_price: Math.round(buyUsd * 100) / 100,
          sell_price: Math.round(sellUsd * 100) / 100,
          profit: Math.round(profit * 100) / 100,
          is_turnkey: Boolean(r.is_turnkey),
          turnkey_price: Number(r.turnkey_price || 0),
          turnkey_currency: r.turnkey_currency || r.sell_currency || 'USD',
          is_speed_up: Boolean(r.is_speed_up || Number(r.speed_up || 0) > 0),
          speed_up: Number(r.speed_up || 0),
          speed_up_currency: r.speed_up_currency || r.sell_currency || 'USD',
          additional_expense: Number(r.additional_expense || 0),
          additional_expense_currency: r.additional_expense_currency || 'USD',
          payment_deadline_days:
            r.payment_deadline_days !== null &&
            r.payment_deadline_days !== undefined
              ? Number(r.payment_deadline_days)
              : 15,
          payment_status: normStatus,
          payment_status_label: this.getPaymentStatusLabel(normStatus),
          is_paid: normStatus === CargoPaymentStatus.PAID,
          is_kpi_received: Boolean(r.is_kpi_received),
          kpi_received_at: r.kpi_received_at || null,
          confirmed_date: r.confirmed_date || r.created_at,
          created_at: r.created_at,
        });
      }
    }

    // 2. Cargo Transactions (if any additional rows exist)
    const hasTxTable = await this.knex.schema.hasTable('cargo_transactions');
    if (hasTxTable) {
      const txRows = await this.knex('cargo_transactions as ct')
        .leftJoin('clients as c', 'ct.client_id', 'c.id')
        .where('ct.employee_id', employeeId)
        .where('ct.transaction_date', '>=', startDate)
        .where('ct.transaction_date', '<=', endDate)
        .select(
          'ct.id',
          'ct.description',
          'ct.buy_price',
          'ct.sell_price',
          'ct.margin',
          'ct.currency',
          'ct.payment_status',
          'ct.payment_deadline_days',
          'ct.is_kpi_received',
          'ct.kpi_received_at',
          'ct.transaction_date',
          'ct.created_at',
          'ct.client_id',
          'c.first_name as client_first_name',
          'c.last_name as client_last_name',
          'c.company_name as client_company',
          'c.phone as client_phone',
        );

      for (const r of txRows) {
        const rawBuy = Number(r.buy_price || 0);
        const rawSell = Number(r.sell_price || 0);
        const rawMargin =
          r.margin !== undefined && r.margin !== null
            ? Number(r.margin)
            : rawSell - rawBuy;

        const buyUsd = await this.convertToUsd(rawBuy, r.currency, rates);
        const sellUsd = await this.convertToUsd(rawSell, r.currency, rates);
        const profit = await this.convertToUsd(rawMargin, r.currency, rates);

        const normStatus = this.normalizePaymentStatus(r.payment_status);
        const clientName =
          `${r.client_first_name || ''} ${r.client_last_name || ''}`.trim() ||
          r.client_company ||
          'Client';

        allCargos.push({
          id: r.id,
          source: 'cargo_transaction',
          container_truck_id: r.description || 'Transaction',
          cargo: r.description || 'Cargo Transaction',
          cargo_type: 'FTL',
          client_id: r.client_id,
          client_name: clientName,
          client_company: r.client_company,
          client_phone: r.client_phone,
          buy_price: Math.round(buyUsd * 100) / 100,
          sell_price: Math.round(sellUsd * 100) / 100,
          profit: Math.round(profit * 100) / 100,
          payment_deadline_days:
            r.payment_deadline_days !== null &&
            r.payment_deadline_days !== undefined
              ? Number(r.payment_deadline_days)
              : 15,
          payment_status: normStatus,
          payment_status_label: this.getPaymentStatusLabel(normStatus),
          is_paid: normStatus === CargoPaymentStatus.PAID,
          is_kpi_received: Boolean(r.is_kpi_received),
          kpi_received_at: r.kpi_received_at || null,
          confirmed_date: r.transaction_date || r.created_at,
          created_at: r.created_at,
        });
      }
    }

    // Calculate total sales / net margin across ALL cargos to establish the monthly KPI %
    const totalProfitAllCargos = allCargos.reduce(
      (sum, c) => sum + c.profit,
      0,
    );
    const bonusRate = this.getSalesBonusRate(totalProfitAllCargos);
    const kpiRatePct = Math.round(bonusRate * 100); // e.g. 24 or 20 or 25%

    // Decorate each cargo with its specific cargo KPI bonus based on the employee's monthly rate tier
    const enrichedCargos = allCargos.map((cargo, index) => {
      const cargoBonus = Math.round(cargo.profit * bonusRate * 100) / 100;
      return {
        index: index + 1,
        ...cargo,
        current_kpi_rate: kpiRatePct,
        current_kpi_rate_percentage: `${kpiRatePct}%`,
        cargo_bonus: cargoBonus,
        cargo_bonus_rounded: Math.round(cargoBonus),
      };
    });

    // Apply query filters if provided
    let filteredCargos = enrichedCargos;

    if (query.payment_status && query.payment_status !== 'all') {
      const targetStatus = this.normalizePaymentStatus(query.payment_status);
      filteredCargos = filteredCargos.filter(
        (c) => c.payment_status === targetStatus,
      );
    }

    if (query.search) {
      const s = query.search.toLowerCase().trim();
      filteredCargos = filteredCargos.filter(
        (c) =>
          c.container_truck_id.toLowerCase().includes(s) ||
          c.client_name.toLowerCase().includes(s) ||
          (c.cargo && c.cargo.toLowerCase().includes(s)),
      );
    }

    // Pagination
    const page = query.page ? Math.max(1, parseInt(query.page, 10)) : 1;
    const limit = query.limit
      ? Math.min(100, Math.max(1, parseInt(query.limit, 10)))
      : 50;
    const offset = (page - 1) * limit;
    const paginatedData = filteredCargos.slice(offset, offset + limit);

    // Totals and metadata
    const totalBuyPrice = allCargos.reduce((sum, c) => sum + c.buy_price, 0);
    const totalSellPrice = allCargos.reduce((sum, c) => sum + c.sell_price, 0);
    const totalProfit = Math.round(totalProfitAllCargos * 100) / 100;
    const totalCargosCount = allCargos.length;
    const averageCheck =
      totalCargosCount > 0
        ? Math.round((totalProfit / totalCargosCount) * 100) / 100
        : 0;

    const isPlanAchieved = totalProfit >= levelConfig.planMin;
    const isSrCheckAchieved =
      totalCargosCount > 0 && averageCheck >= levelConfig.srCheckMin;

    const paidCargos = allCargos.filter((c) => c.is_paid);
    const unpaidCargos = allCargos.filter(
      (c) => c.payment_status === CargoPaymentStatus.UNPAID,
    );
    const waitingCargos = allCargos.filter(
      (c) => c.payment_status === CargoPaymentStatus.WAITING,
    );
    const kpiConfirmedCargos = allCargos.filter((c) => c.is_kpi_received);

    const totalPotentialKpiBonus =
      Math.round(totalProfit * bonusRate * 100) / 100;
    const totalPaidKpiBonus =
      Math.round(paidCargos.reduce((sum, c) => sum + c.cargo_bonus, 0) * 100) /
      100;
    const totalUnpaidKpiBonus =
      Math.round((totalPotentialKpiBonus - totalPaidKpiBonus) * 100) / 100;

    return {
      meta: {
        employee_id: employee.id,
        employee_name:
          `${employee.first_name || ''} ${employee.last_name || ''}`.trim(),
        department_name: employee.department_name || 'Sales',
        career_level: currentLevel,
        month,
        fixed_salary: levelConfig.fixedSalary,
        total_cargos: totalCargosCount,
        total_buy_price: Math.round(totalBuyPrice * 100) / 100,
        total_sell_price: Math.round(totalSellPrice * 100) / 100,
        total_profit: totalProfit,
        average_check: averageCheck,
        sr_check_min: levelConfig.srCheckMin,
        sr_check_target: levelConfig.srCheckTarget,
        is_sr_check_achieved: isSrCheckAchieved,
        is_plan_achieved: isPlanAchieved,
        current_kpi_rate: kpiRatePct,
        current_kpi_rate_percentage: `${kpiRatePct}%`,
        total_potential_kpi_bonus: totalPotentialKpiBonus,
        total_paid_kpi_bonus: totalPaidKpiBonus,
        total_unpaid_kpi_bonus: totalUnpaidKpiBonus,
        paid_cargos_count: paidCargos.length,
        unpaid_cargos_count: unpaidCargos.length,
        waiting_cargos_count: waitingCargos.length,
        kpi_confirmed_cargos_count: kpiConfirmedCargos.length,
        real_kpi_expense: totalPaidKpiBonus,
        total_earnings_estimated:
          Math.round((levelConfig.fixedSalary + totalPotentialKpiBonus) * 100) /
          100,
        total_earnings_realized:
          Math.round((levelConfig.fixedSalary + totalPaidKpiBonus) * 100) / 100,
      },
      pagination: {
        total: filteredCargos.length,
        page,
        limit,
        totalPages: Math.ceil(filteredCargos.length / limit),
      },
      data: paginatedData,
    };
  }

  /**
   * Update payment status and payment deadline for a cargo record.
   */
  async updateCargoPaymentStatus(
    cargoId: string,
    dto: UpdateCargoPaymentStatusDto,
  ) {
    const normStatus = this.normalizePaymentStatus(dto.payment_status);

    const updatePayload: Record<string, any> = {
      payment_status: normStatus,
      updated_at: this.knex.fn.now(),
    };
    if (dto.payment_deadline_days !== undefined) {
      updatePayload.payment_deadline_days = dto.payment_deadline_days;
    }

    let updated = await this.knex('cargo_registrations')
      .where({ id: cargoId })
      .update(updatePayload);

    if (!updated) {
      updated = await this.knex('cargo_transactions')
        .where({ id: cargoId })
        .update(updatePayload);
    }

    if (!updated) {
      throw new NotFoundException('Cargo item not found');
    }

    return {
      id: cargoId,
      payment_status: normStatus,
      payment_status_label: this.getPaymentStatusLabel(normStatus),
      payment_deadline_days: dto.payment_deadline_days,
      updated: true,
    };
  }

  /**
   * Employee / Manager confirms that the employee received their KPI bonus for a cargo.
   */
  async confirmCargoKpi(cargoId: string, dto: ConfirmCargoKpiDto) {
    const isReceived =
      dto.is_kpi_received !== undefined ? dto.is_kpi_received : true;

    const updatePayload: Record<string, any> = {
      is_kpi_received: isReceived,
      kpi_received_at: isReceived ? this.knex.fn.now() : null,
      updated_at: this.knex.fn.now(),
    };

    let updated = await this.knex('cargo_registrations')
      .where({ id: cargoId })
      .update(updatePayload);

    if (!updated) {
      updated = await this.knex('cargo_transactions')
        .where({ id: cargoId })
        .update(updatePayload);
    }

    if (!updated) {
      throw new NotFoundException('Cargo item not found');
    }

    return {
      id: cargoId,
      is_kpi_received: isReceived,
      kpi_received_at: isReceived ? new Date().toISOString() : null,
      review_notes: dto.review_notes || null,
      updated: true,
    };
  }

  /**
   * Bulk confirm employee KPI receipts for a month.
   */
  async bulkConfirmEmployeeKpi(dto: BulkConfirmKpiDto) {
    const isReceived =
      dto.is_kpi_received !== undefined ? dto.is_kpi_received : true;
    const { startDate, endDate } = this.getMonthDateRange(dto.month);

    let regQuery = this.knex('cargo_registrations')
      .where('employee_id', dto.employee_id)
      .where((b) => {
        b.whereBetween('confirmed_date', [startDate, endDate]).orWhere(
          (sub) => {
            sub
              .whereNull('confirmed_date')
              .whereBetween('created_at', [
                `${startDate} 00:00:00`,
                `${endDate} 23:59:59`,
              ]);
          },
        );
      });

    if (dto.cargo_ids && dto.cargo_ids.length > 0) {
      regQuery = regQuery.whereIn('id', dto.cargo_ids);
    }

    const regUpdated = await regQuery.update({
      is_kpi_received: isReceived,
      kpi_received_at: isReceived ? this.knex.fn.now() : null,
      updated_at: this.knex.fn.now(),
    });

    let txQuery = this.knex('cargo_transactions')
      .where('employee_id', dto.employee_id)
      .where('transaction_date', '>=', startDate)
      .where('transaction_date', '<=', endDate);

    if (dto.cargo_ids && dto.cargo_ids.length > 0) {
      txQuery = txQuery.whereIn('id', dto.cargo_ids);
    }

    const txUpdated = await txQuery.update({
      is_kpi_received: isReceived,
      kpi_received_at: isReceived ? this.knex.fn.now() : null,
      updated_at: this.knex.fn.now(),
    });

    return {
      employee_id: dto.employee_id,
      month: dto.month,
      is_kpi_received: isReceived,
      cargos_updated: regUpdated + txUpdated,
    };
  }

  /**
   * Bulk update payment status for specified cargo IDs.
   */
  async bulkUpdatePaymentStatus(dto: BulkUpdatePaymentStatusDto) {
    const normStatus = this.normalizePaymentStatus(dto.payment_status);
    const updatePayload: Record<string, any> = {
      payment_status: normStatus,
      updated_at: this.knex.fn.now(),
    };
    if (dto.payment_deadline_days !== undefined) {
      updatePayload.payment_deadline_days = dto.payment_deadline_days;
    }

    const regUpdated = await this.knex('cargo_registrations')
      .whereIn('id', dto.cargo_ids)
      .update(updatePayload);

    const txUpdated = await this.knex('cargo_transactions')
      .whereIn('id', dto.cargo_ids)
      .update(updatePayload);

    return {
      payment_status: normStatus,
      payment_status_label: this.getPaymentStatusLabel(normStatus),
      cargos_updated: regUpdated + txUpdated,
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
        'employees.fixed_salary as employee_fixed_salary',
        this.knex.raw(
          "COALESCE(NULLIF(TRIM(CONCAT(reviewer_emp.first_name, ' ', reviewer_emp.last_name)), ''), users.username) as reviewer_name",
        ),
      )
      .where('sales_manager_evaluations.id', id)
      .first();

    if (!record) {
      throw new NotFoundException('Evaluation record not found');
    }

    const { employee_fixed_salary, ...rest } = record;
    return {
      ...rest,
      fixed_salary:
        employee_fixed_salary != null
          ? Number(employee_fixed_salary)
          : Number(rest.fixed_salary),
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
        'employees.fixed_salary as employee_fixed_salary',
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

    const data = rows.map((r) => {
      const { employee_fixed_salary, ...rest } = r;
      return {
        ...rest,
        fixed_salary:
          employee_fixed_salary != null
            ? Number(employee_fixed_salary)
            : Number(rest.fixed_salary),
        employee_name: `${r.employee_first_name} ${r.employee_last_name}`,
      };
    });

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
