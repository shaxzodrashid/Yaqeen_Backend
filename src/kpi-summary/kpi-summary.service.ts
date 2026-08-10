import { Injectable, Inject, Optional } from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { CurrencyService } from '../currency/currency.service';
import { Currency } from '../currency/currency.types';
import {
  KpiSummaryQueryDto,
  KpiHistoryQueryDto,
  KpiSourceType,
  SortOrder,
} from './dto/kpi-query.dto';

export interface EmployeeKpiSummaryRow {
  employee_id: string;
  employee_name: string;
  department_id: string | null;
  department_name: string;
  career_level: string | null;
  month: string;
  total_kpi: number;
  total_ltl_kpi: number;
  total_ftl_kpi: number;
  total_rop_kpi: number;
  total_sales_kpi: number;
  total_transactions_kpi: number;
  ltl_volume_m3: number;
  ftl_fura_count: number;
  transactions_count: number;
  total_margin_generated: number;
  currency: string;
}

export interface KpiHistoryItem {
  id: string;
  employee_id: string;
  employee_name: string;
  department_name?: string;
  source_type: KpiSourceType;
  source_id: string;
  date: string;
  month: string;
  kpi_amount: number;
  margin_amount: number;
  currency: string;
  description: string;
  details: Record<string, any>;
}

