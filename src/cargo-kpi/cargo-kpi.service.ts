import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Optional,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { CurrencyService } from '../currency/currency.service';
import { Currency } from '../currency/currency.types';
import {
  LtlCalcDto,
  CreateLtlItemDto,
  UpdateLtlItemDto,
  CargoType,
} from './dto/ltl-item.dto';
import { CreateFtlItemDto, UpdateFtlItemDto } from './dto/ftl-item.dto';
import {
  CreateRopWorkerDto,
  CreateRopTruckDto,
  SeoCalcDto,
} from './dto/rop-seo.dto';
import {
  CreateEmployeePlanDto,
  UpdateEmployeePlanDto,
  QueryEmployeePlanDto,
  CreateCargoTransactionDto,
  UpdateCargoTransactionDto,
  QueryCargoTransactionDto,
} from './dto/plans-transactions.dto';

@Injectable()
export class CargoKpiService {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    @Optional() private readonly currencyService?: CurrencyService,
  ) {}

  // ==========================================
  // 1. LTL CALCULATOR & LOGIC
  // ==========================================

  calculateLtlPrice(dto: LtlCalcDto) {
    const { volume, weight } = dto;
    if (volume <= 0 || weight <= 0) {
      throw new BadRequestException(
        'Volume and weight must be positive numbers',
      );
    }

    const density = weight / volume;
    let basis: 'vazn' | 'hajm';
    let rate: number;
    let unit: 'USD/kg' | 'USD/m3';
    let totalPrice: number;

    if (density > 1000) {
      basis = 'vazn';
      rate = 0.3;
      unit = 'USD/kg';
      totalPrice = weight * 0.3;
    } else if (density > 700) {
      basis = 'vazn';
      rate = 0.4;
      unit = 'USD/kg';
      totalPrice = weight * 0.4;
    } else if (density <= 100) {
      basis = 'hajm';
      rate = 100;
      unit = 'USD/m3';
      totalPrice = volume * 100;
    } else if (density <= 200) {
      basis = 'hajm';
      rate = 110;
      unit = 'USD/m3';
      totalPrice = volume * 110;
    } else if (density <= 300) {
      basis = 'hajm';
      rate = 130;
      unit = 'USD/m3';
      totalPrice = volume * 130;
    } else if (density <= 400) {
      basis = 'hajm';
      rate = 140;
      unit = 'USD/m3';
      totalPrice = volume * 140;
    } else if (density <= 500) {
      basis = 'hajm';
      rate = 160;
      unit = 'USD/m3';
      totalPrice = volume * 160;
    } else {
      // 500 < density <= 700
      basis = 'hajm';
      rate = 180;
      unit = 'USD/m3';
      totalPrice = volume * 180;
    }

    return {
      volume,
      weight,
      density: Math.round(density * 10000) / 10000,
      basis,
      rate,
      unit,
      total_price: Math.round(totalPrice * 1000) / 1000,
    };
  }

  // ==========================================
  // 2. LTL KPI MODULE
  // ==========================================

  private getLtlBaseRate(density: number, cargoType: CargoType): number {
    if (cargoType === CargoType.LYUSTRA) {
      return 3;
    }

    let oddiyRate: number;
    if (density <= 100) oddiyRate = 3;
    else if (density <= 200) oddiyRate = 4;
    else if (density <= 300) oddiyRate = 5;
    else if (density <= 400) oddiyRate = 6;
    else if (density <= 500) oddiyRate = 7;
    else if (density <= 700) oddiyRate = 8;
    else if (density <= 1000) oddiyRate = 9;
    else oddiyRate = 10;

    return cargoType === CargoType.POD_KLYUCH ? oddiyRate + 5 : oddiyRate;
  }

  private getLtlVolumeCoefficient(totalVolume: number): number {
    if (totalVolume < 21) return 0.0;
    if (totalVolume <= 40) return 0.5;
    if (totalVolume <= 60) return 0.8;
    if (totalVolume <= 74) return 0.9;
    if (totalVolume <= 80) return 1.0;
    return 1.2;
  }

  async createLtlItem(dto: CreateLtlItemDto) {
    const employee = await this.knex('employees')
      .where({ id: dto.employee_id })
      .first();
    if (!employee) {
      throw new NotFoundException({
        message: 'Employee not found',
        location: 'employee_not_found',
      });
    }

    await this.knex('ltl_cargo_items').insert({
      employee_id: dto.employee_id,
      volume: dto.volume,
      weight: dto.weight,
      cargo_type: dto.cargo_type,
    });

    return this.getLtlItemsSummary();
  }

  async updateLtlItem(id: string, dto: UpdateLtlItemDto) {
    const existing = await this.knex('ltl_cargo_items').where({ id }).first();
    if (!existing) {
      throw new NotFoundException({
        message: 'LTL Cargo item not found',
        location: 'ltl_item_not_found',
      });
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

    const updatePayload: Record<string, any> = {
      updated_at: this.knex.fn.now(),
    };
    if (dto.employee_id !== undefined)
      updatePayload.employee_id = dto.employee_id;
    if (dto.volume !== undefined) updatePayload.volume = dto.volume;
    if (dto.weight !== undefined) updatePayload.weight = dto.weight;
    if (dto.cargo_type !== undefined) updatePayload.cargo_type = dto.cargo_type;

    await this.knex('ltl_cargo_items').where({ id }).update(updatePayload);
    return this.getLtlItemsSummary();
  }

  async deleteLtlItem(id: string) {
    const count = await this.knex('ltl_cargo_items').where({ id }).delete();
    if (!count) {
      throw new NotFoundException({
        message: 'LTL Cargo item not found',
        location: 'ltl_item_not_found',
      });
    }
    return this.getLtlItemsSummary();
  }

  async clearLtlItems() {
    await this.knex('ltl_cargo_items').truncate();
    return this.getLtlItemsSummary();
  }

  async getLtlItemsSummary() {
    const rows = await this.knex('ltl_cargo_items')
      .join('employees', 'ltl_cargo_items.employee_id', 'employees.id')
      .select(
        'ltl_cargo_items.*',
        'employees.first_name',
        'employees.last_name',
      )
      .orderBy('ltl_cargo_items.created_at', 'asc');

    const employeeGroups: Record<
      string,
      { employee_id: string; employee_name: string; items: any[] }
    > = {};
    for (const r of rows) {
      const empId = r.employee_id;
      const empName = `${r.first_name} ${r.last_name}`;
      if (!employeeGroups[empId]) {
        employeeGroups[empId] = {
          employee_id: empId,
          employee_name: empName,
          items: [],
        };
      }

      const v = Number(r.volume);
      const w = Number(r.weight);
      const density = v > 0 ? w / v : 0;
      const baseRate = this.getLtlBaseRate(density, r.cargo_type as CargoType);
      const baseKpi = v * baseRate;

      employeeGroups[empId].items.push({
        id: r.id,
        employee_id: r.employee_id,
        employee_name: empName,
        volume: v,
        weight: w,
        cargo_type: r.cargo_type,
        density: Math.round(density * 100) / 100,
        base_rate: baseRate,
        base_kpi: Math.round(baseKpi * 100) / 100,
        created_at: r.created_at,
      });
    }

    const employeeSummaries = Object.values(employeeGroups).map((group) => {
      const totalVolume = group.items.reduce(
        (sum, item) => sum + item.volume,
        0,
      );
      const totalWeight = group.items.reduce(
        (sum, item) => sum + item.weight,
        0,
      );
      const totalBaseKpi = group.items.reduce(
        (sum, item) => sum + item.base_kpi,
        0,
      );
      const coeff = this.getLtlVolumeCoefficient(totalVolume);
      const finalKpi = totalBaseKpi * coeff;

      return {
        employee_id: group.employee_id,
        employee_name: group.employee_name,
        total_volume: Math.round(totalVolume * 100) / 100,
        total_weight: Math.round(totalWeight * 100) / 100,
        total_base_kpi: Math.round(totalBaseKpi * 100) / 100,
        volume_coefficient: coeff,
        volume_coefficient_percentage: `${Math.round(coeff * 100)}%`,
        final_ltl_kpi: Math.round(finalKpi * 100) / 100,
        items: group.items,
      };
    });

    return {
      total_items: rows.length,
      employees: employeeSummaries,
    };
  }

  // ==========================================
  // 3. FTL KPI MODULE
  // ==========================================

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

  async createFtlItem(dto: CreateFtlItemDto) {
    const employee = await this.knex('employees')
      .where({ id: dto.manager_id })
      .first();
    if (!employee) {
      throw new NotFoundException({
        message: 'Employee manager not found',
        location: 'employee_not_found',
      });
    }

    const qty = dto.qty || 1;
    const profit = dto.sell_price - dto.agent_price;

    const insertRows = [];
    for (let i = 0; i < qty; i++) {
      insertRows.push({
        manager_id: dto.manager_id,
        month: dto.month,
        agent_price: dto.agent_price,
        sell_price: dto.sell_price,
        profit,
        planned_days: dto.planned_days,
        actual_days: dto.actual_days,
        kpi_received: dto.kpi_received || false,
      });
    }

    await this.knex('ftl_fura_items').insert(insertRows);
    return this.getFtlSummary(dto.manager_id, dto.month);
  }

  async updateFtlItem(id: string, dto: UpdateFtlItemDto) {
    const item = await this.knex('ftl_fura_items').where({ id }).first();
    if (!item) {
      throw new NotFoundException({
        message: 'FTL Fura item not found',
        location: 'ftl_item_not_found',
      });
    }

    if (dto.manager_id) {
      const employee = await this.knex('employees')
        .where({ id: dto.manager_id })
        .first();
      if (!employee) {
        throw new NotFoundException({
          message: 'Employee manager not found',
          location: 'employee_not_found',
        });
      }
    }

    const ap =
      dto.agent_price !== undefined
        ? dto.agent_price
        : Number(item.agent_price);
    const sp =
      dto.sell_price !== undefined ? dto.sell_price : Number(item.sell_price);
    const profit = sp - ap;

    const updatePayload: Record<string, any> = {
      agent_price: ap,
      sell_price: sp,
      profit,
      updated_at: this.knex.fn.now(),
    };

    if (dto.manager_id !== undefined) updatePayload.manager_id = dto.manager_id;
    if (dto.month !== undefined) updatePayload.month = dto.month;
    if (dto.planned_days !== undefined)
      updatePayload.planned_days = dto.planned_days;
    if (dto.actual_days !== undefined)
      updatePayload.actual_days = dto.actual_days;
    if (dto.kpi_received !== undefined)
      updatePayload.kpi_received = dto.kpi_received;

    await this.knex('ftl_fura_items').where({ id }).update(updatePayload);

    const targetManagerId = dto.manager_id ? dto.manager_id : item.manager_id;
    const targetMonth = dto.month ? dto.month : item.month;
    return this.getFtlSummary(targetManagerId, targetMonth);
  }

  async copyFtlItem(id: string) {
    const item = await this.knex('ftl_fura_items').where({ id }).first();
    if (!item) {
      throw new NotFoundException({
        message: 'FTL Fura item not found',
        location: 'ftl_item_not_found',
      });
    }

    await this.knex('ftl_fura_items').insert({
      manager_id: item.manager_id,
      month: item.month,
      agent_price: item.agent_price,
      sell_price: item.sell_price,
      profit: item.profit,
      planned_days: item.planned_days,
      actual_days: item.actual_days,
      kpi_received: item.kpi_received,
    });

    return this.getFtlSummary(item.manager_id, item.month);
  }

  async toggleFtlKpiReceived(id: string) {
    const item = await this.knex('ftl_fura_items').where({ id }).first();
    if (!item) {
      throw new NotFoundException({
        message: 'FTL Fura item not found',
        location: 'ftl_item_not_found',
      });
    }

    const newStatus = !item.kpi_received;
    await this.knex('ftl_fura_items')
      .where({ id })
      .update({ kpi_received: newStatus, updated_at: this.knex.fn.now() });

    return this.getFtlSummary(item.manager_id, item.month);
  }

  async deleteFtlItem(id: string) {
    const item = await this.knex('ftl_fura_items').where({ id }).first();
    if (!item) {
      throw new NotFoundException({
        message: 'FTL Fura item not found',
        location: 'ftl_item_not_found',
      });
    }

    await this.knex('ftl_fura_items').where({ id }).delete();
    return this.getFtlSummary(item.manager_id, item.month);
  }

  async resetFtlData() {
    await this.knex('ftl_fura_items').truncate();
    return {
      message: 'FTL KPI data reset successfully.',
    };
  }

  private async convertFromUsd(
    amount: number,
    targetCurrency: Currency,
  ): Promise<number> {
    if (targetCurrency === Currency.USD || !this.currencyService) {
      return Math.round(amount * 100) / 100;
    }
    const res = await this.currencyService.convert(
      amount,
      Currency.USD,
      targetCurrency,
    );
    return res.converted_amount;
  }

  async getFtlSummary(managerId?: string, month?: string, currency?: Currency) {
    const targetCurrency = currency || Currency.UZS;

    let query = this.knex('ftl_fura_items')
      .join('employees', 'ftl_fura_items.manager_id', 'employees.id')
      .select(
        'ftl_fura_items.*',
        'employees.first_name',
        'employees.last_name',
      );

    if (managerId) {
      query = query.where('ftl_fura_items.manager_id', managerId);
    }
    if (month) {
      query = query.where('ftl_fura_items.month', month);
    }

    const items = await query.orderBy('ftl_fura_items.created_at', 'asc');

    // Group items by manager_id and month
    const managerMonthMap: Record<
      string,
      { manager_id: string; manager_name: string; month: string; items: any[] }
    > = {};
    for (const r of items) {
      const mgrName = `${r.first_name} ${r.last_name}`;
      const key = `${r.manager_id}__${r.month}`;
      if (!managerMonthMap[key]) {
        managerMonthMap[key] = {
          manager_id: r.manager_id,
          manager_name: mgrName,
          month: r.month,
          items: [],
        };
      }
      managerMonthMap[key].items.push(r);
    }

    const managerSummaries = [];
    for (const group of Object.values(managerMonthMap)) {
      const totalAgentPrice = group.items.reduce(
        (sum, item) => sum + Number(item.agent_price),
        0,
      );
      const totalSellPrice = group.items.reduce(
        (sum, item) => sum + Number(item.sell_price),
        0,
      );
      const totalProfit = totalSellPrice - totalAgentPrice;

      const monthlyRate = this.getFtlMonthlyRate(totalProfit);

      const computedItems = [];
      for (const r of group.items) {
        const ap = Number(r.agent_price);
        const sp = Number(r.sell_price);
        const profit = sp - ap;
        const b = r.planned_days;
        const y = r.actual_days;
        const multiplier = this.getFtlTimeMultiplier(y, b);
        const individualKpi = profit * monthlyRate * multiplier;

        computedItems.push({
          id: r.id,
          manager_id: r.manager_id,
          manager_name: `${r.first_name} ${r.last_name}`,
          month: r.month,
          agent_price: await this.convertFromUsd(ap, targetCurrency),
          sell_price: await this.convertFromUsd(sp, targetCurrency),
          profit: await this.convertFromUsd(profit, targetCurrency),
          planned_days: b,
          actual_days: y,
          time_multiplier: multiplier,
          time_multiplier_percentage: `${Math.round(multiplier * 100)}%`,
          individual_kpi: await this.convertFromUsd(
            individualKpi,
            targetCurrency,
          ),
          kpi_received: Boolean(r.kpi_received),
          created_at: r.created_at,
        });
      }

      const totalFtlKpi = computedItems.reduce(
        (sum, i) => sum + i.individual_kpi,
        0,
      );
      const receivedItems = computedItems.filter((i) => i.kpi_received);
      const receivedFtlKpi = receivedItems.reduce(
        (sum, i) => sum + i.individual_kpi,
        0,
      );

      managerSummaries.push({
        manager_id: group.manager_id,
        manager_name: group.manager_name,
        month: group.month,
        truck_count: computedItems.length,
        total_agent_price: await this.convertFromUsd(
          totalAgentPrice,
          targetCurrency,
        ),
        total_sell_price: await this.convertFromUsd(
          totalSellPrice,
          targetCurrency,
        ),
        total_profit: await this.convertFromUsd(totalProfit, targetCurrency),
        monthly_kpi_rate: monthlyRate,
        monthly_kpi_rate_percentage: `${Math.round(monthlyRate * 100)}%`,
        total_ftl_kpi: Math.round(totalFtlKpi * 100) / 100,
        received_ftl_kpi: Math.round(receivedFtlKpi * 100) / 100,
        received_truck_count: receivedItems.length,
        items: computedItems,
      });
    }

    const grandTotalProfit = managerSummaries.reduce(
      (sum, m) => sum + m.total_profit,
      0,
    );
    const grandTotalFtlKpi = managerSummaries.reduce(
      (sum, m) => sum + m.total_ftl_kpi,
      0,
    );
    const grandReceivedFtlKpi = managerSummaries.reduce(
      (sum, m) => sum + m.received_ftl_kpi,
      0,
    );

    return {
      currency: targetCurrency,
      grand_total_profit: Math.round(grandTotalProfit * 100) / 100,
      grand_total_ftl_kpi: Math.round(grandTotalFtlKpi * 100) / 100,
      grand_received_ftl_kpi: Math.round(grandReceivedFtlKpi * 100) / 100,
      summaries: managerSummaries,
    };
  }

  // ==========================================
  // 4. ROP KPI MODULE
  // ==========================================

  private getRopTeamBonusRate(totalTeamSales: number): number {
    if (totalTeamSales < 25000) return 0.0;
    if (totalTeamSales < 30000) return 0.02;
    if (totalTeamSales < 35000) return 0.025;
    if (totalTeamSales < 40000) return 0.03;
    if (totalTeamSales < 45000) return 0.045;
    if (totalTeamSales < 55000) return 0.06;
    return 0.07;
  }

  private getRopTruckCountRate(truckCount: number): number {
    if (truckCount === 0) return 0.0;
    if (truckCount <= 2) return 0.01;
    if (truckCount <= 5) return 0.015;
    if (truckCount <= 9) return 0.02;
    return 0.025;
  }

  async createRopWorker(dto: CreateRopWorkerDto) {
    const employee = await this.knex('employees')
      .where({ id: dto.employee_id })
      .first();
    if (!employee) {
      throw new NotFoundException({
        message: 'Employee worker not found',
        location: 'employee_not_found',
      });
    }

    await this.knex('rop_worker_sales').insert({
      employee_id: dto.employee_id,
      sales_amount: dto.sales_amount,
      month: dto.month || null,
    });

    return this.getRopSummary();
  }

  async deleteRopWorker(id: string) {
    const count = await this.knex('rop_worker_sales').where({ id }).delete();
    if (!count) {
      throw new NotFoundException({
        message: 'ROP worker record not found',
        location: 'rop_worker_not_found',
      });
    }
    return this.getRopSummary();
  }

  async createRopTruck(dto: CreateRopTruckDto) {
    await this.knex('rop_truck_items').insert({
      truck_number: dto.truck_number.trim(),
      profit: dto.profit,
      month: dto.month || null,
    });

    return this.getRopSummary();
  }

  async deleteRopTruck(id: string) {
    const count = await this.knex('rop_truck_items').where({ id }).delete();
    if (!count) {
      throw new NotFoundException({
        message: 'ROP truck record not found',
        location: 'rop_truck_not_found',
      });
    }
    return this.getRopSummary();
  }

  async resetRopData() {
    await this.knex('rop_worker_sales').truncate();
    await this.knex('rop_truck_items').truncate();
    return this.getRopSummary();
  }

  async getRopSummary(currency?: Currency) {
    const targetCurrency = currency || Currency.UZS;

    const workers = await this.knex('rop_worker_sales')
      .join('employees', 'rop_worker_sales.employee_id', 'employees.id')
      .select(
        'rop_worker_sales.*',
        'employees.first_name',
        'employees.last_name',
      )
      .orderBy('rop_worker_sales.created_at', 'asc');

    const trucks = await this.knex('rop_truck_items')
      .select('*')
      .orderBy('created_at', 'asc');

    // 1. Worker 1% KPI calculated in USD
    const rawWorkerSales = workers.map((w) => {
      const sales = Number(w.sales_amount);
      const workerKpi = sales * 0.01;
      return {
        w,
        sales,
        workerKpi,
      };
    });

    const totalWorker1pcKpiUsd = rawWorkerSales.reduce(
      (sum, w) => sum + w.workerKpi,
      0,
    );
    const totalTeamSalesUsd = rawWorkerSales.reduce(
      (sum, w) => sum + w.sales,
      0,
    );

    // 2. Team Bonus
    const teamBonusRate = this.getRopTeamBonusRate(totalTeamSalesUsd);
    const teamBonusKpiUsd = totalTeamSalesUsd * teamBonusRate;

    // 3. Truck KPI
    const rawTrucks = trucks.map((t) => ({
      t,
      profit: Number(t.profit),
    }));

    const truckCount = rawTrucks.length;
    const totalTruckProfitUsd = rawTrucks.reduce((sum, t) => sum + t.profit, 0);
    const truckCountRate = this.getRopTruckCountRate(truckCount);
    const truckKpiUsd = totalTruckProfitUsd * truckCountRate;

    // ROP Total KPI in USD = Worker 1% + Team Bonus + Truck KPI
    const ropTotalKpiUsd = totalWorker1pcKpiUsd + teamBonusKpiUsd + truckKpiUsd;

    const computedWorkers = [];
    for (const item of rawWorkerSales) {
      computedWorkers.push({
        id: item.w.id,
        employee_id: item.w.employee_id,
        worker_name: `${item.w.first_name} ${item.w.last_name}`,
        sales_amount: await this.convertFromUsd(item.sales, targetCurrency),
        worker_kpi_1pc: await this.convertFromUsd(
          item.workerKpi,
          targetCurrency,
        ),
      });
    }

    const computedTrucks = [];
    for (const item of rawTrucks) {
      computedTrucks.push({
        id: item.t.id,
        truck_number: item.t.truck_number,
        profit: await this.convertFromUsd(item.profit, targetCurrency),
      });
    }

    return {
      currency: targetCurrency,
      worker_1pc_kpi: await this.convertFromUsd(
        totalWorker1pcKpiUsd,
        targetCurrency,
      ),
      total_team_sales: await this.convertFromUsd(
        totalTeamSalesUsd,
        targetCurrency,
      ),
      team_bonus_rate: teamBonusRate,
      team_bonus_rate_percentage: `${Math.round(teamBonusRate * 1000) / 10}%`,
      team_bonus_kpi: await this.convertFromUsd(
        teamBonusKpiUsd,
        targetCurrency,
      ),
      truck_count: truckCount,
      total_truck_profit: await this.convertFromUsd(
        totalTruckProfitUsd,
        targetCurrency,
      ),
      truck_count_rate: truckCountRate,
      truck_count_rate_percentage: `${Math.round(truckCountRate * 1000) / 10}%`,
      truck_kpi: await this.convertFromUsd(truckKpiUsd, targetCurrency),
      rop_total_kpi: await this.convertFromUsd(ropTotalKpiUsd, targetCurrency),
      workers: computedWorkers,
      trucks: computedTrucks,
    };
  }

  // ==========================================
  // 5. SEO KPI MODULE
  // ==========================================

  calculateSeoKpi(dto: SeoCalcDto) {
    const netProfit = dto.net_profit;
    const seoRate = 0.1; // 10% pure profit
    const seoKpi = netProfit * seoRate;

    return {
      net_profit: netProfit,
      seo_rate: seoRate,
      seo_rate_percentage: '10%',
      seo_kpi: Math.round(seoKpi * 100) / 100,
    };
  }

  // ==========================================
  // 6. EMPLOYEE PLANS & PROGRESS TRACKING
  // ==========================================

  private formatPeriodForDb(period: string): string {
    if (/^\d{4}-\d{2}$/.test(period)) {
      return `${period}-01`;
    }
    return period;
  }

  private formatPeriodFromDb(period: any): string {
    if (!period) return period;
    if (period instanceof Date) {
      const year = period.getFullYear();
      const month = String(period.getMonth() + 1).padStart(2, '0');
      const day = String(period.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return String(period).slice(0, 10);
  }

  async createEmployeePlan(dto: CreateEmployeePlanDto) {
    const employee = await this.knex('employees')
      .where({ id: dto.employee_id })
      .first();
    if (!employee) {
      throw new NotFoundException({
        message: 'Employee not found',
        location: 'employee_not_found',
      });
    }

    const planCurrency = dto.currency || dto.ftl_currency || Currency.USD;
    const ltlTargetVolume = Number(
      dto.ltl_target_volume !== undefined
        ? dto.ltl_target_volume
        : dto.target_volume !== undefined
          ? dto.target_volume
          : 0,
    );
    const ftlTargetAmount = Number(
      dto.ftl_target_amount !== undefined
        ? dto.ftl_target_amount
        : dto.target_amount !== undefined
          ? dto.target_amount
          : 0,
    );

    await this.knex('employee_plans')
      .insert({
        employee_id: dto.employee_id,
        ltl_target_volume: ltlTargetVolume,
        ftl_target_amount: ftlTargetAmount,
        target_amount: ftlTargetAmount,
        currency: planCurrency,
        period: this.formatPeriodForDb(dto.period),
      })
      .returning('*');

    return this.getEmployeePlansProgress();
  }

  async updateEmployeePlan(id: string, dto: UpdateEmployeePlanDto) {
    const plan = await this.knex('employee_plans').where({ id }).first();
    if (!plan) {
      throw new NotFoundException({
        message: 'Employee plan not found',
        location: 'plan_not_found',
      });
    }

    const updatePayload: Record<string, any> = {
      updated_at: this.knex.fn.now(),
    };

    if (dto.ltl_target_volume !== undefined) {
      updatePayload.ltl_target_volume = Number(dto.ltl_target_volume);
    } else if (dto.target_volume !== undefined) {
      updatePayload.ltl_target_volume = Number(dto.target_volume);
    }

    if (dto.ftl_target_amount !== undefined) {
      updatePayload.ftl_target_amount = Number(dto.ftl_target_amount);
      updatePayload.target_amount = Number(dto.ftl_target_amount);
    } else if (dto.target_amount !== undefined) {
      updatePayload.ftl_target_amount = Number(dto.target_amount);
      updatePayload.target_amount = Number(dto.target_amount);
    }

    if (dto.currency !== undefined) {
      updatePayload.currency = dto.currency;
    } else if (dto.ftl_currency !== undefined) {
      updatePayload.currency = dto.ftl_currency;
    }

    if (dto.period !== undefined) {
      updatePayload.period = this.formatPeriodForDb(dto.period);
    }

    await this.knex('employee_plans').where({ id }).update(updatePayload);
    return this.getEmployeePlansProgress();
  }

  async deleteEmployeePlan(id: string) {
    const count = await this.knex('employee_plans').where({ id }).delete();
    if (!count) {
      throw new NotFoundException({
        message: 'Employee plan not found',
        location: 'plan_not_found',
      });
    }
    return this.getEmployeePlansProgress();
  }

  private getMonthDateRange(
    period: any,
  ): { startDate: string; endDate: string } | null {
    const str = this.formatPeriodFromDb(period);
    if (!str) return null;
    const parts = str.split('-');
    if (parts.length >= 2) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
        const lastDay = new Date(year, month, 0).getDate();
        const mm = String(month).padStart(2, '0');
        const dd = String(lastDay).padStart(2, '0');
        return {
          startDate: `${year}-${mm}-01`,
          endDate: `${year}-${mm}-${dd}`,
        };
      }
    }
    return null;
  }

  /**
   * Helper to compute net yield (profit margin) in target plan currency for an FTL cargo registration.
   */
  async calculateFtlCargoNetYield(
    reg: any,
    planCurrency: Currency = Currency.USD,
    rates?: Record<string, any>,
  ): Promise<number> {
    const purchaseAmount = Number(reg.purchase_price || 0);
    const purchaseCurrency =
      (reg.purchase_currency as Currency) || Currency.USD;
    let purchaseUsd = 0;

    const defaultUsd = rates?.['USD']
      ? rates['USD'].rate / (rates['USD'].nominal || 1)
      : 11820.48;

    if (purchaseAmount > 0) {
      if (purchaseCurrency === Currency.USD) {
        purchaseUsd = purchaseAmount;
      } else if (purchaseCurrency === Currency.UZS) {
        const rateUsed =
          Number(reg.purchase_custom_rate) ||
          Number(reg.purchase_usd_rate) ||
          defaultUsd;
        purchaseUsd = rateUsed > 0 ? purchaseAmount / rateUsed : 0;
      } else if (
        purchaseCurrency === Currency.RMB ||
        purchaseCurrency === Currency.CNY
      ) {
        if (reg.usd_rmb_rate && Number(reg.usd_rmb_rate) > 0) {
          purchaseUsd = purchaseAmount / Number(reg.usd_rmb_rate);
        } else {
          const rmbObj = rates?.['RMB'] ||
            rates?.['CNY'] || { rate: 1758.76, nominal: 1 };
          const rmbRate = rmbObj.rate / (rmbObj.nominal || 1);
          const rateUsed =
            Number(reg.purchase_custom_rate) ||
            Number(reg.purchase_usd_rate) ||
            defaultUsd;
          purchaseUsd =
            rateUsed > 0 ? (purchaseAmount * rmbRate) / rateUsed : 0;
        }
      } else if (purchaseCurrency === Currency.RUB) {
        const rubObj = rates?.['RUB'] || { rate: 137.51, nominal: 1 };
        const rubRate = rubObj.rate / (rubObj.nominal || 1);
        const rateUsed =
          Number(reg.purchase_custom_rate) ||
          Number(reg.purchase_usd_rate) ||
          defaultUsd;
        purchaseUsd = rateUsed > 0 ? (purchaseAmount * rubRate) / rateUsed : 0;
      } else if (this.currencyService) {
        const amtUzs = await this.currencyService.convertToUzs(
          purchaseAmount,
          purchaseCurrency,
          rates,
        );
        const conv = await this.currencyService.convert(
          amtUzs,
          Currency.UZS,
          Currency.USD,
        );
        purchaseUsd = conv.converted_amount;
      } else {
        purchaseUsd = purchaseAmount;
      }
    }

    const sellAmount = Number(reg.sell_price || 0);
    const sellCurrency = (reg.sell_currency as Currency) || Currency.USD;
    let sellUsd = 0;

    if (sellAmount > 0) {
      if (sellCurrency === Currency.USD) {
        sellUsd = sellAmount;
      } else if (sellCurrency === Currency.UZS) {
        const rateUsed =
          Number(reg.sell_custom_rate) ||
          Number(reg.sell_usd_rate) ||
          defaultUsd;
        sellUsd = rateUsed > 0 ? sellAmount / rateUsed : 0;
      } else if (
        sellCurrency === Currency.RMB ||
        sellCurrency === Currency.CNY
      ) {
        if (reg.usd_rmb_rate && Number(reg.usd_rmb_rate) > 0) {
          sellUsd = sellAmount / Number(reg.usd_rmb_rate);
        } else {
          const rmbObj = rates?.['RMB'] ||
            rates?.['CNY'] || { rate: 1758.76, nominal: 1 };
          const rmbRate = rmbObj.rate / (rmbObj.nominal || 1);
          const rateUsed =
            Number(reg.sell_custom_rate) ||
            Number(reg.sell_usd_rate) ||
            defaultUsd;
          sellUsd = rateUsed > 0 ? (sellAmount * rmbRate) / rateUsed : 0;
        }
      } else if (sellCurrency === Currency.RUB) {
        const rubObj = rates?.['RUB'] || { rate: 137.51, nominal: 1 };
        const rubRate = rubObj.rate / (rubObj.nominal || 1);
        const rateUsed =
          Number(reg.sell_custom_rate) ||
          Number(reg.sell_usd_rate) ||
          defaultUsd;
        sellUsd = rateUsed > 0 ? (sellAmount * rubRate) / rateUsed : 0;
      } else if (this.currencyService) {
        const amtUzs = await this.currencyService.convertToUzs(
          sellAmount,
          sellCurrency,
          rates,
        );
        const conv = await this.currencyService.convert(
          amtUzs,
          Currency.UZS,
          Currency.USD,
        );
        sellUsd = conv.converted_amount;
      } else {
        sellUsd = sellAmount;
      }
    }

    const netYieldUsd = sellUsd - purchaseUsd;

    if (planCurrency === Currency.USD) {
      return netYieldUsd;
    }

    if (planCurrency === Currency.UZS) {
      if (this.currencyService) {
        return await this.currencyService.convertToUzs(
          netYieldUsd,
          Currency.USD,
          rates,
        );
      }
      const rateUsed =
        Number(reg.sell_custom_rate) ||
        Number(reg.sell_usd_rate) ||
        Number(reg.purchase_custom_rate) ||
        Number(reg.purchase_usd_rate) ||
        defaultUsd;
      return netYieldUsd * rateUsed;
    }

    if (planCurrency === Currency.RUB) {
      if (this.currencyService) {
        const conv = await this.currencyService.convert(
          netYieldUsd,
          Currency.USD,
          Currency.RUB,
        );
        return conv.converted_amount;
      }
      const rubObj = rates?.['RUB'] || { rate: 137.51, nominal: 1 };
      const rubRate = rubObj.rate / (rubObj.nominal || 1);
      const rateUsed =
        Number(reg.sell_custom_rate) ||
        Number(reg.sell_usd_rate) ||
        Number(reg.purchase_custom_rate) ||
        Number(reg.purchase_usd_rate) ||
        defaultUsd;
      return rubRate > 0 ? (netYieldUsd * rateUsed) / rubRate : 0;
    }

    if (this.currencyService) {
      const conv = await this.currencyService.convert(
        netYieldUsd,
        Currency.USD,
        planCurrency,
      );
      return conv.converted_amount;
    }
    return netYieldUsd;
  }

  async getEmployeePlansProgress(query?: QueryEmployeePlanDto) {
    let plansQuery = this.knex('employee_plans')
      .join('employees', 'employee_plans.employee_id', 'employees.id')
      .leftJoin('departments', 'employees.department_id', 'departments.id')
      .select(
        'employee_plans.*',
        'employees.first_name',
        'employees.last_name',
        'employees.phone',
        'employees.color',
        'departments.name as department_name',
      );

    if (query?.employee_id) {
      plansQuery = plansQuery.where(
        'employee_plans.employee_id',
        query.employee_id,
      );
    }

    if (query?.period) {
      const formatted = this.formatPeriodForDb(query.period);
      const dateRange = this.getMonthDateRange(formatted);
      if (dateRange) {
        plansQuery = plansQuery
          .where('employee_plans.period', '>=', dateRange.startDate)
          .where('employee_plans.period', '<=', dateRange.endDate);
      }
    }

    if (query?.search && query.search.trim()) {
      const s = `%${query.search.trim()}%`;
      plansQuery = plansQuery.where((b) => {
        b.where('employees.first_name', 'ILIKE', s)
          .orWhere('employees.last_name', 'ILIKE', s)
          .orWhere('departments.name', 'ILIKE', s);
      });
    }

    const plans = await plansQuery.orderBy('employee_plans.created_at', 'desc');

    const rates = this.currencyService
      ? await this.currencyService.getLatestRates()
      : undefined;

    const progressData = [];
    for (const p of plans) {
      const ltlTargetVolume = Number(p.ltl_target_volume || 0);
      const ftlTargetAmount = Number(
        p.ftl_target_amount !== undefined
          ? p.ftl_target_amount
          : p.target_amount || 0,
      );
      const planCurrency = (p.currency as Currency) || Currency.USD;

      let actualLtlVolume = 0;
      let ltlCargoCount = 0;

      let actualFtlAmount = 0;
      let ftlCargoCount = 0;

      // Query cargo registrations for this employee in period month strictly by confirmed_date
      let regQuery = this.knex('cargo_registrations').where(
        'employee_id',
        p.employee_id,
      );
      const dateRange = this.getMonthDateRange(p.period);
      if (dateRange) {
        regQuery = regQuery.whereBetween('confirmed_date', [
          dateRange.startDate,
          dateRange.endDate,
        ]);
      }

      const regRows = await regQuery.select(
        'cargo_type',
        'volume',
        'purchase_price',
        'purchase_currency',
        'purchase_usd_rate',
        'purchase_custom_rate',
        'sell_price',
        'sell_currency',
        'sell_usd_rate',
        'sell_custom_rate',
        'usd_rmb_rate',
      );

      for (const reg of regRows) {
        const cargoType = String(reg.cargo_type || '').toUpperCase();
        if (cargoType === 'LTL') {
          const vol = Number(reg.volume || 0);
          actualLtlVolume += vol;
          ltlCargoCount += 1;
        } else if (cargoType === 'FTL') {
          const netYield = await this.calculateFtlCargoNetYield(
            reg,
            planCurrency,
            rates,
          );
          actualFtlAmount += netYield;
          ftlCargoCount += 1;
        }
      }

      // Calculations for Direction 1: LTL Volume Plan
      const roundedLtlActual = Math.round(actualLtlVolume * 100) / 100;
      const ltlRemainingVolume = Math.max(
        0,
        Math.round((ltlTargetVolume - roundedLtlActual) * 100) / 100,
      );
      const ltlCompletionPercentage =
        ltlTargetVolume > 0
          ? Math.round((roundedLtlActual / ltlTargetVolume) * 10000) / 100
          : roundedLtlActual > 0
            ? 100
            : 0;
      const ltlIsCompleted =
        ltlTargetVolume > 0 ? roundedLtlActual >= ltlTargetVolume : false;

      // Calculations for Direction 2: FTL Financial Value Plan
      const roundedFtlActual = Math.round(actualFtlAmount * 100) / 100;
      const ftlRemainingAmount = Math.max(
        0,
        Math.round((ftlTargetAmount - roundedFtlActual) * 100) / 100,
      );
      const ftlCompletionPercentage =
        ftlTargetAmount > 0
          ? Math.round((roundedFtlActual / ftlTargetAmount) * 10000) / 100
          : roundedFtlActual > 0
            ? 100
            : 0;
      const ftlIsCompleted =
        ftlTargetAmount > 0 ? roundedFtlActual >= ftlTargetAmount : false;

      // Overall calculations
      let overallCompletionPercentage = 0;
      let overallIsCompleted = false;

      if (ltlTargetVolume > 0 && ftlTargetAmount > 0) {
        overallCompletionPercentage =
          Math.round(
            ((ltlCompletionPercentage + ftlCompletionPercentage) / 2) * 100,
          ) / 100;
        overallIsCompleted = ltlIsCompleted && ftlIsCompleted;
      } else if (ltlTargetVolume > 0) {
        overallCompletionPercentage = ltlCompletionPercentage;
        overallIsCompleted = ltlIsCompleted;
      } else if (ftlTargetAmount > 0) {
        overallCompletionPercentage = ftlCompletionPercentage;
        overallIsCompleted = ftlIsCompleted;
      }

      const periodStr = this.formatPeriodFromDb(p.period);

      progressData.push({
        id: p.id,
        employee_id: p.employee_id,
        employee_name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        department_name: p.department_name || 'N/A',
        color: p.color || '#CCCCCC',
        period: periodStr,
        currency: planCurrency,

        // Direction 1: LTL Volume Plan (m3)
        ltl_plan: {
          target_volume: ltlTargetVolume,
          actual_volume: roundedLtlActual,
          remaining_volume: ltlRemainingVolume,
          completion_percentage: ltlCompletionPercentage,
          is_completed: ltlIsCompleted,
          cargo_count: ltlCargoCount,
        },

        // Direction 2: FTL Financial Value Plan
        ftl_plan: {
          target_amount: ftlTargetAmount,
          currency: planCurrency,
          actual_amount: roundedFtlActual,
          remaining_amount: ftlRemainingAmount,
          completion_percentage: ftlCompletionPercentage,
          is_completed: ftlIsCompleted,
          cargo_count: ftlCargoCount,
        },

        // Summary metrics
        total_cargos_count: ltlCargoCount + ftlCargoCount,
        overall_completion_percentage: overallCompletionPercentage,

        // Backward-compatible fields
        ltl_target_volume: ltlTargetVolume,
        ltl_actual_volume: roundedLtlActual,
        ftl_target_amount: ftlTargetAmount,
        ftl_actual_amount: roundedFtlActual,
        target_amount: ftlTargetAmount,
        actual_sales: roundedFtlActual,
        remaining_amount: ftlRemainingAmount,
        target_volume: ltlTargetVolume,
        actual_volume: roundedLtlActual,
        remaining_volume: ltlRemainingVolume,
        completion_percentage: overallCompletionPercentage,
        is_completed: overallIsCompleted,
      });
    }

    // Sort by overall_completion_percentage descending for leaderboard rating
    progressData.sort(
      (a, b) =>
        b.overall_completion_percentage - a.overall_completion_percentage,
    );

    return {
      total_plans: progressData.length,
      leaderboard: progressData,
    };
  }

  async getEmployeePlansStatistics(query?: QueryEmployeePlanDto) {
    const plansProgress = await this.getEmployeePlansProgress(query);
    const leaderboard = plansProgress.leaderboard;

    let totalTargetVolume = 0;
    let totalActualVolume = 0;
    let totalLtlCargos = 0;

    let totalTargetAmount = 0;
    let totalActualAmount = 0;
    let totalFtlCargos = 0;

    let completedPlansCount = 0;
    let inProgressPlansCount = 0;

    const deptMap = new Map<
      string,
      {
        department_name: string;
        employees_count: number;
        ltl_target_volume: number;
        ltl_actual_volume: number;
        ftl_target_amount: number;
        ftl_actual_amount: number;
        total_cargos: number;
      }
    >();

    const targetCurrency = Currency.USD;

    for (const p of leaderboard) {
      if (p.is_completed) {
        completedPlansCount++;
      } else {
        inProgressPlansCount++;
      }

      totalTargetVolume += p.ltl_plan.target_volume;
      totalActualVolume += p.ltl_plan.actual_volume;
      totalLtlCargos += p.ltl_plan.cargo_count;

      totalTargetAmount += p.ftl_plan.target_amount;
      totalActualAmount += p.ftl_plan.actual_amount;
      totalFtlCargos += p.ftl_plan.cargo_count;

      const deptName = p.department_name || 'Other';
      if (!deptMap.has(deptName)) {
        deptMap.set(deptName, {
          department_name: deptName,
          employees_count: 0,
          ltl_target_volume: 0,
          ltl_actual_volume: 0,
          ftl_target_amount: 0,
          ftl_actual_amount: 0,
          total_cargos: 0,
        });
      }
      const dept = deptMap.get(deptName)!;
      dept.employees_count += 1;
      dept.ltl_target_volume += p.ltl_plan.target_volume;
      dept.ltl_actual_volume += p.ltl_plan.actual_volume;
      dept.ftl_target_amount += p.ftl_plan.target_amount;
      dept.ftl_actual_amount += p.ftl_plan.actual_amount;
      dept.total_cargos += p.total_cargos_count;
    }

    const roundedActualVolume = Math.round(totalActualVolume * 100) / 100;
    const roundedTargetVolume = Math.round(totalTargetVolume * 100) / 100;
    const remainingVolume = Math.max(
      0,
      Math.round((roundedTargetVolume - roundedActualVolume) * 100) / 100,
    );
    const ltlCompletionRate =
      roundedTargetVolume > 0
        ? Math.round((roundedActualVolume / roundedTargetVolume) * 10000) / 100
        : roundedActualVolume > 0
          ? 100
          : 0;

    const roundedActualAmount = Math.round(totalActualAmount * 100) / 100;
    const roundedTargetAmount = Math.round(totalTargetAmount * 100) / 100;
    const remainingAmount = Math.max(
      0,
      Math.round((roundedTargetAmount - roundedActualAmount) * 100) / 100,
    );
    const ftlCompletionRate =
      roundedTargetAmount > 0
        ? Math.round((roundedActualAmount / roundedTargetAmount) * 10000) / 100
        : roundedActualAmount > 0
          ? 100
          : 0;

    const overallCompletionRate =
      leaderboard.length > 0
        ? Math.round(
            (leaderboard.reduce(
              (acc, curr) => acc + curr.overall_completion_percentage,
              0,
            ) /
              leaderboard.length) *
              100,
          ) / 100
        : 0;

    const departmentBreakdown = Array.from(deptMap.values()).map((d) => {
      const ltlComp =
        d.ltl_target_volume > 0
          ? Math.round((d.ltl_actual_volume / d.ltl_target_volume) * 10000) /
            100
          : d.ltl_actual_volume > 0
            ? 100
            : 0;
      const ftlComp =
        d.ftl_target_amount > 0
          ? Math.round((d.ftl_actual_amount / d.ftl_target_amount) * 10000) /
            100
          : d.ftl_actual_amount > 0
            ? 100
            : 0;
      return {
        ...d,
        ltl_target_volume: Math.round(d.ltl_target_volume * 100) / 100,
        ltl_actual_volume: Math.round(d.ltl_actual_volume * 100) / 100,
        ftl_target_amount: Math.round(d.ftl_target_amount * 100) / 100,
        ftl_actual_amount: Math.round(d.ftl_actual_amount * 100) / 100,
        ltl_completion_percentage: ltlComp,
        ftl_completion_percentage: ftlComp,
        currency: targetCurrency,
      };
    });

    return {
      period: query?.period || new Date().toISOString().slice(0, 7),
      currency: targetCurrency,
      summary: {
        total_plans: leaderboard.length,
        completed_plans_count: completedPlansCount,
        in_progress_plans_count: inProgressPlansCount,
        overall_completion_percentage: overallCompletionRate,
        total_cargos_registered: totalLtlCargos + totalFtlCargos,
      },
      ltl_statistics: {
        total_target_volume: roundedTargetVolume,
        total_actual_volume: roundedActualVolume,
        total_remaining_volume: remainingVolume,
        completion_percentage: ltlCompletionRate,
        total_cargo_count: totalLtlCargos,
        avg_volume_per_cargo:
          totalLtlCargos > 0
            ? Math.round((roundedActualVolume / totalLtlCargos) * 100) / 100
            : 0,
      },
      ftl_statistics: {
        total_target_amount: roundedTargetAmount,
        total_actual_amount: roundedActualAmount,
        total_remaining_amount: remainingAmount,
        completion_percentage: ftlCompletionRate,
        currency: targetCurrency,
        total_cargo_count: totalFtlCargos,
        avg_amount_per_cargo:
          totalFtlCargos > 0
            ? Math.round((roundedActualAmount / totalFtlCargos) * 100) / 100
            : 0,
      },
      leaderboard: leaderboard.map((item, index) => ({
        rank: index + 1,
        ...item,
      })),
      department_breakdown: departmentBreakdown,
    };
  }

  async getEmployeePlanPersonalStats(
    employeeId: string,
    query?: QueryEmployeePlanDto,
  ) {
    const employee = await this.knex('employees as e')
      .leftJoin('departments as d', 'e.department_id', 'd.id')
      .where('e.id', employeeId)
      .select(
        'e.id',
        'e.first_name',
        'e.last_name',
        'e.phone',
        'e.color',
        'd.name as department_name',
      )
      .first();

    if (!employee) {
      throw new NotFoundException({
        message: 'Employee not found',
        location: 'employee_not_found',
      });
    }

    const plansProgress = await this.getEmployeePlansProgress({
      employee_id: employeeId,
      period: query?.period,
    });

    const currentPlan = plansProgress.leaderboard[0] || null;

    // Fetch all historical plans for this employee
    const allEmployeePlans = await this.getEmployeePlansProgress({
      employee_id: employeeId,
    });

    const history = allEmployeePlans.leaderboard;

    let lifetimeLtlVolume = 0;
    let lifetimeFtlAmount = 0;
    let lifetimeCargos = 0;
    let lifetimePlansCompleted = 0;

    for (const h of history) {
      lifetimeLtlVolume += h.ltl_plan.actual_volume;
      lifetimeFtlAmount += h.ftl_plan.actual_amount;
      lifetimeCargos += h.total_cargos_count;
      if (h.is_completed) lifetimePlansCompleted++;
    }

    return {
      employee: {
        id: employee.id,
        first_name: employee.first_name,
        last_name: employee.last_name,
        full_name:
          `${employee.first_name || ''} ${employee.last_name || ''}`.trim(),
        department_name: employee.department_name || 'N/A',
        color: employee.color || '#CCCCCC',
      },
      current_plan: currentPlan,
      totals: {
        total_plans_set: history.length,
        plans_completed: lifetimePlansCompleted,
        total_ltl_volume_achieved: Math.round(lifetimeLtlVolume * 100) / 100,
        total_ftl_sales_achieved: Math.round(lifetimeFtlAmount * 100) / 100,
        currency: currentPlan?.currency || Currency.USD,
        total_cargos_registered: lifetimeCargos,
      },
      history: history,
    };
  }

  private getDepartmentKpiPercentage(departmentName: string): number {
    const name = departmentName.toLowerCase();
    if (name.includes('sborniy')) return 10;
    if (name.includes('sales')) return 10;
    if (name.includes('marketing')) return 10;
    if (name.includes('translator') || name.includes('tarjimon')) return 10;
    if (name.includes('declarant') || name.includes('deklarant')) return 10;
    if (name.includes('bookkeeper') || name.includes('buxgalter')) return 10;
    if (name.includes('seo')) return 10;
    return 10; // Default fallback to 10%
  }

  // ==========================================
  // 7. CARGO TRANSACTIONS
  // ==========================================

  async createCargoTransaction(dto: CreateCargoTransactionDto) {
    const employee = await this.knex('employees')
      .where({ id: dto.employee_id })
      .first();
    if (!employee) {
      throw new NotFoundException({
        message: 'Employee not found',
        location: 'employee_not_found',
      });
    }

    const department = await this.knex('departments')
      .where({ id: dto.department_id })
      .first();
    if (!department) {
      throw new NotFoundException({
        message: 'Department not found',
        location: 'department_not_found',
      });
    }

    const client = await this.knex('clients')
      .where({ id: dto.client_id })
      .first();
    if (!client) {
      throw new NotFoundException({
        message: 'Client not found',
        location: 'client_not_found',
      });
    }

    const buyPrice = dto.buy_price;
    const sellPrice = dto.sell_price;
    const margin = sellPrice - buyPrice;
    const kpiPercentage = this.getDepartmentKpiPercentage(department.name);
    const kpiBonus = margin * (kpiPercentage / 100);
    const currency = dto.currency || 'UZS';

    const [tx] = await this.knex('cargo_transactions')
      .insert({
        employee_id: dto.employee_id,
        department_id: dto.department_id,
        client_id: dto.client_id,
        description: dto.description || null,
        buy_price: buyPrice,
        sell_price: sellPrice,
        margin,
        kpi_percentage: kpiPercentage,
        kpi_bonus: kpiBonus,
        currency,
        status: dto.status || 'Waiting',
        transaction_date: dto.transaction_date,
      })
      .returning('*');

    return this.findCargoTransactionById(tx.id);
  }

  async findCargoTransactionById(id: string) {
    const tx = await this.knex('cargo_transactions')
      .join('employees', 'cargo_transactions.employee_id', 'employees.id')
      .join('departments', 'cargo_transactions.department_id', 'departments.id')
      .leftJoin('clients', 'cargo_transactions.client_id', 'clients.id')
      .select(
        'cargo_transactions.*',
        'employees.first_name as employee_first_name',
        'employees.last_name as employee_last_name',
        'departments.name as department_name',
        'clients.first_name as client_first_name',
        'clients.last_name as client_last_name',
        'clients.company_name as client_company_name',
      )
      .where('cargo_transactions.id', id)
      .first();

    if (!tx) {
      throw new NotFoundException({
        message: 'Cargo transaction not found',
        location: 'transaction_not_found',
      });
    }

    return {
      id: tx.id,
      employee_id: tx.employee_id,
      employee_name: `${tx.employee_first_name} ${tx.employee_last_name}`,
      department_id: tx.department_id,
      department_name: tx.department_name,
      client_id: tx.client_id,
      client_name: tx.client_id
        ? `${tx.client_first_name} ${tx.client_last_name}`.trim()
        : null,
      client_company: tx.client_company_name || null,
      description: tx.description,
      buy_price: Number(tx.buy_price),
      sell_price: Number(tx.sell_price),
      margin: Number(tx.margin),
      kpi_percentage: Number(tx.kpi_percentage),
      kpi_bonus: Number(tx.kpi_bonus),
      currency: tx.currency || 'UZS',
      status: tx.status || 'Waiting',
      transaction_date: tx.transaction_date,
      created_at: tx.created_at,
    };
  }

  async findAllCargoTransactions(query: QueryCargoTransactionDto) {
    const page = query.page ? Math.max(1, parseInt(query.page, 10)) : 1;
    const limit = query.limit
      ? Math.min(100, Math.max(1, parseInt(query.limit, 10)))
      : 20;
    const offset = query.offset
      ? parseInt(query.offset, 10)
      : (page - 1) * limit;

    const baseQuery = this.knex('cargo_transactions')
      .join('employees', 'cargo_transactions.employee_id', 'employees.id')
      .join('departments', 'cargo_transactions.department_id', 'departments.id')
      .leftJoin('clients', 'cargo_transactions.client_id', 'clients.id')
      .select(
        'cargo_transactions.*',
        'employees.first_name as employee_first_name',
        'employees.last_name as employee_last_name',
        'departments.name as department_name',
        'clients.first_name as client_first_name',
        'clients.last_name as client_last_name',
        'clients.company_name as client_company_name',
      );

    if (query.employee_id) {
      baseQuery.where('cargo_transactions.employee_id', query.employee_id);
    }
    if (query.department_id) {
      baseQuery.where('cargo_transactions.department_id', query.department_id);
    }
    if (query.status) {
      baseQuery.where('cargo_transactions.status', query.status);
    }
    if (query.statuses) {
      const statusList = Array.isArray(query.statuses)
        ? query.statuses
        : query.statuses.split(',');
      baseQuery.whereIn('cargo_transactions.status', statusList);
    }
    if (query.start_date) {
      baseQuery.where(
        'cargo_transactions.transaction_date',
        '>=',
        query.start_date,
      );
    }
    if (query.end_date) {
      baseQuery.where(
        'cargo_transactions.transaction_date',
        '<=',
        query.end_date,
      );
    }
    if (query.search) {
      const term = `%${query.search.trim()}%`;
      baseQuery.where((b) => {
        b.whereILike('cargo_transactions.description', term)
          .orWhereILike('clients.first_name', term)
          .orWhereILike('clients.last_name', term)
          .orWhereILike('clients.company_name', term)
          .orWhereILike('employees.first_name', term)
          .orWhereILike('employees.last_name', term);
      });
    }

    const countQuery = this.knex('cargo_transactions')
      .leftJoin('employees', 'cargo_transactions.employee_id', 'employees.id')
      .leftJoin('clients', 'cargo_transactions.client_id', 'clients.id');
    if (query.employee_id)
      countQuery.where('cargo_transactions.employee_id', query.employee_id);
    if (query.department_id)
      countQuery.where('cargo_transactions.department_id', query.department_id);
    if (query.status)
      countQuery.where('cargo_transactions.status', query.status);
    if (query.statuses) {
      const statusList = Array.isArray(query.statuses)
        ? query.statuses
        : query.statuses.split(',');
      countQuery.whereIn('cargo_transactions.status', statusList);
    }
    if (query.start_date)
      countQuery.where(
        'cargo_transactions.transaction_date',
        '>=',
        query.start_date,
      );
    if (query.end_date)
      countQuery.where(
        'cargo_transactions.transaction_date',
        '<=',
        query.end_date,
      );
    if (query.search) {
      const term = `%${query.search.trim()}%`;
      countQuery.where((b) => {
        b.whereILike('cargo_transactions.description', term)
          .orWhereILike('clients.first_name', term)
          .orWhereILike('clients.last_name', term)
          .orWhereILike('clients.company_name', term)
          .orWhereILike('employees.first_name', term)
          .orWhereILike('employees.last_name', term);
      });
    }

    const [{ total }] = await countQuery.count(
      'cargo_transactions.id as total',
    );
    const totalCount = parseInt(total as string, 10);
    const totalPages = Math.ceil(totalCount / limit);

    const statusCountsQuery = this.knex('cargo_transactions')
      .leftJoin('employees', 'cargo_transactions.employee_id', 'employees.id')
      .leftJoin('clients', 'cargo_transactions.client_id', 'clients.id')
      .select('cargo_transactions.status')
      .count('cargo_transactions.id as total')
      .groupBy('cargo_transactions.status');

    if (query.employee_id)
      statusCountsQuery.where(
        'cargo_transactions.employee_id',
        query.employee_id,
      );
    if (query.department_id)
      statusCountsQuery.where(
        'cargo_transactions.department_id',
        query.department_id,
      );
    if (query.start_date)
      statusCountsQuery.where(
        'cargo_transactions.transaction_date',
        '>=',
        query.start_date,
      );
    if (query.end_date)
      statusCountsQuery.where(
        'cargo_transactions.transaction_date',
        '<=',
        query.end_date,
      );
    if (query.search) {
      const term = `%${query.search.trim()}%`;
      statusCountsQuery.where((b) => {
        b.whereILike('cargo_transactions.description', term)
          .orWhereILike('clients.first_name', term)
          .orWhereILike('clients.last_name', term)
          .orWhereILike('clients.company_name', term)
          .orWhereILike('employees.first_name', term)
          .orWhereILike('employees.last_name', term);
      });
    }

    const rawStatusCounts = await statusCountsQuery;
    const statusCounts: Record<string, number> = {
      Waiting: 0,
      'In Transit': 0,
      Border: 0,
      'At Station': 0,
      Delivered: 0,
    };
    rawStatusCounts.forEach((sc: any) => {
      if (sc.status && statusCounts[sc.status] !== undefined) {
        statusCounts[sc.status] = parseInt(sc.total as string, 10);
      }
    });

    const rows = await baseQuery
      .orderBy('cargo_transactions.transaction_date', 'desc')
      .limit(limit)
      .offset(offset);

    const data = rows.map((tx) => ({
      id: tx.id,
      employee_id: tx.employee_id,
      employee_name: `${tx.employee_first_name} ${tx.employee_last_name}`,
      department_id: tx.department_id,
      department_name: tx.department_name,
      client_id: tx.client_id,
      client_name: tx.client_id
        ? `${tx.client_first_name} ${tx.client_last_name}`.trim()
        : null,
      client_company: tx.client_company_name || null,
      description: tx.description,
      buy_price: Number(tx.buy_price),
      sell_price: Number(tx.sell_price),
      margin: Number(tx.margin),
      kpi_percentage: Number(tx.kpi_percentage),
      kpi_bonus: Number(tx.kpi_bonus),
      currency: tx.currency || 'UZS',
      status: tx.status || 'Waiting',
      transaction_date: tx.transaction_date,
      created_at: tx.created_at,
    }));

    if (query.group_by_status === 'true') {
      const statuses = [
        'Waiting',
        'In Transit',
        'Border',
        'At Station',
        'Delivered',
      ];
      const groupedData: Record<string, any> = {};

      for (const st of statuses) {
        const stItems = data.filter((item) => item.status === st);
        groupedData[st] = {
          metrics: {
            total_transactions: statusCounts[st] || 0,
            loaded_transactions: stItems.length,
            total_sell_price: stItems.reduce((acc, i) => acc + i.sell_price, 0),
            total_buy_price: stItems.reduce((acc, i) => acc + i.buy_price, 0),
            total_margin: stItems.reduce((acc, i) => acc + i.margin, 0),
            total_kpi_bonus: stItems.reduce((acc, i) => acc + i.kpi_bonus, 0),
          },
          transactions: stItems,
        };
      }

      return {
        meta: {
          total: totalCount,
          limit,
          offset,
          page,
          totalPages,
          status_counts: statusCounts,
        },
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages,
        },
        data: groupedData,
      };
    }

    return {
      meta: {
        total: totalCount,
        limit,
        offset,
        page,
        totalPages,
        status_counts: statusCounts,
      },
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages,
      },
      data,
    };
  }

  async findViewableCargoTransactions(query: QueryCargoTransactionDto) {
    return this.findAllCargoTransactions({
      ...query,
      group_by_status: 'true',
    });
  }

  async updateCargoTransaction(id: string, dto: UpdateCargoTransactionDto) {
    const tx = await this.knex('cargo_transactions').where({ id }).first();
    if (!tx) {
      throw new NotFoundException({
        message: 'Cargo transaction not found',
        location: 'transaction_not_found',
      });
    }

    if (dto.client_id !== undefined) {
      const client = await this.knex('clients')
        .where({ id: dto.client_id })
        .first();
      if (!client) {
        throw new NotFoundException({
          message: 'Client not found',
          location: 'client_not_found',
        });
      }
    }

    const buyPrice =
      dto.buy_price !== undefined ? dto.buy_price : Number(tx.buy_price);
    const sellPrice =
      dto.sell_price !== undefined ? dto.sell_price : Number(tx.sell_price);
    const margin = sellPrice - buyPrice;

    // Resolve the department_id to use
    const departmentId =
      dto.department_id !== undefined ? dto.department_id : tx.department_id;
    const department = await this.knex('departments')
      .where({ id: departmentId })
      .first();
    if (!department) {
      throw new NotFoundException({
        message: 'Department not found',
        location: 'department_not_found',
      });
    }

    const kpiPercentage = this.getDepartmentKpiPercentage(department.name);
    const kpiBonus = margin * (kpiPercentage / 100);

    const updatePayload: Record<string, any> = {
      buy_price: buyPrice,
      sell_price: sellPrice,
      margin,
      kpi_percentage: kpiPercentage,
      kpi_bonus: kpiBonus,
      updated_at: this.knex.fn.now(),
    };

    if (dto.employee_id !== undefined)
      updatePayload.employee_id = dto.employee_id;
    if (dto.department_id !== undefined)
      updatePayload.department_id = dto.department_id;
    if (dto.client_id !== undefined) updatePayload.client_id = dto.client_id;
    if (dto.description !== undefined)
      updatePayload.description = dto.description;
    if (dto.currency !== undefined) updatePayload.currency = dto.currency;
    if (dto.status !== undefined) updatePayload.status = dto.status;
    if (dto.transaction_date !== undefined)
      updatePayload.transaction_date = dto.transaction_date;

    await this.knex('cargo_transactions').where({ id }).update(updatePayload);
    return this.findCargoTransactionById(id);
  }

  async deleteCargoTransaction(id: string) {
    const count = await this.knex('cargo_transactions').where({ id }).delete();
    if (!count) {
      throw new NotFoundException({
        message: 'Cargo transaction not found',
        location: 'transaction_not_found',
      });
    }
  }

  // ==========================================
  // 8. SYSTEM-WIDE RESET
  // ==========================================

  async resetAllCargoKpi() {
    await this.clearLtlItems();
    await this.resetFtlData();
    await this.resetRopData();
    return {
      message: 'All Cargo & KPI module data reset successfully',
    };
  }
}
