import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { CreateExpenseDto, ExpenseCategory } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpenseDto } from './dto/query-expense.dto';
import {
  UpdateEmployeeSalaryDto,
  BatchUpdateSalariesDto,
} from './dto/update-salary.dto';
import { QueryFinanceSummaryDto } from './dto/query-finance-summary.dto';
import { CurrencyService } from '../currency/currency.service';
import { Currency } from '../currency/currency.types';

@Injectable()
export class FinanceService {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    @Optional() private readonly currencyService?: CurrencyService,
  ) {}

  // ==========================================
  // 1. EXPENSES CRUD & CATEGORIES
  // ==========================================

  async createExpense(dto: CreateExpenseDto) {
    if (dto.category === ExpenseCategory.SALARY_PAYOUT) {
      if (!dto.employee_id) {
        throw new BadRequestException({
          message: 'employee_id is required when category is salary_payout',
          location: 'employee_id_required',
        });
      }
    }

    if (dto.employee_id) {
      const employee = await this.knex('employees')
        .where({ id: dto.employee_id })
        .first();
      if (!employee) {
        throw new NotFoundException({
          message: 'Employee not found',
          location: 'employee_not_found',
        });
      }
    }

    const expenseCurrency = dto.currency || Currency.UZS;
    const [expense] = await this.knex('expenses')
      .insert({
        category: dto.category,
        amount: dto.amount,
        currency: expenseCurrency,
        employee_id: dto.employee_id || null,
        description: dto.description || null,
        expense_date: dto.expense_date,
      })
      .returning('*');

    return this.formatExpense(expense);
  }

  async findAllExpenses(query: QueryExpenseDto) {
    const page = query.page ? Math.max(1, query.page) : 1;
    const limit = query.limit ? Math.min(100, Math.max(1, query.limit)) : 20;
    const offset = (page - 1) * limit;

    const sortBy = query.sort_by || 'expense_date';
    const order = (query.order || 'desc').toLowerCase();

    const baseQuery = this.knex('expenses');

    if (query.category) {
      baseQuery.where('category', query.category);
    }
    if (query.employee_id) {
      baseQuery.where('employee_id', query.employee_id);
    }
    if (query.start_date) {
      baseQuery.where('expense_date', '>=', query.start_date);
    }
    if (query.end_date) {
      baseQuery.where('expense_date', '<=', query.end_date);
    }
    if (query.search) {
      baseQuery.where('description', 'ilike', `%${query.search.trim()}%`);
    }

    // Clone for count and sum totals
    const countQuery = baseQuery.clone().count('id as total');

    const [{ total }] = await countQuery;

    const totalCount = parseInt(total as string, 10) || 0;
    const totalPages = Math.ceil(totalCount / limit) || 1;

    // Fetch all matching expenses to calculate total sum in UZS
    const expensesForSum = await baseQuery.clone().select('amount', 'currency');
    const rates = this.currencyService
      ? await this.currencyService.getLatestRates()
      : undefined;

    let totalSumInUzs = 0;
    for (const row of expensesForSum) {
      const rawAmt = parseFloat(row.amount as string) || 0;
      const curr = (row.currency as Currency) || Currency.UZS;
      let amtInUzs = rawAmt;
      if (curr !== Currency.UZS && this.currencyService) {
        amtInUzs = await this.currencyService.convertToUzs(rawAmt, curr, rates);
      }
      totalSumInUzs += amtInUzs;
    }
    const totalSum = Math.round(totalSumInUzs * 100) / 100;

    const rows = await baseQuery
      .orderBy(sortBy, order)
      .limit(limit)
      .offset(offset);

    const data = rows.map((r) => this.formatExpense(r));

    return {
      data,
      total_sum: totalSum,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages,
      },
    };
  }

  async findExpenseById(id: string) {
    const expense = await this.knex('expenses').where({ id }).first();
    if (!expense) {
      throw new NotFoundException({
        message: 'Expense not found',
        location: 'expense_not_found',
      });
    }
    return this.formatExpense(expense);
  }

  async updateExpense(id: string, dto: UpdateExpenseDto) {
    const expense = await this.knex('expenses').where({ id }).first();
    if (!expense) {
      throw new NotFoundException({
        message: 'Expense not found',
        location: 'expense_not_found',
      });
    }

    const targetCategory =
      dto.category !== undefined ? dto.category : expense.category;
    const targetEmployeeId =
      dto.employee_id !== undefined ? dto.employee_id : expense.employee_id;

    if (targetCategory === ExpenseCategory.SALARY_PAYOUT) {
      if (!targetEmployeeId) {
        throw new BadRequestException({
          message: 'employee_id is required when category is salary_payout',
          location: 'employee_id_required',
        });
      }
    }

    if (dto.employee_id !== undefined && dto.employee_id !== null) {
      const employee = await this.knex('employees')
        .where({ id: dto.employee_id })
        .first();
      if (!employee) {
        throw new NotFoundException({
          message: 'Employee not found',
          location: 'employee_not_found',
        });
      }
    } else if (
      targetCategory === ExpenseCategory.SALARY_PAYOUT &&
      targetEmployeeId
    ) {
      const employee = await this.knex('employees')
        .where({ id: targetEmployeeId })
        .first();
      if (!employee) {
        throw new NotFoundException({
          message: 'Employee not found',
          location: 'employee_not_found',
        });
      }
    }

    const updatePayload: Record<string, any> = {
      updated_at: this.knex.fn.now(),
    };

    if (dto.category !== undefined) updatePayload.category = dto.category;
    if (dto.amount !== undefined) updatePayload.amount = dto.amount;
    if (dto.currency !== undefined) updatePayload.currency = dto.currency;
    if (dto.employee_id !== undefined)
      updatePayload.employee_id = dto.employee_id;
    if (dto.description !== undefined)
      updatePayload.description = dto.description;
    if (dto.expense_date !== undefined)
      updatePayload.expense_date = dto.expense_date;

    await this.knex('expenses').where({ id }).update(updatePayload);
    return this.findExpenseById(id);
  }

  async deleteExpense(id: string) {
    const count = await this.knex('expenses').where({ id }).delete();
    if (!count) {
      throw new NotFoundException({
        message: 'Expense not found',
        location: 'expense_not_found',
      });
    }
    return {
      message: 'Expense deleted successfully',
    };
  }

  async getExpenseCategories(
    period?: string,
    start_date?: string,
    end_date?: string,
  ) {
    let startDate: string | undefined = start_date;
    let endDate: string | undefined = end_date;

    if (!startDate && !endDate) {
      if (period) {
        const parts = period.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const lastDay = new Date(year, month, 0).getDate();
        startDate = `${period}-01`;
        endDate = `${period}-${String(lastDay).padStart(2, '0')}`;
      } else {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
        startDate = `${year}-${month}-01`;
        endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
      }
    }

    const query = this.knex('expenses')
      .select('category', 'currency')
      .sum('amount as total')
      .count('id as count')
      .groupBy('category', 'currency');

    if (startDate) query.where('expense_date', '>=', startDate);
    if (endDate) query.where('expense_date', '<=', endDate);

    const rows = await query;

    const categoryMap: Record<string, { total: number; count: number }> = {};
    const rates = this.currencyService
      ? await this.currencyService.getLatestRates()
      : undefined;

    for (const r of rows) {
      const rawAmt = parseFloat(r.total as string) || 0;
      const curr = (r.currency as Currency) || Currency.UZS;
      let amtInUzs = rawAmt;
      if (curr !== Currency.UZS && this.currencyService) {
        amtInUzs = await this.currencyService.convertToUzs(rawAmt, curr, rates);
      }

      if (!categoryMap[r.category]) {
        categoryMap[r.category] = { total: 0, count: 0 };
      }
      categoryMap[r.category].total += amtInUzs;
      categoryMap[r.category].count += parseInt(r.count as string, 10) || 0;
    }

    const categoriesConfig: Array<{
      category: ExpenseCategory;
      label: string;
      description: string;
    }> = [
      {
        category: ExpenseCategory.TAX,
        label: 'Taxes (Nalog)',
        description: 'Government taxes, tax transfers, official fees',
      },
      {
        category: ExpenseCategory.UTILITY,
        label: 'Utilities (Svet/Kommunal)',
        description: 'Electricity, internet, water, office utilities',
      },
      {
        category: ExpenseCategory.RENT,
        label: 'Rent (Arenda)',
        description: 'Office space rent, warehouse rent',
      },
      {
        category: ExpenseCategory.SALARY_PAYOUT,
        label: 'Salary Payouts (Maosh)',
        description: 'Manual cash or card salary payouts to staff',
      },
      {
        category: ExpenseCategory.CLEANER,
        label: 'Cleaning (Uborshchitsa)',
        description: 'Cleaning services, office supplies',
      },
      {
        category: ExpenseCategory.OTHER,
        label: 'Other Expenses (Prochiy)',
        description: 'Miscellaneous operational expenses',
      },
    ];

    const result = categoriesConfig.map((cat) => {
      const data = categoryMap[cat.category] || { total: 0, count: 0 };
      return {
        category: cat.category,
        label: cat.label,
        description: cat.description,
        total_amount: Math.round(data.total * 100) / 100,
        expense_count: data.count,
      };
    });

    const grandTotal = result.reduce((sum, item) => sum + item.total_amount, 0);

    return {
      period_start: startDate || null,
      period_end: endDate || null,
      base_currency: Currency.UZS,
      grand_total: Math.round(grandTotal * 100) / 100,
      categories: result,
    };
  }

  // ==========================================
  // 2. FIXED SALARY MANAGEMENT PER DEPARTMENT
  // ==========================================

  async getEmployeeSalaries(departmentId?: string) {
    let query = this.knex('employees')
      .join('departments', 'employees.department_id', 'departments.id')
      .select(
        'employees.id',
        'employees.first_name',
        'employees.last_name',
        'employees.phone',
        'employees.department_id',
        'departments.name as department_name',
        'employees.fixed_salary',
        'employees.currency',
        'employees.is_active',
        'employees.color',
      );

    if (departmentId) {
      query = query.where('employees.department_id', departmentId);
    }

    const employees = await query
      .orderBy('departments.name', 'asc')
      .orderBy('employees.first_name', 'asc');

    const formattedEmployees = employees.map((emp) => ({
      id: emp.id,
      full_name: `${emp.first_name} ${emp.last_name}`,
      first_name: emp.first_name,
      last_name: emp.last_name,
      phone: emp.phone,
      department_id: emp.department_id,
      department_name: emp.department_name,
      fixed_salary: Number(emp.fixed_salary),
      currency: emp.currency || Currency.UZS,
      is_active: Boolean(emp.is_active),
      color: emp.color,
    }));

    // Fetch latest rates for conversion
    const rates = this.currencyService
      ? await this.currencyService.getLatestRates()
      : undefined;

    // Group by department
    const departmentMap: Record<
      string,
      {
        department_id: string;
        department_name: string;
        employee_count: number;
        total_fixed_salary: number;
        employees: typeof formattedEmployees;
      }
    > = {};

    let totalCompanyMonthlySalaries = 0;

    for (const emp of formattedEmployees) {
      if (!departmentMap[emp.department_id]) {
        departmentMap[emp.department_id] = {
          department_id: emp.department_id,
          department_name: emp.department_name,
          employee_count: 0,
          total_fixed_salary: 0,
          employees: [],
        };
      }
      const group = departmentMap[emp.department_id];
      group.employee_count += 1;

      let salInUzs = emp.fixed_salary;
      if (emp.is_active) {
        if (emp.currency !== Currency.UZS && this.currencyService) {
          salInUzs = await this.currencyService.convertToUzs(
            emp.fixed_salary,
            emp.currency as Currency,
            rates,
          );
        }
        group.total_fixed_salary += salInUzs;
        totalCompanyMonthlySalaries += salInUzs;
      }
      group.employees.push(emp);
    }

    const departmentsList = Object.values(departmentMap).map((d) => ({
      ...d,
      total_fixed_salary: Math.round(d.total_fixed_salary * 100) / 100,
    }));

    return {
      total_employees: formattedEmployees.length,
      total_active_employees: formattedEmployees.filter((e) => e.is_active)
        .length,
      currency: Currency.UZS,
      total_monthly_salaries:
        Math.round(totalCompanyMonthlySalaries * 100) / 100,
      departments: departmentsList,
    };
  }

  async updateEmployeeSalary(dto: UpdateEmployeeSalaryDto) {
    const employee = await this.knex('employees')
      .where({ id: dto.employee_id })
      .first();
    if (!employee) {
      throw new NotFoundException({
        message: 'Employee not found',
        location: 'employee_not_found',
      });
    }

    const updatePayload: any = {
      fixed_salary: dto.fixed_salary,
      updated_at: this.knex.fn.now(),
    };
    if (dto.currency !== undefined) {
      updatePayload.currency = dto.currency;
    }

    await this.knex('employees')
      .where({ id: dto.employee_id })
      .update(updatePayload);

    const updated = await this.knex('employees')
      .join('departments', 'employees.department_id', 'departments.id')
      .select('employees.*', 'departments.name as department_name')
      .where('employees.id', dto.employee_id)
      .first();

    return {
      id: updated.id,
      full_name: `${updated.first_name} ${updated.last_name}`,
      department_id: updated.department_id,
      department_name: updated.department_name,
      fixed_salary: Number(updated.fixed_salary),
      currency: updated.currency || Currency.UZS,
      is_active: Boolean(updated.is_active),
    };
  }

  async batchUpdateEmployeeSalaries(dto: BatchUpdateSalariesDto) {
    if (!dto.salaries || dto.salaries.length === 0) {
      throw new BadRequestException('Salaries array cannot be empty');
    }

    const employeeIds = dto.salaries.map((s) => s.employee_id);
    const existingEmps = await this.knex('employees')
      .whereIn('id', employeeIds)
      .select('id');
    const existingIds = new Set(existingEmps.map((e) => e.id));

    const missingIds = employeeIds.filter((id) => !existingIds.has(id));
    if (missingIds.length > 0) {
      throw new NotFoundException({
        message: `Employees with IDs [${missingIds.join(', ')}] not found`,
        location: 'employee_not_found',
      });
    }

    await this.knex.transaction(async (trx) => {
      for (const item of dto.salaries) {
        const updatePayload: any = {
          fixed_salary: item.fixed_salary,
          updated_at: trx.fn.now(),
        };
        if (item.currency !== undefined) {
          updatePayload.currency = item.currency;
        }
        await trx('employees')
          .where({ id: item.employee_id })
          .update(updatePayload);
      }
    });

    return this.getEmployeeSalaries();
  }

  // ==========================================
  // 3. FINANCIAL SUMMARY & NET PROFIT ENGINE
  // ==========================================

  async getFinanceSummary(query: QueryFinanceSummaryDto) {
    const { startDate, endDate } = this.resolvePeriodDates(query);
    const targetCurrency = query.currency || Currency.UZS;

    const startObj = new Date(startDate);
    const endObj = new Date(endDate);

    const diffTime = Math.abs(endObj.getTime() - startObj.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const prevEndObj = new Date(startObj);
    prevEndObj.setDate(prevEndObj.getDate() - 1);

    const prevStartObj = new Date(prevEndObj);
    prevStartObj.setDate(prevStartObj.getDate() - diffDays + 1);

    const prevStartDate = prevStartObj.toISOString().slice(0, 10);
    const prevEndDate = prevEndObj.toISOString().slice(0, 10);

    // Current period metrics (normalized in UZS)
    const currentMetrics = await this.computeMetricsForPeriod(
      startDate,
      endDate,
    );
    // Previous period metrics (normalized in UZS)
    const prevMetrics = await this.computeMetricsForPeriod(
      prevStartDate,
      prevEndDate,
    );

    // Convert metrics if target currency is not UZS
    let summaryData = currentMetrics;
    let prevSummaryData = prevMetrics;

    if (targetCurrency !== Currency.UZS && this.currencyService) {
      summaryData = await this.convertMetricsToCurrency(
        currentMetrics,
        targetCurrency,
      );
      prevSummaryData = await this.convertMetricsToCurrency(
        prevMetrics,
        targetCurrency,
      );
    }

    const netProfitChange = summaryData.net_profit - prevSummaryData.net_profit;
    let netProfitGrowthPercentage = 0;
    if (prevSummaryData.net_profit !== 0) {
      netProfitGrowthPercentage =
        Math.round(
          (netProfitChange / Math.abs(prevSummaryData.net_profit)) * 10000,
        ) / 100;
    } else if (summaryData.net_profit > 0) {
      netProfitGrowthPercentage = 100;
    }

    const expensesChange =
      summaryData.total_expenses - prevSummaryData.total_expenses;
    let expensesChangePercentage = 0;
    if (prevSummaryData.total_expenses !== 0) {
      expensesChangePercentage =
        Math.round(
          (expensesChange / Math.abs(prevSummaryData.total_expenses)) * 10000,
        ) / 100;
    } else if (summaryData.total_expenses > 0) {
      expensesChangePercentage = 100;
    }

    return {
      currency: targetCurrency,
      period: {
        start_date: startDate,
        end_date: endDate,
      },
      summary: {
        gross_revenue: summaryData.gross_revenue,
        cost_of_goods_sold: summaryData.cost_of_goods_sold,
        gross_profit: summaryData.gross_profit,
        operational_expenses: summaryData.operational_expenses,
        fixed_salaries_expense: summaryData.fixed_salaries_expense,
        kpi_bonuses_expense: summaryData.kpi_bonuses_expense,
        total_payroll_expense: summaryData.total_payroll_expense,
        total_expenses: summaryData.total_expenses,
        net_profit: summaryData.net_profit,
        seo_cut_10pc: summaryData.seo_cut_10pc,
      },
      expense_breakdown: summaryData.expense_breakdown,
      comparison: {
        previous_period: {
          start_date: prevStartDate,
          end_date: prevEndDate,
          gross_profit: prevSummaryData.gross_profit,
          total_expenses: prevSummaryData.total_expenses,
          net_profit: prevSummaryData.net_profit,
        },
        net_profit_change_amount: Math.round(netProfitChange * 100) / 100,
        net_profit_growth_percentage: netProfitGrowthPercentage,
        expenses_change_amount: Math.round(expensesChange * 100) / 100,
        expenses_change_percentage: expensesChangePercentage,
      },
    };
  }

  // Helper: compute metrics for any date range in base currency (UZS)
  private async computeMetricsForPeriod(startDate: string, endDate: string) {
    const rates = this.currencyService
      ? await this.currencyService.getLatestRates()
      : undefined;

    // 1. Cargo transactions
    const cargoRows = await this.knex('cargo_transactions')
      .select('sell_price', 'buy_price', 'margin', 'kpi_bonus', 'currency')
      .where('transaction_date', '>=', startDate)
      .where('transaction_date', '<=', endDate);

    let grossRevenue = 0;
    let cogs = 0;
    let cargoMargin = 0;
    let cargoKpiBonuses = 0;

    for (const tx of cargoRows) {
      const curr = (tx.currency as Currency) || Currency.UZS;
      const sp = parseFloat(tx.sell_price as string) || 0;
      const bp = parseFloat(tx.buy_price as string) || 0;
      const mg = parseFloat(tx.margin as string) || 0;
      const kb = parseFloat(tx.kpi_bonus as string) || 0;

      if (curr === Currency.UZS || !this.currencyService) {
        grossRevenue += sp;
        cogs += bp;
        cargoMargin += mg;
        cargoKpiBonuses += kb;
      } else {
        grossRevenue += await this.currencyService.convertToUzs(
          sp,
          curr,
          rates,
        );
        cogs += await this.currencyService.convertToUzs(bp, curr, rates);
        cargoMargin += await this.currencyService.convertToUzs(mg, curr, rates);
        cargoKpiBonuses += await this.currencyService.convertToUzs(
          kb,
          curr,
          rates,
        );
      }
    }

    grossRevenue = Math.round(grossRevenue * 100) / 100;
    cogs = Math.round(cogs * 100) / 100;
    cargoMargin = Math.round(cargoMargin * 100) / 100;
    cargoKpiBonuses = Math.round(cargoKpiBonuses * 100) / 100;

    // 2. Operational expenses from expenses table
    const expenseRows = await this.knex('expenses')
      .select('category', 'amount', 'currency')
      .where('expense_date', '>=', startDate)
      .where('expense_date', '<=', endDate);

    const expenseCategoryMap: Record<string, number> = {};
    let totalOpExpenses = 0;

    for (const row of expenseRows) {
      const rawAmt = parseFloat(row.amount as string) || 0;
      const curr = (row.currency as Currency) || Currency.UZS;
      let amtInUzs = rawAmt;
      if (curr !== Currency.UZS && this.currencyService) {
        amtInUzs = await this.currencyService.convertToUzs(rawAmt, curr, rates);
      }

      amtInUzs = Math.round(amtInUzs * 100) / 100;
      expenseCategoryMap[row.category] =
        (expenseCategoryMap[row.category] || 0) + amtInUzs;
      totalOpExpenses += amtInUzs;
    }

    totalOpExpenses = Math.round(totalOpExpenses * 100) / 100;

    // 3. Active employees fixed salaries (converted to UZS)
    const activeEmps = await this.knex('employees')
      .where('is_active', true)
      .select('fixed_salary', 'currency');

    let totalFixedSalaries = 0;
    for (const emp of activeEmps) {
      const rawAmt = parseFloat(emp.fixed_salary as string) || 0;
      const curr = (emp.currency as Currency) || Currency.UZS;
      let amtInUzs = rawAmt;
      if (curr !== Currency.UZS && this.currencyService) {
        amtInUzs = await this.currencyService.convertToUzs(rawAmt, curr, rates);
      }
      totalFixedSalaries += amtInUzs;
    }
    totalFixedSalaries = Math.round(totalFixedSalaries * 100) / 100;

    const totalPayroll =
      Math.round((totalFixedSalaries + cargoKpiBonuses) * 100) / 100;
    const totalExpenses =
      Math.round((totalOpExpenses + totalPayroll) * 100) / 100;

    const grossProfit = cargoMargin;
    const netProfit = Math.round((grossProfit - totalExpenses) * 100) / 100;
    const seoCut = netProfit > 0 ? Math.round(netProfit * 0.1 * 100) / 100 : 0;

    return {
      gross_revenue: grossRevenue,
      cost_of_goods_sold: cogs,
      gross_profit: grossProfit,
      operational_expenses: totalOpExpenses,
      fixed_salaries_expense: totalFixedSalaries,
      kpi_bonuses_expense: cargoKpiBonuses,
      total_payroll_expense: totalPayroll,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      seo_cut_10pc: seoCut,
      expense_breakdown: expenseCategoryMap,
    };
  }

  private async convertMetricsToCurrency(
    metrics: any,
    targetCurrency: Currency,
  ) {
    if (!this.currencyService) return metrics;
    const currencySvc = this.currencyService;

    const convertValue = async (val: number) => {
      const res = await currencySvc.convert(val, Currency.UZS, targetCurrency);
      return res.converted_amount;
    };

    const convertedBreakdown: Record<string, number> = {};
    for (const [cat, amt] of Object.entries(metrics.expense_breakdown || {})) {
      convertedBreakdown[cat] = await convertValue(amt as number);
    }

    return {
      gross_revenue: await convertValue(metrics.gross_revenue),
      cost_of_goods_sold: await convertValue(metrics.cost_of_goods_sold),
      gross_profit: await convertValue(metrics.gross_profit),
      operational_expenses: await convertValue(metrics.operational_expenses),
      fixed_salaries_expense: await convertValue(
        metrics.fixed_salaries_expense,
      ),
      kpi_bonuses_expense: await convertValue(metrics.kpi_bonuses_expense),
      total_payroll_expense: await convertValue(metrics.total_payroll_expense),
      total_expenses: await convertValue(metrics.total_expenses),
      net_profit: await convertValue(metrics.net_profit),
      seo_cut_10pc: await convertValue(metrics.seo_cut_10pc),
      expense_breakdown: convertedBreakdown,
    };
  }

  private resolvePeriodDates(query: QueryFinanceSummaryDto) {
    let startDate: string;
    let endDate: string;

    if (query.start_date && query.end_date) {
      startDate = query.start_date;
      endDate = query.end_date;
    } else if (query.period) {
      const parts = query.period.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const lastDay = new Date(year, month, 0).getDate();
      startDate = `${query.period}-01`;
      endDate = `${query.period}-${String(lastDay).padStart(2, '0')}`;
    } else {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      startDate = `${year}-${month}-01`;
      endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    }

    return { startDate, endDate };
  }

  private formatExpense(row: any) {
    return {
      id: row.id,
      category: row.category,
      amount: Number(row.amount),
      currency: row.currency || Currency.UZS,
      employee_id: row.employee_id || null,
      description: row.description,
      expense_date: this.formatExpenseDate(row.expense_date),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private formatExpenseDate(val: any): string {
    if (!val) return val;
    if (val instanceof Date) {
      const year = val.getFullYear();
      const month = String(val.getMonth() + 1).padStart(2, '0');
      const day = String(val.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return String(val).slice(0, 10);
  }
}