@Injectable()
export class KpiSummaryService {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    @Optional() private readonly currencyService?: CurrencyService,
  ) {}

  // ==========================================
  // HELPER CALCULATORS & CURRENCY CONVERSION
  // ==========================================

  private round2(val: number): number {
    return Math.round((val || 0) * 100) / 100;
  }

  private getCurrentMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private async convertAmount(
    amountUsd: number,
    targetCurrency?: Currency,
  ): Promise<{ amount: number; currency: Currency }> {
    const target = targetCurrency || Currency.USD;
    if (target === Currency.USD || !this.currencyService) {
      return { amount: this.round2(amountUsd), currency: Currency.USD };
    }
    try {
      const res = await this.currencyService.convert(
        amountUsd,
        Currency.USD,
        target,
      );
      return {
        amount: this.round2(res.converted_amount),
        currency: target,
      };
    } catch {
      return { amount: this.round2(amountUsd), currency: Currency.USD };
    }
  }

  private getLtlBaseRate(density: number, cargoType: string): number {
    if (cargoType === 'lyustra') return 3;

    let oddiyRate: number;
    if (density <= 100) oddiyRate = 3;
    else if (density <= 200) oddiyRate = 4;
    else if (density <= 300) oddiyRate = 5;
    else if (density <= 400) oddiyRate = 6;
    else if (density <= 500) oddiyRate = 7;
    else if (density <= 700) oddiyRate = 8;
    else if (density <= 1000) oddiyRate = 9;
    else oddiyRate = 10;

    return cargoType === 'pod_klyuch' ? oddiyRate + 5 : oddiyRate;
  }

  private getLtlVolumeCoefficient(totalVolume: number): number {
    if (totalVolume < 21) return 0.0;
    if (totalVolume <= 40) return 0.5;
    if (totalVolume <= 60) return 0.8;
    if (totalVolume <= 74) return 0.9;
    if (totalVolume <= 80) return 1.0;
    return 1.2;
  }

  private getFtlMonthlyRate(totalProfit: number): number {
    if (totalProfit < 1500) return 0.0;
    if (totalProfit < 4000) return 0.08;
    if (totalProfit < 5000) return 0.1;
    if (totalProfit < 6000) return 0.12;
    if (totalProfit < 7000) return 0.14;
    if (totalProfit < 8000) return 0.16;
    if (totalProfit < 10000) return 0.18;
    return 0.24;
  }

  private getFtlTimeMultiplier(
    actualDays: number,
    plannedDays: number,
  ): number {
    if (actualDays <= 5) return 1.1;
    const delay = actualDays - plannedDays;
    if (delay <= 2) return 1.0;
    if (delay <= 10) return 0.9;
    if (delay <= 15) return 0.85;
    if (delay <= 20) return 0.75;
    return 0.5;
  }

  // ==========================================
  // 1. GET KPI SUMMARY (GET /api/v1/kpi/summary)
  // ==========================================

  async getKpiSummary(query: KpiSummaryQueryDto) {
    const targetMonth =
      query.month && query.month !== 'all'
        ? query.month
        : this.getCurrentMonth();

    const isAllMonths = query.month === 'all';
    const targetCurrency = query.target_currency || Currency.USD;

    // 1. Fetch Employees matching filter
    const empQuery = this.knex('employees')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .select(
        'employees.id',
        'employees.first_name',
        'employees.last_name',
        'employees.department_id',
        'employees.career_level',
        'employees.is_active',
        'departments.name as department_name',
      );

    if (query.employee_id) {
      empQuery.where('employees.id', query.employee_id);
    }
    if (query.department_id) {
      empQuery.where('employees.department_id', query.department_id);
    }
    if (query.search) {
      const s = `%${query.search.toLowerCase()}%`;
      empQuery.where((builder) => {
        builder
          .whereRaw('LOWER(employees.first_name) LIKE ?', [s])
          .orWhereRaw('LOWER(employees.last_name) LIKE ?', [s])
          .orWhereRaw(
            "LOWER(CONCAT(employees.first_name, ' ', employees.last_name)) LIKE ?",
            [s],
          );
      });
    }

    const employees = await empQuery;

    // 2. Fetch all raw KPI source data for target month
    let ltlQuery = this.knex('ltl_cargo_items').select('*');
    let ftlQuery = this.knex('ftl_fura_items').select('*');
    let ropQuery = this.knex('rop_worker_sales').select('*');
    let salesQuery = this.knex('sales_manager_evaluations').select('*');
    let txQuery = this.knex('cargo_transactions').select('*');

    if (!isAllMonths) {
      const [yearStr, monthStr] = targetMonth.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 1));

      ltlQuery = ltlQuery
        .where('created_at', '>=', startDate)
        .where('created_at', '<', endDate);

      ftlQuery = ftlQuery.where('month', targetMonth);
      ropQuery = ropQuery.where('month', targetMonth);
      salesQuery = salesQuery.where('month', targetMonth);

      const startDateStr = `${targetMonth}-01`;
      const endYear = month === 12 ? year + 1 : year;
      const endMonth = month === 12 ? 1 : month + 1;
      const endDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

      txQuery = txQuery
        .where('transaction_date', '>=', startDateStr)
        .where('transaction_date', '<', endDateStr);
    }

    const [ltlItems, ftlItems, ropSales, salesEvals, transactions] =
      await Promise.all([ltlQuery, ftlQuery, ropQuery, salesQuery, txQuery]);

    // Group FTL total profit per manager to determine FTL monthly rate
    const ftlProfitByManager: Record<string, number> = {};
    for (const item of ftlItems) {
      if (item.manager_id) {
        ftlProfitByManager[item.manager_id] =
          (ftlProfitByManager[item.manager_id] || 0) + Number(item.profit || 0);
      }
    }

    // Group LTL total volume per employee to determine LTL volume coefficient
    const ltlVolumeByEmployee: Record<string, number> = {};
    for (const item of ltlItems) {
      if (item.employee_id) {
        ltlVolumeByEmployee[item.employee_id] =
          (ltlVolumeByEmployee[item.employee_id] || 0) +
          Number(item.volume || 0);
      }
    }

    // 3. Compute Employee Summaries
    const summaryRows: EmployeeKpiSummaryRow[] = await Promise.all(
      employees.map(async (emp) => {
        const empId = emp.id;
        const empName = `${emp.first_name} ${emp.last_name}`.trim();

        // a) LTL Calculation
        const empLtlItems = ltlItems.filter((i) => i.employee_id === empId);
        const totalLtlVolume = empLtlItems.reduce(
          (sum, i) => sum + Number(i.volume || 0),
          0,
        );
        let sumBaseLtlKpi = 0;
        for (const i of empLtlItems) {
          const v = Number(i.volume || 0);
          const w = Number(i.weight || 0);
          const density = v > 0 ? w / v : 0;
          const rate = this.getLtlBaseRate(density, i.cargo_type);
          sumBaseLtlKpi += v * rate;
        }
        const ltlCoeff = this.getLtlVolumeCoefficient(totalLtlVolume);
        const totalLtlKpiUsd = sumBaseLtlKpi * ltlCoeff;

        // b) FTL Calculation
        const empFtlItems = ftlItems.filter((i) => i.manager_id === empId);
        const managerProfitUsd = ftlProfitByManager[empId] || 0;
        const ftlMonthlyRate = this.getFtlMonthlyRate(managerProfitUsd);
        let sumFtlWeightedProfit = 0;
        let ftlProfitGeneratedUsd = 0;
        for (const i of empFtlItems) {
          const profit = Number(i.profit || 0);
          const mult = this.getFtlTimeMultiplier(
            Number(i.actual_days || 20),
            Number(i.planned_days || 20),
          );
          sumFtlWeightedProfit += profit * mult;
          ftlProfitGeneratedUsd += profit;
        }
        const totalFtlKpiUsd = ftlMonthlyRate * sumFtlWeightedProfit;

        // c) ROP Sales
        const empRopSales = ropSales.filter((i) => i.employee_id === empId);
        const totalRopKpiUsd = empRopSales.reduce(
          (sum, i) => sum + Number(i.sales_amount || 0) * 0.05,
          0,
        );

        // d) Sales Evaluations
        const empSalesEvals = salesEvals.filter((i) => i.employee_id === empId);
        const totalSalesKpiUsd = empSalesEvals.reduce(
          (sum, i) =>
            sum +
            Number(i.sales_bonus_amount || 0) +
            Number(i.kpi_bonus_amount || 0) +
            Number(i.additional_bonus_amount || 0),
          0,
        );

        // e) Transactions
        const empTx = transactions.filter((i) => i.employee_id === empId);
        const totalTxKpiUsd = empTx.reduce(
          (sum, i) => sum + Number(i.kpi_bonus || 0),
          0,
        );
        const txMarginGeneratedUsd = empTx.reduce(
          (sum, i) => sum + Number(i.margin || 0),
          0,
        );

        const totalKpiUsd =
          totalLtlKpiUsd +
          totalFtlKpiUsd +
          totalRopKpiUsd +
          totalSalesKpiUsd +
          totalTxKpiUsd;
        const totalMarginUsd = ftlProfitGeneratedUsd + txMarginGeneratedUsd;

        // Convert amounts to target currency if requested
        const [cKpi, cLtl, cFtl, cRop, cSales, cTx, cMargin] =
          await Promise.all([
            this.convertAmount(totalKpiUsd, targetCurrency),
            this.convertAmount(totalLtlKpiUsd, targetCurrency),
            this.convertAmount(totalFtlKpiUsd, targetCurrency),
            this.convertAmount(totalRopKpiUsd, targetCurrency),
            this.convertAmount(totalSalesKpiUsd, targetCurrency),
            this.convertAmount(totalTxKpiUsd, targetCurrency),
            this.convertAmount(totalMarginUsd, targetCurrency),
          ]);

        return {
          employee_id: empId,
          employee_name: empName,
          department_id: emp.department_id || null,
          department_name: emp.department_name || 'N/A',
          career_level: emp.career_level || null,
          month: targetMonth,
          total_kpi: cKpi.amount,
          total_ltl_kpi: cLtl.amount,
          total_ftl_kpi: cFtl.amount,
          total_rop_kpi: cRop.amount,
          total_sales_kpi: cSales.amount,
          total_transactions_kpi: cTx.amount,
          ltl_volume_m3: this.round2(totalLtlVolume),
          ftl_fura_count: empFtlItems.length,
          transactions_count: empTx.length,
          total_margin_generated: cMargin.amount,
          currency: cKpi.currency,
        };
      }),
    );

    // 4. Sort results
    const sortBy = query.sort_by || 'total_kpi';
    const isAsc = query.order === SortOrder.ASC;

    summaryRows.sort((a, b) => {
      const recA = a as unknown as Record<string, unknown>;
      const recB = b as unknown as Record<string, unknown>;
      const rawA = recA[sortBy];
      const rawB = recB[sortBy];

      if (typeof rawA === 'string') {
        const strA = rawA.toLowerCase();
        const strB = typeof rawB === 'string' ? rawB.toLowerCase() : '';
        return isAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
      }

      const numA = Number(rawA || 0);
      const numB = Number(rawB || 0);
      return isAsc ? numA - numB : numB - numA;
    });

    // 5. Pagination & Grand Totals
    const page = query.page || 1;
    const limit = query.limit || 20;
    const totalEmployees = summaryRows.length;
    const totalPages = Math.ceil(totalEmployees / limit) || 1;
    const offset = (page - 1) * limit;

    const paginatedData = summaryRows.slice(offset, offset + limit);

    // Aggregate Grand Totals across all matching employees
    const grandTotals = summaryRows.reduce(
      (acc, r) => {
        acc.grand_total_kpi += r.total_kpi;
        acc.total_ltl_kpi += r.total_ltl_kpi;
        acc.total_ftl_kpi += r.total_ftl_kpi;
        acc.total_rop_kpi += r.total_rop_kpi;
        acc.total_sales_kpi += r.total_sales_kpi;
        acc.total_transactions_kpi += r.total_transactions_kpi;
        acc.total_margin_generated += r.total_margin_generated;
        return acc;
      },
      {
        grand_total_kpi: 0,
        total_ltl_kpi: 0,
        total_ftl_kpi: 0,
        total_rop_kpi: 0,
        total_sales_kpi: 0,
        total_transactions_kpi: 0,
        total_margin_generated: 0,
      },
    );

    return {
      meta: {
        total: totalEmployees,
        page,
        limit,
        totalPages,
        month: targetMonth,
        currency: targetCurrency,
        totals: {
          grand_total_kpi: this.round2(grandTotals.grand_total_kpi),
          total_ltl_kpi: this.round2(grandTotals.total_ltl_kpi),
          total_ftl_kpi: this.round2(grandTotals.total_ftl_kpi),
          total_rop_kpi: this.round2(grandTotals.total_rop_kpi),
          total_sales_kpi: this.round2(grandTotals.total_sales_kpi),
          total_transactions_kpi: this.round2(
            grandTotals.total_transactions_kpi,
          ),
          total_margin_generated: this.round2(
            grandTotals.total_margin_generated,
          ),
        },
      },
      pagination: {
        total: totalEmployees,
        page,
        limit,
        totalPages,
      },
      data: paginatedData,
    };
  }

  // ==========================================
  // 2. GET KPI HISTORY (GET /api/v1/kpi/history)
  // ==========================================

  async getKpiHistory(query: KpiHistoryQueryDto) {
    const historyItems: KpiHistoryItem[] = [];
    const targetCurrency = query.target_currency || Currency.USD;

    // Query LTL Items
    let ltlQuery = this.knex('ltl_cargo_items')
      .join('employees', 'ltl_cargo_items.employee_id', 'employees.id')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .select(
        'ltl_cargo_items.*',
        'employees.first_name',
        'employees.last_name',
        'departments.name as department_name',
      );

    // Query FTL Items
    let ftlQuery = this.knex('ftl_fura_items')
      .join('employees', 'ftl_fura_items.manager_id', 'employees.id')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .select(
        'ftl_fura_items.*',
        'employees.first_name',
        'employees.last_name',
        'departments.name as department_name',
      );

    // Query ROP Worker Sales
    let ropQuery = this.knex('rop_worker_sales')
      .join('employees', 'rop_worker_sales.employee_id', 'employees.id')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .select(
        'rop_worker_sales.*',
        'employees.first_name',
        'employees.last_name',
        'departments.name as department_name',
      );

    // Query Sales Manager Evaluations
    let salesQuery = this.knex('sales_manager_evaluations')
      .join(
        'employees',
        'sales_manager_evaluations.employee_id',
        'employees.id',
      )
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .select(
        'sales_manager_evaluations.*',
        'employees.first_name',
        'employees.last_name',
        'departments.name as department_name',
      );

    // Query Cargo Transactions
    let txQuery = this.knex('cargo_transactions')
      .join('employees', 'cargo_transactions.employee_id', 'employees.id')
      .leftJoin(
        'departments',
        'cargo_transactions.department_id',
        'departments.id',
      )
      .leftJoin('clients', 'cargo_transactions.client_id', 'clients.id')
      .select(
        'cargo_transactions.*',
        'employees.first_name',
        'employees.last_name',
        'departments.name as department_name',
        'clients.name as client_name',
      );

    if (query.employee_id) {
      ltlQuery = ltlQuery.where(
        'ltl_cargo_items.employee_id',
        query.employee_id,
      );
      ftlQuery = ftlQuery.where('ftl_fura_items.manager_id', query.employee_id);
      ropQuery = ropQuery.where(
        'rop_worker_sales.employee_id',
        query.employee_id,
      );
      salesQuery = salesQuery.where(
        'sales_manager_evaluations.employee_id',
        query.employee_id,
      );
      txQuery = txQuery.where(
        'cargo_transactions.employee_id',
        query.employee_id,
      );
    }

    if (query.month && query.month !== 'all') {
      const m = query.month;
      const [yearStr, monthStr] = m.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 1));

      ltlQuery = ltlQuery
        .where('ltl_cargo_items.created_at', '>=', startDate)
        .where('ltl_cargo_items.created_at', '<', endDate);

      ftlQuery = ftlQuery.where('ftl_fura_items.month', m);
      ropQuery = ropQuery.where('rop_worker_sales.month', m);
      salesQuery = salesQuery.where('sales_manager_evaluations.month', m);

      const startDateStr = `${m}-01`;
      const endYear = month === 12 ? year + 1 : year;
      const endMonth = month === 12 ? 1 : month + 1;
      const endDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

      txQuery = txQuery
        .where('cargo_transactions.transaction_date', '>=', startDateStr)
        .where('cargo_transactions.transaction_date', '<', endDateStr);
    }

    const fetchLtl =
      !query.source_type || query.source_type === KpiSourceType.LTL;
    const fetchFtl =
      !query.source_type || query.source_type === KpiSourceType.FTL;
    const fetchRop =
      !query.source_type || query.source_type === KpiSourceType.ROP;
    const fetchSales =
      !query.source_type || query.source_type === KpiSourceType.SALES;
    const fetchTx =
      !query.source_type || query.source_type === KpiSourceType.TRANSACTION;

    const [ltlRes, ftlRes, ropRes, salesRes, txRes] = await Promise.all([
      fetchLtl ? ltlQuery : Promise.resolve([]),
      fetchFtl ? ftlQuery : Promise.resolve([]),
      fetchRop ? ropQuery : Promise.resolve([]),
      fetchSales ? salesQuery : Promise.resolve([]),
      fetchTx ? txQuery : Promise.resolve([]),
    ]);

    // 1. Process LTL Items
    for (const r of ltlRes) {
      const empName = `${r.first_name} ${r.last_name}`.trim();
      const v = Number(r.volume || 0);
      const w = Number(r.weight || 0);
      const density = v > 0 ? w / v : 0;
      const rate = this.getLtlBaseRate(density, r.cargo_type);
      const baseKpiUsd = v * rate;
      const dateStr = r.created_at
        ? new Date(r.created_at).toISOString().split('T')[0]
        : '';
      const monthStr = dateStr ? dateStr.substring(0, 7) : '';

      const cKpi = await this.convertAmount(baseKpiUsd, targetCurrency);

      historyItems.push({
        id: r.id,
        employee_id: r.employee_id,
        employee_name: empName,
        department_name: r.department_name || 'LTL / Sborniy',
        source_type: KpiSourceType.LTL,
        source_id: r.id,
        date: dateStr,
        month: monthStr,
        kpi_amount: cKpi.amount,
        margin_amount: 0,
        currency: cKpi.currency,
        description: `LTL Cargo (${r.cargo_type}): Volume ${v} m³, Weight ${w} kg, Density ${this.round2(density)} kg/m³, Base Rate $${rate}/m³`,
        details: {
          volume: v,
          weight: w,
          cargo_type: r.cargo_type,
          density: this.round2(density),
          base_rate: rate,
          base_kpi: this.round2(baseKpiUsd),
        },
      });
    }

    // 2. Process FTL Items
    const ftlProfitByManager: Record<string, number> = {};
    for (const r of ftlRes) {
      if (r.manager_id) {
        ftlProfitByManager[r.manager_id] =
          (ftlProfitByManager[r.manager_id] || 0) + Number(r.profit || 0);
      }
    }

    for (const r of ftlRes) {
      const empName = `${r.first_name} ${r.last_name}`.trim();
      const profitUsd = Number(r.profit || 0);
      const totalMgrProfitUsd = ftlProfitByManager[r.manager_id] || profitUsd;
      const monthlyRate = this.getFtlMonthlyRate(totalMgrProfitUsd);
      const mult = this.getFtlTimeMultiplier(
        Number(r.actual_days || 20),
        Number(r.planned_days || 20),
      );
      const kpiEarnedUsd = monthlyRate * profitUsd * mult;
      const dateStr = r.created_at
        ? new Date(r.created_at).toISOString().split('T')[0]
        : '';

      const cKpi = await this.convertAmount(kpiEarnedUsd, targetCurrency);
      const cMargin = await this.convertAmount(profitUsd, targetCurrency);

      historyItems.push({
        id: r.id,
        employee_id: r.manager_id,
        employee_name: empName,
        department_name: r.department_name || 'FTL Logistics',
        source_type: KpiSourceType.FTL,
        source_id: r.id,
        date: dateStr,
        month: r.month,
        kpi_amount: cKpi.amount,
        margin_amount: cMargin.amount,
        currency: cKpi.currency,
        description: `FTL Fura: Sell $${r.sell_price}, Agent $${r.agent_price}, Profit $${profitUsd}, Planned ${r.planned_days}d / Actual ${r.actual_days}d (Mult x${mult}, Rate ${Math.round(monthlyRate * 100)}%)`,
        details: {
          agent_price: Number(r.agent_price),
          sell_price: Number(r.sell_price),
          profit: profitUsd,
          planned_days: r.planned_days,
          actual_days: r.actual_days,
          time_multiplier: mult,
          monthly_rate: monthlyRate,
          kpi_received: r.kpi_received,
        },
      });
    }

    // 3. Process ROP Worker Sales
    for (const r of ropRes) {
      const empName = `${r.first_name} ${r.last_name}`.trim();
      const salesAmountUsd = Number(r.sales_amount || 0);
      const kpiEarnedUsd = salesAmountUsd * 0.05;
      const dateStr = r.created_at
        ? new Date(r.created_at).toISOString().split('T')[0]
        : '';

      const cKpi = await this.convertAmount(kpiEarnedUsd, targetCurrency);
      const cSales = await this.convertAmount(salesAmountUsd, targetCurrency);

      historyItems.push({
        id: r.id,
        employee_id: r.employee_id,
        employee_name: empName,
        department_name: r.department_name || 'ROP Sales',
        source_type: KpiSourceType.ROP,
        source_id: r.id,
        date: dateStr,
        month: r.month || (dateStr ? dateStr.substring(0, 7) : ''),
        kpi_amount: cKpi.amount,
        margin_amount: cSales.amount,
        currency: cKpi.currency,
        description: `ROP Worker Sales: Total Sales $${salesAmountUsd} (5% KPI Bonus = $${this.round2(kpiEarnedUsd)})`,
        details: {
          worker_name: r.worker_name,
          sales_amount: salesAmountUsd,
        },
      });
    }

    // 4. Process Sales Manager Evaluations
    for (const r of salesRes) {
      const empName = `${r.first_name} ${r.last_name}`.trim();
      const totalSalesUsd = Number(r.total_sales || 0);
      const kpiEarnedUsd =
        Number(r.sales_bonus_amount || 0) +
        Number(r.kpi_bonus_amount || 0) +
        Number(r.additional_bonus_amount || 0);
      const dateStr = r.created_at
        ? new Date(r.created_at).toISOString().split('T')[0]
        : '';

      const cKpi = await this.convertAmount(kpiEarnedUsd, targetCurrency);
      const cSales = await this.convertAmount(totalSalesUsd, targetCurrency);

      historyItems.push({
        id: r.id,
        employee_id: r.employee_id,
        employee_name: empName,
        department_name: r.department_name || 'Sales Department',
        source_type: KpiSourceType.SALES,
        source_id: r.id,
        date: dateStr,
        month: r.month,
        kpi_amount: cKpi.amount,
        margin_amount: cSales.amount,
        currency: cKpi.currency,
        description: `Sales Manager Evaluation (${r.month}, Level: ${r.career_level}): Sales $${totalSalesUsd}, Sales Bonus $${r.sales_bonus_amount}, KPI Bonus $${r.kpi_bonus_amount}`,
        details: {
          career_level: r.career_level,
          fixed_salary: Number(r.fixed_salary),
          total_sales: totalSalesUsd,
          deal_count: r.deal_count,
          average_check: Number(r.average_check),
          sales_bonus_amount: Number(r.sales_bonus_amount),
          kpi_bonus_amount: Number(r.kpi_bonus_amount),
          additional_bonus_amount: Number(r.additional_bonus_amount),
          total_earnings: Number(r.total_earnings),
          approval_status: r.approval_status,
        },
      });
    }

    // 5. Process Cargo Transactions
    for (const r of txRes) {
      const empName = `${r.first_name} ${r.last_name}`.trim();
      const marginUsd = Number(r.margin || 0);
      const kpiBonusUsd = Number(r.kpi_bonus || 0);
      const dateStr = r.transaction_date
        ? new Date(r.transaction_date).toISOString().split('T')[0]
        : '';
      const monthStr = dateStr ? dateStr.substring(0, 7) : '';

      const cKpi = await this.convertAmount(kpiBonusUsd, targetCurrency);
      const cMargin = await this.convertAmount(marginUsd, targetCurrency);

      historyItems.push({
        id: r.id,
        employee_id: r.employee_id,
        employee_name: empName,
        department_name: r.department_name || 'Cargo Department',
        source_type: KpiSourceType.TRANSACTION,
        source_id: r.id,
        date: dateStr,
        month: monthStr,
        kpi_amount: cKpi.amount,
        margin_amount: cMargin.amount,
        currency: cKpi.currency,
        description: `Cargo Transaction for Client "${r.client_name || 'N/A'}" (${r.department_name}): Margin $${marginUsd} x ${r.kpi_percentage}% Dept Bonus`,
        details: {
          client_name: r.client_name,
          buy_price: Number(r.buy_price),
          sell_price: Number(r.sell_price),
          margin: marginUsd,
          kpi_percentage: Number(r.kpi_percentage),
          description: r.description,
        },
      });
    }

    // Apply Search Filter if provided
    let filteredItems = historyItems;
    if (query.search) {
      const s = query.search.toLowerCase();
      filteredItems = historyItems.filter(
        (item) =>
          item.employee_name.toLowerCase().includes(s) ||
          item.description.toLowerCase().includes(s) ||
          (item.department_name &&
            item.department_name.toLowerCase().includes(s)),
      );
    }

    // Sort Items
    const sortBy = query.sort_by || 'date';
    const isAsc = query.order === SortOrder.ASC;

    filteredItems.sort((a, b) => {
      const recA = a as unknown as Record<string, unknown>;
      const recB = b as unknown as Record<string, unknown>;
      const rawA = recA[sortBy];
      const rawB = recB[sortBy];

      if (typeof rawA === 'string') {
        const strA = rawA.toLowerCase();
        const strB = typeof rawB === 'string' ? rawB.toLowerCase() : '';
        return isAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
      }

      const numA = Number(rawA || 0);
      const numB = Number(rawB || 0);
      return isAsc ? numA - numB : numB - numA;
    });

    // Summary calculations for history meta
    const totalKpiAmount = filteredItems.reduce(
      (sum, item) => sum + item.kpi_amount,
      0,
    );
    const totalMarginAmount = filteredItems.reduce(
      (sum, item) => sum + item.margin_amount,
      0,
    );

    const countBySource = {
      [KpiSourceType.LTL]: filteredItems.filter(
        (i) => i.source_type === KpiSourceType.LTL,
      ).length,
      [KpiSourceType.FTL]: filteredItems.filter(
        (i) => i.source_type === KpiSourceType.FTL,
      ).length,
      [KpiSourceType.ROP]: filteredItems.filter(
        (i) => i.source_type === KpiSourceType.ROP,
      ).length,
      [KpiSourceType.SALES]: filteredItems.filter(
        (i) => i.source_type === KpiSourceType.SALES,
      ).length,
      [KpiSourceType.TRANSACTION]: filteredItems.filter(
        (i) => i.source_type === KpiSourceType.TRANSACTION,
      ).length,
    };

    // Paginate
    const page = query.page || 1;
    const limit = query.limit || 20;
    const totalCount = filteredItems.length;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const offset = (page - 1) * limit;

    const paginatedData = filteredItems.slice(offset, offset + limit);

    return {
      meta: {
        total: totalCount,
        page,
        limit,
        totalPages,
        currency: targetCurrency,
        filters: {
          month: query.month || 'all',
          employee_id: query.employee_id || null,
          source_type: query.source_type || null,
        },
        summary: {
          total_kpi_amount: this.round2(totalKpiAmount),
          total_margin_amount: this.round2(totalMarginAmount),
          count_by_source: countBySource,
        },
      },
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages,
      },
      data: paginatedData,
    };
  }

  // ==========================================
  // 3. SINGLE EMPLOYEE BREAKDOWN
  // ==========================================

  async getEmployeeKpiBreakdown(employeeId: string, month?: string) {
    const summary = await this.getKpiSummary({
      employee_id: employeeId,
      month: month || 'all',
      limit: 100,
    });

    const history = await this.getKpiHistory({
      employee_id: employeeId,
      month: month || 'all',
      limit: 100,
    });

    return {
      summary: summary.data[0] || null,
      history: history.data,
      meta: history.meta,
    };
  }
}
