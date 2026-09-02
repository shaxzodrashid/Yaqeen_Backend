import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { CurrencyService } from '../currency/currency.service';
import { RedisService } from '../redis/redis.service';
import {
  CreateCargoConsolidationDto,
  UpdateCargoConsolidationDto,
  QueryCargoConsolidationDto,
  AssignCargosDto,
  RemoveCargosDto,
} from './dto/cargo-consolidations.dto';

@Injectable()
export class CargoConsolidationsService {
  private readonly logger = new Logger(CargoConsolidationsService.name);

  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly currencyService: CurrencyService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  /**
   * Helper to format Date objects, date strings, or fallback to YYYY-MM-DD.
   */
  private formatDateStr(d: any): string | null {
    if (!d) return null;
    if (typeof d === 'string') return d.slice(0, 10);
    if (d instanceof Date) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return null;
  }

  private getTodayDateStr(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Infer default transport type from container_type, cargo_type, or truck ID.
   */
  inferTransportType(
    containerType?: string | null,
    cargoType?: string | null,
    truckOrContainerId?: string | null,
  ): string {
    const cType = (containerType || '').toLowerCase().trim();
    const id = (truckOrContainerId || '').toLowerCase().trim();

    if (
      cType.includes('air') ||
      cType.includes('avia') ||
      cType.includes('plane') ||
      cType.includes('flight') ||
      id.includes('air')
    ) {
      return 'air';
    }

    if (
      cType.includes('rail') ||
      cType.includes('train') ||
      cType.includes('poezd') ||
      cType.includes('temir') ||
      cType.includes('20gp') ||
      cType.includes('20hq') ||
      cType.includes('40gp') ||
      cType.includes('40hq') ||
      cType.includes('40hc') ||
      cType.includes('45hq') ||
      cType.includes('45hc') ||
      cType.includes('40 gp') ||
      cType.includes('40 hc') ||
      cType.includes('45 hc')
    ) {
      return 'railway';
    }

    if (
      cType.includes('sea') ||
      cType.includes('ship') ||
      cType.includes('vessel') ||
      cType.includes('ocean') ||
      cType.includes('dengiz') ||
      cType.includes('marine') ||
      cType.includes('port')
    ) {
      return 'sea';
    }

    return 'auto';
  }

  /**
   * Helper to convert an expense amount in any currency to USD equivalent.
   */
  private convertExpenseToUsd(
    amount: number,
    currency?: string,
    defaultRate?: number,
    rates?: Record<string, any>,
  ): number {
    if (!amount || amount <= 0) return 0;
    const curr = (currency || 'USD').toUpperCase();
    if (curr === 'USD') return amount;

    const usdObj = rates?.['USD'] || { rate: 11820.48, nominal: 1 };
    const defaultUsdRate = usdObj.rate / (usdObj.nominal || 1);

    if (curr === 'UZS') {
      const usdRateUsed =
        defaultRate && defaultRate > 1 ? defaultRate : defaultUsdRate;
      return usdRateUsed > 0 ? amount / usdRateUsed : 0;
    }
    if (curr === 'RUB') {
      const rubObj = rates?.['RUB'] || { rate: 137.51, nominal: 1 };
      const rubRate = rubObj.rate / (rubObj.nominal || 1);
      return defaultUsdRate > 0 ? (amount * rubRate) / defaultUsdRate : 0;
    }
    if (curr === 'RMB' || curr === 'CNY') {
      const rmbObj = rates?.['RMB'] ||
        rates?.['CNY'] || { rate: 1758.76, nominal: 1 };
      const rmbRate = rmbObj.rate / (rmbObj.nominal || 1);
      return defaultUsdRate > 0 ? (amount * rmbRate) / defaultUsdRate : 0;
    }
    return amount;
  }

  /**
   * Helper to compute and breakdown consolidation expenses (outcomes) in native currency and USD.
   * Outcomes are: agent, china_warehouse, company_service, customs_clearance_of_goods, and cct.
   */
  computeConsolidationExpenses(
    r: any,
    rates?: Record<string, any>,
  ): {
    agent: number;
    agent_currency: string;
    agent_usd: number;
    china_warehouse: number;
    china_warehouse_currency: string;
    china_warehouse_usd: number;
    company_service: number;
    company_service_currency: string;
    company_service_usd: number;
    customs_clearance_of_goods: number;
    customs_clearance_of_goods_currency: string;
    customs_clearance_of_goods_usd: number;
    cct: number;
    cct_currency: string;
    cct_usd: number;
    total: number;
    total_usd: number;
  } {
    const agent = Number(
      r.agent !== null && r.agent !== undefined
        ? r.agent
        : r.total_carrier_cost || 0,
    );
    const agentCurrency = r.agent_currency || r.carrier_cost_currency || 'USD';
    const agentUsd = this.convertExpenseToUsd(
      agent,
      agentCurrency,
      Number(r.carrier_cost_usd_rate),
      rates,
    );

    const chinaWarehouse = Number(r.china_warehouse || 0);
    const chinaWarehouseCurrency = r.china_warehouse_currency || 'USD';
    const chinaWarehouseUsd = this.convertExpenseToUsd(
      chinaWarehouse,
      chinaWarehouseCurrency,
      undefined,
      rates,
    );

    const companyService = Number(r.company_service || 0);
    const companyServiceCurrency = r.company_service_currency || 'USD';
    const companyServiceUsd = this.convertExpenseToUsd(
      companyService,
      companyServiceCurrency,
      undefined,
      rates,
    );

    const customsClearance = Number(r.customs_clearance_of_goods || 0);
    const customsClearanceCurrency =
      r.customs_clearance_of_goods_currency || 'USD';
    const customsClearanceUsd = this.convertExpenseToUsd(
      customsClearance,
      customsClearanceCurrency,
      undefined,
      rates,
    );

    const cct = Number(r.cct || 0);
    const cctCurrency = r.cct_currency || 'USD';
    const cctUsd = this.convertExpenseToUsd(cct, cctCurrency, undefined, rates);

    const totalUsd =
      agentUsd +
      chinaWarehouseUsd +
      companyServiceUsd +
      customsClearanceUsd +
      cctUsd;

    return {
      agent: Math.round(agent * 100) / 100,
      agent_currency: agentCurrency,
      agent_usd: Math.round(agentUsd * 100) / 100,
      china_warehouse: Math.round(chinaWarehouse * 100) / 100,
      china_warehouse_currency: chinaWarehouseCurrency,
      china_warehouse_usd: Math.round(chinaWarehouseUsd * 100) / 100,
      company_service: Math.round(companyService * 100) / 100,
      company_service_currency: companyServiceCurrency,
      company_service_usd: Math.round(companyServiceUsd * 100) / 100,
      customs_clearance_of_goods: Math.round(customsClearance * 100) / 100,
      customs_clearance_of_goods_currency: customsClearanceCurrency,
      customs_clearance_of_goods_usd:
        Math.round(customsClearanceUsd * 100) / 100,
      cct: Math.round(cct * 100) / 100,
      cct_currency: cctCurrency,
      cct_usd: Math.round(cctUsd * 100) / 100,
      total: Math.round(totalUsd * 100) / 100,
      total_usd: Math.round(totalUsd * 100) / 100,
    };
  }

  /**
   * Helper to format an individual cargo registration attached to a consolidation.
   */
  private formatCargoItem(
    r: any,
    isDetail: boolean = false,
    rates?: Record<string, any>,
  ) {
    const vol =
      r.volume !== null && r.volume !== undefined ? Number(r.volume) : null;
    const wt =
      r.weight !== null && r.weight !== undefined ? Number(r.weight) : null;

    const usdObj = rates?.['USD'] || { rate: 11820.48, nominal: 1 };
    const defaultUsdRate = usdObj.rate / (usdObj.nominal || 1);
    const rubObj = rates?.['RUB'] || { rate: 137.51, nominal: 1 };
    const defaultRubRate = rubObj.rate / (rubObj.nominal || 1);
    const rmbObj = rates?.['RMB'] ||
      rates?.['CNY'] || { rate: 1758.76, nominal: 1 };
    const defaultRmbRate = rmbObj.rate / (rmbObj.nominal || 1);

    const convertPrice = (
      amount: number,
      currency: string,
      customRate?: number,
    ) => {
      if (!amount || amount <= 0) return 0;
      const curr = (currency || 'USD').toUpperCase();
      if (curr === 'USD') return amount;
      const rateUsed =
        customRate && customRate > 0 ? customRate : defaultUsdRate;
      if (curr === 'UZS') {
        return rateUsed > 0 ? amount / rateUsed : 0;
      }
      if (curr === 'RMB' || curr === 'CNY') {
        if (r.usd_rmb_rate && Number(r.usd_rmb_rate) > 0) {
          return amount / Number(r.usd_rmb_rate);
        }
        return rateUsed > 0 ? (amount * defaultRmbRate) / rateUsed : 0;
      }
      if (curr === 'RUB') {
        return rateUsed > 0 ? (amount * defaultRubRate) / rateUsed : 0;
      }
      return amount;
    };

    const sellCustomRate = r.sell_custom_rate || r.sell_usd_rate;
    const sellUsd = convertPrice(
      Number(r.sell_price || 0),
      r.sell_currency,
      sellCustomRate ? Number(sellCustomRate) : undefined,
    );

    const turnkeyCurrency = r.turnkey_currency || r.sell_currency || 'USD';
    let turnkeyUsd = 0;
    if (r.is_turnkey && Number(r.turnkey_price || 0) > 0) {
      turnkeyUsd = convertPrice(
        Number(r.turnkey_price),
        turnkeyCurrency,
        sellCustomRate ? Number(sellCustomRate) : undefined,
      );
    }

    const speedUpCurrency = r.speed_up_currency || r.sell_currency || 'USD';
    let speedUpUsd = 0;
    if (Number(r.speed_up || 0) > 0) {
      speedUpUsd = convertPrice(
        Number(r.speed_up),
        speedUpCurrency,
        sellCustomRate ? Number(sellCustomRate) : undefined,
      );
    }

    const purchaseCustomRate = r.purchase_custom_rate || r.purchase_usd_rate;
    const purchaseUsd = convertPrice(
      Number(r.purchase_price || 0),
      r.purchase_currency,
      purchaseCustomRate ? Number(purchaseCustomRate) : undefined,
    );

    const additionalExpenseCurrency = r.additional_expense_currency || 'USD';
    let additionalExpenseUsd = 0;
    if (Number(r.additional_expense || 0) > 0) {
      additionalExpenseUsd = convertPrice(
        Number(r.additional_expense),
        additionalExpenseCurrency,
        purchaseCustomRate ? Number(purchaseCustomRate) : undefined,
      );
    }

    const totalIncomeUsd = sellUsd + turnkeyUsd + speedUpUsd;
    const totalOutcomeUsd = purchaseUsd + additionalExpenseUsd;

    const clientName = r.client_first_name
      ? `${r.client_first_name} ${r.client_last_name || ''}`.trim()
      : r.client_company || 'N/A';
    const empName = r.emp_first_name
      ? `${r.emp_first_name} ${r.emp_last_name || ''}`.trim()
      : 'N/A';

    return {
      id: r.id,
      cargo_type: r.cargo_type,
      cargo: r.cargo,
      volume: vol,
      weight: wt,
      is_turnkey: Boolean(r.is_turnkey),
      turnkey_price: Number(r.turnkey_price || 0),
      turnkey_currency: turnkeyCurrency,
      is_speed_up: Boolean(r.is_speed_up || Number(r.speed_up || 0) > 0),
      speed_up: Number(r.speed_up || 0),
      speed_up_price: Number(r.speed_up || 0),
      speed_up_currency: speedUpCurrency,
      additional_expense: Number(r.additional_expense || 0),
      additional_expense_currency: additionalExpenseCurrency,
      total_income_usd: Math.round(totalIncomeUsd * 100) / 100,
      total_outcome_usd: Math.round(totalOutcomeUsd * 100) / 100,
      ...(isDetail
        ? {
            load_code: r.cargo_type === 'LTL' ? r.load_code || null : null,
          }
        : {}),
      container_type: r.container_type || null,
      transport_types:
        r.transport_types ||
        (r.container_type
          ? [
              this.inferTransportType(
                r.container_type,
                r.cargo_type,
                r.container_truck_id,
              ),
            ]
          : ['auto']),
      container_truck_id: r.container_truck_id || null,
      agent_name: r.agent_name || null,
      client: {
        id: r.client_id,
        name: clientName,
      },
      employee: {
        id: r.employee_id,
        name: empName,
      },
      purchase_price: {
        amount: Number(r.purchase_price),
        currency: r.purchase_currency,
        amount_usd: Math.round(purchaseUsd * 100) / 100,
      },
      sell_price: {
        amount: Number(r.sell_price),
        currency: r.sell_currency,
        amount_usd: Math.round(sellUsd * 100) / 100,
      },
      net_yield_usd: Math.round((totalIncomeUsd - totalOutcomeUsd) * 100) / 100,
      status: r.status,
      loaded_date: this.formatDateStr(r.loaded_date),
      arrived_date: this.formatDateStr(r.arrived_date),
      confirmed_date: this.formatDateStr(r.confirmed_date),
      purchase_date: this.formatDateStr(r.purchase_date),
      sell_date: this.formatDateStr(r.sell_date),
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }

  /**
   * Invalidate Redis cache for both consolidations and cargo registrations.
   */
  async invalidateCache(): Promise<void> {
    if (this.redisService) {
      try {
        await this.redisService.delByPattern('cargo_consolidations:*');
        await this.redisService.delByPattern('cargo_registrations:*');
      } catch (err) {
        this.logger.warn(`Redis cache invalidation error: ${err.message}`);
      }
    }
  }

  /**
   * Auto-generates a unique consolidation code in format CNS-YYYYMM-XXXX.
   */
  async generateConsolidationCode(): Promise<string> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `CNS-${yearMonth}-`;

    const latest = await this.knex('cargo_consolidations')
      .where('consolidation_code', 'like', `${prefix}%`)
      .orderBy('consolidation_code', 'desc')
      .first();

    let seq = 1;
    if (latest && latest.consolidation_code) {
      const parts = latest.consolidation_code.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        seq = lastSeq + 1;
      }
    }

    const paddedSeq = String(seq).padStart(4, '0');
    return `${prefix}${paddedSeq}`;
  }

  /**
   * Create a new cargo consolidation (Truck / Container trip).
   */
  async createConsolidation(
    user: { id: string; role?: string },
    dto: CreateCargoConsolidationDto,
  ) {
    let consolidationCode = dto.consolidation_code?.trim();

    if (!consolidationCode) {
      consolidationCode = await this.generateConsolidationCode();
    } else {
      const existing = await this.knex('cargo_consolidations')
        .where('consolidation_code', consolidationCode)
        .first();
      if (existing) {
        throw new BadRequestException({
          message: `Consolidation code "${consolidationCode}" already exists`,
          location: 'consolidation_code_unique',
        });
      }
    }

    // Determine carrier cost in USD
    let carrierCostUsdRate = 1.0;
    const carrierCurrency = dto.carrier_cost_currency || 'USD';
    const costDate = dto.departure_date || this.getTodayDateStr();

    if (carrierCurrency !== 'USD') {
      const rates = await this.currencyService.getRatesForDate(costDate);
      const usdRate = rates['USD']
        ? rates['USD'].rate / (rates['USD'].nominal || 1)
        : 11820.48;
      carrierCostUsdRate = usdRate;
    }

    let consTransportTypes: string[] = ['auto'];
    if (dto.transport_types && dto.transport_types.length > 0) {
      consTransportTypes = dto.transport_types;
    } else if (dto.container_type) {
      consTransportTypes = [
        this.inferTransportType(
          dto.container_type,
          null,
          dto.container_truck_id,
        ),
      ];
    }

    const loadDate = dto.load_date || dto.loaded_date || null;

    const agentCost =
      dto.agent !== undefined
        ? dto.agent
        : dto.total_carrier_cost !== undefined
          ? dto.total_carrier_cost
          : 0;
    const chinaWarehouseCost = dto.china_warehouse || 0;
    const companyServiceCost = dto.company_service || 0;
    const customsClearanceCost = dto.customs_clearance_of_goods || 0;
    const cctCost = dto.cct || 0;
    const totalCarrierCost =
      dto.total_carrier_cost !== undefined ? dto.total_carrier_cost : agentCost;

    const [inserted] = await this.knex('cargo_consolidations')
      .insert({
        consolidation_code: consolidationCode,
        container_truck_id: dto.container_truck_id.trim(),
        container_type: dto.container_type ? dto.container_type.trim() : null,
        transport_types: consTransportTypes,
        max_volume_capacity:
          dto.max_volume_capacity !== undefined
            ? dto.max_volume_capacity
            : null,
        max_weight_capacity:
          dto.max_weight_capacity !== undefined
            ? dto.max_weight_capacity
            : null,
        carrier_name: dto.carrier_name ? dto.carrier_name.trim() : null,
        carrier_phone: dto.carrier_phone ? dto.carrier_phone.trim() : null,
        origin_place: dto.origin_place ? dto.origin_place.trim() : null,
        destination_place: dto.destination_place
          ? dto.destination_place.trim()
          : null,
        load_date: loadDate,
        loaded_date: loadDate,
        border_arrival_date: dto.border_arrival_date || null,
        tashkent_arrival_date: dto.tashkent_arrival_date || null,
        departure_date: dto.departure_date || null,
        estimated_arrival_date: dto.estimated_arrival_date || null,
        arrived_date: dto.arrived_date || null,
        total_carrier_cost: totalCarrierCost,
        agent: agentCost,
        agent_currency: dto.agent_currency || carrierCurrency,
        china_warehouse: chinaWarehouseCost,
        china_warehouse_currency: dto.china_warehouse_currency || 'USD',
        company_service: companyServiceCost,
        company_service_currency: dto.company_service_currency || 'USD',
        customs_clearance_of_goods: customsClearanceCost,
        customs_clearance_of_goods_currency:
          dto.customs_clearance_of_goods_currency || 'USD',
        cct: cctCost,
        cct_currency: dto.cct_currency || 'USD',
        carrier_cost_currency: carrierCurrency,
        carrier_cost_usd_rate: carrierCostUsdRate,
        status: dto.status || 'Waiting',
        description: dto.description || null,
        created_by_user_id: user?.id || null,
      })
      .returning('id');

    const consolidationId =
      typeof inserted === 'object' ? inserted.id : inserted;

    // Attach initial cargos if provided
    if (
      dto.cargo_registration_ids &&
      Array.isArray(dto.cargo_registration_ids) &&
      dto.cargo_registration_ids.length > 0
    ) {
      await this.knex('cargo_registrations')
        .whereIn('id', dto.cargo_registration_ids)
        .update({
          consolidation_id: consolidationId,
          container_truck_id: dto.container_truck_id.trim(),
          agent_name: dto.carrier_name
            ? dto.carrier_name.trim()
            : dto.container_truck_id.trim(),
          transport_types: consTransportTypes,
          origin_city: dto.origin_place ? dto.origin_place.trim() : null,
          destination_city: dto.destination_place
            ? dto.destination_place.trim()
            : null,
          loaded_date: loadDate,
          arrived_date: dto.arrived_date || null,
          status: dto.status || 'Waiting',
          purchase_price: 0,
          purchase_currency: carrierCurrency,
          purchase_usd_rate: carrierCostUsdRate,
        });
    }

    await this.invalidateCache();

    return this.findConsolidationDetails(consolidationId);
  }

  /**
   * Find paginated list of consolidations with aggregated capacity and financial metrics.
   */
  async findAllConsolidations(query: QueryCargoConsolidationDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const offset =
      query.offset !== undefined
        ? Math.max(0, Number(query.offset))
        : (page - 1) * limit;

    const baseWhere = this.knex('cargo_consolidations as cc');

    if (query.status) {
      baseWhere.where('cc.status', query.status);
    }
    if (query.transport_types && query.transport_types.length > 0) {
      baseWhere.whereRaw('cc.transport_types && ?::text[]', [
        query.transport_types,
      ]);
    }
    if (query.search && query.search.trim()) {
      const search = `%${query.search.trim()}%`;
      baseWhere.where((builder) => {
        builder
          .whereILike('cc.consolidation_code', search)
          .orWhereILike('cc.container_truck_id', search)
          .orWhereILike('cc.carrier_name', search)
          .orWhereILike('cc.origin_place', search)
          .orWhereILike('cc.destination_place', search);
      });
    }
    if (query.origin_place) {
      baseWhere.whereILike('cc.origin_place', `%${query.origin_place.trim()}%`);
    }
    if (query.destination_place) {
      baseWhere.whereILike(
        'cc.destination_place',
        `%${query.destination_place.trim()}%`,
      );
    }
    if (query.carrier_name) {
      baseWhere.whereILike('cc.carrier_name', `%${query.carrier_name.trim()}%`);
    }
    if (query.departure_start_date) {
      baseWhere.where('cc.departure_date', '>=', query.departure_start_date);
    }
    if (query.departure_end_date) {
      baseWhere.where('cc.departure_date', '<=', query.departure_end_date);
    }
    if (query.arrived_start_date) {
      baseWhere.where('cc.arrived_date', '>=', query.arrived_start_date);
    }
    if (query.arrived_end_date) {
      baseWhere.where('cc.arrived_date', '<=', query.arrived_end_date);
    }

    const rates = await this.currencyService.getLatestRates();
    const usdObj = rates['USD'] || { rate: 11820.48, nominal: 1 };
    const usdRate = usdObj.rate / (usdObj.nominal || 1);
    const rubObj = rates['RUB'] || { rate: 137.51, nominal: 1 };
    const rubRate = rubObj.rate / (rubObj.nominal || 1);
    const rmbObj = rates['RMB'] ||
      rates['CNY'] || { rate: 1758.76, nominal: 1 };
    const rmbRate = rmbObj.rate / (rmbObj.nominal || 1);

    // Aggregation query: count total, active count, volume capacities, and net margin across matching consolidations
    const innerAggQuery = baseWhere
      .clone()
      .leftJoin('cargo_registrations as cr', 'cc.id', 'cr.consolidation_id')
      .select(
        'cc.id',
        'cc.status',
        'cc.max_volume_capacity',
        this.knex.raw(`
          (
            CASE
              WHEN COALESCE(cc.agent_currency, cc.carrier_cost_currency, 'USD') = 'UZS' AND cc.carrier_cost_usd_rate > 1 THEN COALESCE(cc.agent, CASE WHEN cc.total_carrier_cost > 0 THEN cc.total_carrier_cost ELSE 0 END) / cc.carrier_cost_usd_rate
              WHEN COALESCE(cc.agent_currency, cc.carrier_cost_currency, 'USD') = 'UZS' THEN COALESCE(cc.agent, CASE WHEN cc.total_carrier_cost > 0 THEN cc.total_carrier_cost ELSE 0 END) / ${usdRate}
              WHEN COALESCE(cc.agent_currency, cc.carrier_cost_currency, 'USD') = 'RUB' THEN (COALESCE(cc.agent, CASE WHEN cc.total_carrier_cost > 0 THEN cc.total_carrier_cost ELSE 0 END) * ${rubRate}) / ${usdRate}
              WHEN COALESCE(cc.agent_currency, cc.carrier_cost_currency, 'USD') IN ('RMB', 'CNY') THEN (COALESCE(cc.agent, CASE WHEN cc.total_carrier_cost > 0 THEN cc.total_carrier_cost ELSE 0 END) * ${rmbRate}) / ${usdRate}
              ELSE COALESCE(cc.agent, CASE WHEN cc.total_carrier_cost > 0 THEN cc.total_carrier_cost ELSE 0 END)
            END
            +
            CASE
              WHEN COALESCE(cc.china_warehouse_currency, 'USD') = 'UZS' THEN COALESCE(cc.china_warehouse, 0) / ${usdRate}
              WHEN COALESCE(cc.china_warehouse_currency, 'USD') = 'RUB' THEN (COALESCE(cc.china_warehouse, 0) * ${rubRate}) / ${usdRate}
              WHEN COALESCE(cc.china_warehouse_currency, 'USD') IN ('RMB', 'CNY') THEN (COALESCE(cc.china_warehouse, 0) * ${rmbRate}) / ${usdRate}
              ELSE COALESCE(cc.china_warehouse, 0)
            END
            +
            CASE
              WHEN COALESCE(cc.company_service_currency, 'USD') = 'UZS' THEN COALESCE(cc.company_service, 0) / ${usdRate}
              WHEN COALESCE(cc.company_service_currency, 'USD') = 'RUB' THEN (COALESCE(cc.company_service, 0) * ${rubRate}) / ${usdRate}
              WHEN COALESCE(cc.company_service_currency, 'USD') IN ('RMB', 'CNY') THEN (COALESCE(cc.company_service, 0) * ${rmbRate}) / ${usdRate}
              ELSE COALESCE(cc.company_service, 0)
            END
            +
            CASE
              WHEN COALESCE(cc.customs_clearance_of_goods_currency, 'USD') = 'UZS' THEN COALESCE(cc.customs_clearance_of_goods, 0) / ${usdRate}
              WHEN COALESCE(cc.customs_clearance_of_goods_currency, 'USD') = 'RUB' THEN (COALESCE(cc.customs_clearance_of_goods, 0) * ${rubRate}) / ${usdRate}
              WHEN COALESCE(cc.customs_clearance_of_goods_currency, 'USD') IN ('RMB', 'CNY') THEN (COALESCE(cc.customs_clearance_of_goods, 0) * ${rmbRate}) / ${usdRate}
              ELSE COALESCE(cc.customs_clearance_of_goods, 0)
            END
            +
            CASE
              WHEN COALESCE(cc.cct_currency, 'USD') = 'UZS' THEN COALESCE(cc.cct, 0) / ${usdRate}
              WHEN COALESCE(cc.cct_currency, 'USD') = 'RUB' THEN (COALESCE(cc.cct, 0) * ${rubRate}) / ${usdRate}
              WHEN COALESCE(cc.cct_currency, 'USD') IN ('RMB', 'CNY') THEN (COALESCE(cc.cct, 0) * ${rmbRate}) / ${usdRate}
              ELSE COALESCE(cc.cct, 0)
            END
          ) as total_expenses_usd
        `),
        this.knex.raw(`
          COALESCE(SUM(
            CASE
              WHEN cr.sell_currency = 'USD' THEN cr.sell_price
              WHEN cr.sell_currency = 'UZS' THEN cr.sell_price / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate}), 0)
              WHEN cr.sell_currency IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN cr.sell_price / cr.usd_rmb_rate
              WHEN cr.sell_currency IN ('RMB', 'CNY') THEN (cr.sell_price * ${rmbRate}) / ${usdRate}
              WHEN cr.sell_currency = 'RUB' THEN (cr.sell_price * ${rubRate}) / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate}), 0)
              ELSE 0
            END
            +
            CASE
              WHEN cr.is_turnkey AND cr.turnkey_price > 0 THEN
                CASE
                  WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') = 'USD' THEN cr.turnkey_price
                  WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') = 'UZS' THEN cr.turnkey_price / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate}), 0)
                  WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN cr.turnkey_price / cr.usd_rmb_rate
                  WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') IN ('RMB', 'CNY') THEN (cr.turnkey_price * ${rmbRate}) / ${usdRate}
                  WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') = 'RUB' THEN (cr.turnkey_price * ${rubRate}) / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate}), 0)
                  ELSE cr.turnkey_price
                END
              ELSE 0
            END
            +
            CASE
              WHEN cr.speed_up > 0 THEN
                CASE
                  WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') = 'USD' THEN cr.speed_up
                  WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') = 'UZS' THEN cr.speed_up / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate}), 0)
                  WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN cr.speed_up / cr.usd_rmb_rate
                  WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') IN ('RMB', 'CNY') THEN (cr.speed_up * ${rmbRate}) / ${usdRate}
                  WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') = 'RUB' THEN (cr.speed_up * ${rubRate}) / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate}), 0)
                  ELSE cr.speed_up
                END
              ELSE 0
            END
          ), 0) as total_cargos_sell_usd
        `),
        this.knex.raw(`
          COALESCE(SUM(
            CASE
              WHEN cr.purchase_currency = 'USD' THEN cr.purchase_price
              WHEN cr.purchase_currency = 'UZS' THEN cr.purchase_price / NULLIF(COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, ${usdRate}), 0)
              WHEN cr.purchase_currency IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN cr.purchase_price / cr.usd_rmb_rate
              WHEN cr.purchase_currency IN ('RMB', 'CNY') THEN (cr.purchase_price * ${rmbRate}) / ${usdRate}
              WHEN cr.purchase_currency = 'RUB' THEN (cr.purchase_price * ${rubRate}) / NULLIF(COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, ${usdRate}), 0)
              ELSE 0
            END
            +
            CASE
              WHEN cr.additional_expense > 0 THEN
                CASE
                  WHEN COALESCE(cr.additional_expense_currency, 'USD') = 'USD' THEN cr.additional_expense
                  WHEN COALESCE(cr.additional_expense_currency, 'USD') = 'UZS' THEN cr.additional_expense / NULLIF(COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, ${usdRate}), 0)
                  WHEN COALESCE(cr.additional_expense_currency, 'USD') IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN cr.additional_expense / cr.usd_rmb_rate
                  WHEN COALESCE(cr.additional_expense_currency, 'USD') IN ('RMB', 'CNY') THEN (cr.additional_expense * ${rmbRate}) / ${usdRate}
                  WHEN COALESCE(cr.additional_expense_currency, 'USD') = 'RUB' THEN (cr.additional_expense * ${rubRate}) / NULLIF(COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, ${usdRate}), 0)
                  ELSE cr.additional_expense
                END
              ELSE 0
            END
          ), 0) as total_cargos_purchase_usd
        `),
        this.knex.raw(`
          COALESCE(SUM(CASE WHEN cr.cargo_type = 'LTL' THEN cr.volume ELSE 0 END), 0) as total_assigned_volume
        `),
      )
      .groupBy('cc.id');

    const aggQuery = this.knex(innerAggQuery.as('t')).select(
      this.knex.raw('COUNT(t.id) as total_count'),
      this.knex.raw(
        "COALESCE(SUM(CASE WHEN COALESCE(t.status, 'Waiting') NOT IN ('Arrived') THEN 1 ELSE 0 END), 0) as total_active",
      ),
      this.knex.raw(
        'COALESCE(SUM(t.total_cargos_sell_usd - t.total_expenses_usd), 0) as total_net_margin_usd',
      ),
      this.knex.raw(
        'COALESCE(SUM(t.max_volume_capacity), 0) as volume_capacity_total',
      ),
      this.knex.raw(
        'COALESCE(SUM(t.total_assigned_volume), 0) as volume_capacity_used',
      ),
    );

    const aggResult = await aggQuery.first();
    const total = parseInt(
      (aggResult?.total_count as string) || (aggResult?.total as string) || '0',
      10,
    );
    const totalActive = parseInt(
      (aggResult?.total_active as string) || '0',
      10,
    );
    const totalNetMarginUsd = Number(aggResult?.total_net_margin_usd || 0);
    const volumeCapacityTotal =
      Math.round(Number(aggResult?.volume_capacity_total || 0) * 100) / 100;
    const volumeCapacityUsed =
      Math.round(Number(aggResult?.volume_capacity_used || 0) * 100) / 100;

    const totalNetMarginUzs = totalNetMarginUsd * usdRate;
    const totalNetMarginRub = rubRate > 0 ? totalNetMarginUzs / rubRate : 0;
    const totalNetMarginRmb = rmbRate > 0 ? totalNetMarginUzs / rmbRate : 0;

    const consolidatedNetMarginAll = {
      USD: Math.round(totalNetMarginUsd * 100) / 100,
      UZS: Math.round(totalNetMarginUzs * 100) / 100,
      RUB: Math.round(totalNetMarginRub * 100) / 100,
      RMB: Math.round(totalNetMarginRmb * 100) / 100,
    };

    let rows: any[] = [];
    if (total > 0) {
      const paginatedQuery = baseWhere
        .clone()
        .leftJoin('cargo_registrations as cr', 'cc.id', 'cr.consolidation_id')
        .select(
          'cc.id',
          'cc.consolidation_code',
          'cc.container_truck_id',
          'cc.container_type',
          'cc.transport_types',
          'cc.max_volume_capacity',
          'cc.max_weight_capacity',
          'cc.carrier_name',
          'cc.carrier_phone',
          'cc.origin_place',
          'cc.destination_place',
          'cc.loaded_date',
          'cc.departure_date',
          'cc.estimated_arrival_date',
          'cc.arrived_date',
          'cc.total_carrier_cost',
          'cc.agent',
          'cc.agent_currency',
          'cc.china_warehouse',
          'cc.china_warehouse_currency',
          'cc.company_service',
          'cc.company_service_currency',
          'cc.customs_clearance_of_goods',
          'cc.customs_clearance_of_goods_currency',
          'cc.cct',
          'cc.cct_currency',
          'cc.carrier_cost_currency',
          'cc.carrier_cost_usd_rate',
          'cc.status',
          'cc.description',
          'cc.created_at',
          'cc.updated_at',
          this.knex.raw('COUNT(cr.id) as total_cargos_count'),
          this.knex.raw(
            "COALESCE(SUM(CASE WHEN cr.cargo_type = 'LTL' THEN cr.volume ELSE 0 END), 0) as total_assigned_volume",
          ),
          this.knex.raw(
            "COALESCE(SUM(CASE WHEN cr.cargo_type = 'LTL' THEN cr.weight ELSE 0 END), 0) as total_assigned_weight",
          ),
          this.knex.raw(`
            COALESCE(SUM(
              CASE
                WHEN cr.sell_currency = 'USD' THEN cr.sell_price
                WHEN cr.sell_currency = 'UZS' THEN cr.sell_price / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate}), 0)
                WHEN cr.sell_currency IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN cr.sell_price / cr.usd_rmb_rate
                WHEN cr.sell_currency IN ('RMB', 'CNY') THEN (cr.sell_price * ${rmbRate}) / ${usdRate}
                WHEN cr.sell_currency = 'RUB' THEN (cr.sell_price * ${rubRate}) / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate}), 0)
                ELSE 0
              END
              +
              CASE
                WHEN cr.is_turnkey AND cr.turnkey_price > 0 THEN
                  CASE
                    WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') = 'USD' THEN cr.turnkey_price
                    WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') = 'UZS' THEN cr.turnkey_price / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate}), 0)
                    WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN cr.turnkey_price / cr.usd_rmb_rate
                    WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') IN ('RMB', 'CNY') THEN (cr.turnkey_price * ${rmbRate}) / ${usdRate}
                    WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') = 'RUB' THEN (cr.turnkey_price * ${rubRate}) / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate}), 0)
                    ELSE cr.turnkey_price
                  END
                ELSE 0
              END
              +
              CASE
                WHEN cr.speed_up > 0 THEN
                  CASE
                    WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') = 'USD' THEN cr.speed_up
                    WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') = 'UZS' THEN cr.speed_up / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate}), 0)
                    WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN cr.speed_up / cr.usd_rmb_rate
                    WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') IN ('RMB', 'CNY') THEN (cr.speed_up * ${rmbRate}) / ${usdRate}
                    WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') = 'RUB' THEN (cr.speed_up * ${rubRate}) / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate}), 0)
                    ELSE cr.speed_up
                  END
                ELSE 0
              END
            ), 0) as total_cargos_sell_usd
          `),
          this.knex.raw(`
            COALESCE(SUM(
              CASE
                WHEN cr.purchase_currency = 'USD' THEN cr.purchase_price
                WHEN cr.purchase_currency = 'UZS' THEN cr.purchase_price / NULLIF(COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, ${usdRate}), 0)
                WHEN cr.purchase_currency IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN cr.purchase_price / cr.usd_rmb_rate
                WHEN cr.purchase_currency IN ('RMB', 'CNY') THEN (cr.purchase_price * ${rmbRate}) / ${usdRate}
                WHEN cr.purchase_currency = 'RUB' THEN (cr.purchase_price * ${rubRate}) / NULLIF(COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, ${usdRate}), 0)
                ELSE 0
              END
              +
              CASE
                WHEN cr.additional_expense > 0 THEN
                  CASE
                    WHEN COALESCE(cr.additional_expense_currency, 'USD') = 'USD' THEN cr.additional_expense
                    WHEN COALESCE(cr.additional_expense_currency, 'USD') = 'UZS' THEN cr.additional_expense / NULLIF(COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, ${usdRate}), 0)
                    WHEN COALESCE(cr.additional_expense_currency, 'USD') IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN cr.additional_expense / cr.usd_rmb_rate
                    WHEN COALESCE(cr.additional_expense_currency, 'USD') IN ('RMB', 'CNY') THEN (cr.additional_expense * ${rmbRate}) / ${usdRate}
                    WHEN COALESCE(cr.additional_expense_currency, 'USD') = 'RUB' THEN (cr.additional_expense * ${rubRate}) / NULLIF(COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, ${usdRate}), 0)
                    ELSE cr.additional_expense
                  END
                ELSE 0
              END
            ), 0) as total_cargos_purchase_usd
          `),
        )
        .groupBy('cc.id');

      const sortField = query.sort_by || 'created_at';
      const sortOrder = (
        query.sort_order ||
        query.order ||
        'DESC'
      ).toUpperCase();

      paginatedQuery.orderBy(`cc.${sortField}`, sortOrder as any);

      rows = await paginatedQuery.limit(limit).offset(offset);
    }

    const formattedData = rows.map((r) => {
      const maxVolume = r.max_volume_capacity
        ? Number(r.max_volume_capacity)
        : null;
      const maxWeight = r.max_weight_capacity
        ? Number(r.max_weight_capacity)
        : null;
      const assignedVolume = Number(r.total_assigned_volume || 0);
      const assignedWeight = Number(r.total_assigned_weight || 0);
      const totalCargosCount = Number(r.total_cargos_count || 0);

      const volumeUtilizationPercent =
        maxVolume && maxVolume > 0
          ? Math.round((assignedVolume / maxVolume) * 10000) / 100
          : null;
      const weightUtilizationPercent =
        maxWeight && maxWeight > 0
          ? Math.round((assignedWeight / maxWeight) * 10000) / 100
          : null;

      const remainingVolume =
        maxVolume && maxVolume > 0
          ? Math.round(Math.max(0, maxVolume - assignedVolume) * 10000) / 10000
          : null;
      const remainingWeight =
        maxWeight && maxWeight > 0
          ? Math.round(Math.max(0, maxWeight - assignedWeight) * 10000) / 10000
          : null;

      const exp = this.computeConsolidationExpenses(r, rates);
      const cargosSellUsd =
        Math.round(Number(r.total_cargos_sell_usd || 0) * 100) / 100;
      const incomeUsd = cargosSellUsd;
      const outcomeUsd = exp.total_usd;
      const netMarginUsd = Math.round((incomeUsd - outcomeUsd) * 100) / 100;

      return {
        id: r.id,
        consolidation_code: r.consolidation_code,
        container_truck_id: r.container_truck_id,
        container_type: r.container_type,
        transport_types:
          r.transport_types ||
          (r.container_type
            ? [
                this.inferTransportType(
                  r.container_type,
                  null,
                  r.container_truck_id,
                ),
              ]
            : ['auto']),
        status: r.status,
        carrier_name: r.carrier_name,
        carrier_phone: r.carrier_phone,
        origin_place: r.origin_place,
        destination_place: r.destination_place,
        loaded_date: this.formatDateStr(r.loaded_date),
        departure_date: this.formatDateStr(r.departure_date),
        estimated_arrival_date: this.formatDateStr(r.estimated_arrival_date),
        arrived_date: this.formatDateStr(r.arrived_date),
        capacity: {
          max_volume_m3: maxVolume,
          assigned_volume_m3: assignedVolume,
          remaining_volume_m3: remainingVolume,
          volume_utilization_percent: volumeUtilizationPercent,
          max_weight_kg: maxWeight,
          assigned_weight_kg: assignedWeight,
          remaining_weight_kg: remainingWeight,
          weight_utilization_percent: weightUtilizationPercent,
          total_cargos_count: totalCargosCount,
        },
        financials: {
          income: incomeUsd,
          income_usd: incomeUsd,
          total_income_usd: incomeUsd,
          total_sell_usd: incomeUsd,
          outcome: exp.total_usd,
          outcome_usd: outcomeUsd,
          total_outcome_usd: outcomeUsd,
          total_purchase_usd: 0,
          expenses: {
            agent: {
              amount: exp.agent,
              currency: exp.agent_currency,
              amount_usd: exp.agent_usd,
            },
            china_warehouse: {
              amount: exp.china_warehouse,
              currency: exp.china_warehouse_currency,
              amount_usd: exp.china_warehouse_usd,
            },
            company_service: {
              amount: exp.company_service,
              currency: exp.company_service_currency,
              amount_usd: exp.company_service_usd,
            },
            customs_clearance_of_goods: {
              amount: exp.customs_clearance_of_goods,
              currency: exp.customs_clearance_of_goods_currency,
              amount_usd: exp.customs_clearance_of_goods_usd,
            },
            cct: {
              amount: exp.cct,
              currency: exp.cct_currency,
              amount_usd: exp.cct_usd,
            },
            total_usd: exp.total_usd,
          },
          consolidated_net_margin: {
            amount: netMarginUsd,
            currency: 'USD',
          },
          net_margin_usd: netMarginUsd,
          net_profit_usd: netMarginUsd,
        },
        description: r.description,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });

    return {
      meta: {
        total,
        total_active: totalActive,
        volume_capacity_total: volumeCapacityTotal,
        volume_capacity_used: volumeCapacityUsed,
        limit,
        offset,
        consolidated_net_margin: consolidatedNetMarginAll,
      },
      data: formattedData,
    };
  }

  /**
   * Lightweight endpoint designed specifically for UI "Search or Create Dropdown".
   * Returns active/open consolidations with remaining volume/weight capacity and human-readable label.
   */
  async getActiveDropdownList(search?: string) {
    const query = this.knex('cargo_consolidations as cc')
      .leftJoin('cargo_registrations as cr', 'cc.id', 'cr.consolidation_id')
      .select(
        'cc.id',
        'cc.consolidation_code',
        'cc.container_truck_id',
        'cc.container_type',
        'cc.transport_types',
        'cc.max_volume_capacity',
        'cc.max_weight_capacity',
        'cc.carrier_name',
        'cc.origin_place',
        'cc.destination_place',
        'cc.departure_date',
        'cc.status',
        this.knex.raw('COUNT(cr.id) as total_cargos_count'),
        this.knex.raw(
          "COALESCE(SUM(CASE WHEN cr.cargo_type = 'LTL' THEN cr.volume ELSE 0 END), 0) as total_assigned_volume",
        ),
        this.knex.raw(
          "COALESCE(SUM(CASE WHEN cr.cargo_type = 'LTL' THEN cr.weight ELSE 0 END), 0) as total_assigned_weight",
        ),
      )
      .whereNotIn('cc.status', ['Arrived'])
      .groupBy('cc.id')
      .orderBy('cc.created_at', 'desc')
      .limit(50);

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query.andWhere((builder) => {
        builder
          .whereILike('cc.container_truck_id', term)
          .orWhereILike('cc.consolidation_code', term)
          .orWhereILike('cc.carrier_name', term)
          .orWhereILike('cc.origin_place', term)
          .orWhereILike('cc.destination_place', term);
      });
    }

    const rows = await query;

    return rows.map((r) => {
      const maxVol = r.max_volume_capacity
        ? Number(r.max_volume_capacity)
        : null;
      const maxWeight = r.max_weight_capacity
        ? Number(r.max_weight_capacity)
        : null;
      const assignedVol = Number(r.total_assigned_volume || 0);
      const assignedWeight = Number(r.total_assigned_weight || 0);
      const remainingVol =
        maxVol && maxVol > 0 ? Math.max(0, maxVol - assignedVol) : null;
      const remainingWeight =
        maxWeight && maxWeight > 0
          ? Math.max(0, maxWeight - assignedWeight)
          : null;
      const volUtilization =
        maxVol && maxVol > 0
          ? Math.round((assignedVol / maxVol) * 10000) / 100
          : null;

      const volDisplay = maxVol
        ? `${assignedVol.toFixed(1)}/${maxVol.toFixed(1)} m³`
        : `${assignedVol.toFixed(1)} m³`;
      const routeDisplay =
        r.origin_place || r.destination_place
          ? ` (${r.origin_place || '?'} -> ${r.destination_place || '?'})`
          : '';

      const label = `${r.container_truck_id} [${r.consolidation_code}] - ${volDisplay}${routeDisplay} • ${r.status}`;

      return {
        id: r.id,
        consolidation_code: r.consolidation_code,
        container_truck_id: r.container_truck_id,
        container_type: r.container_type,
        transport_types:
          r.transport_types ||
          (r.container_type
            ? [
                this.inferTransportType(
                  r.container_type,
                  null,
                  r.container_truck_id,
                ),
              ]
            : ['auto']),
        status: r.status,
        carrier_name: r.carrier_name,
        origin_place: r.origin_place,
        destination_place: r.destination_place,
        departure_date: this.formatDateStr(r.departure_date),
        total_cargos_count: Number(r.total_cargos_count || 0),
        max_volume_capacity: maxVol,
        assigned_volume: assignedVol,
        remaining_volume: remainingVol,
        volume_utilization_percent: volUtilization,
        max_weight_capacity: maxWeight,
        assigned_weight: assignedWeight,
        remaining_weight: remainingWeight,
        label,
      };
    });
  }

  /**
   * Find single consolidation details with list of attached cargos.
   */
  async findConsolidationDetails(id: string) {
    if (!id) {
      throw new NotFoundException({
        message: 'Cargo consolidation not found',
        location: 'consolidation_not_found',
      });
    }

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      );

    const consolidation = await this.knex('cargo_consolidations')
      .where((builder) => {
        if (isUuid) {
          builder.where('id', id);
        } else {
          builder.where('consolidation_code', id);
        }
      })
      .first();

    if (!consolidation) {
      throw new NotFoundException({
        message: 'Cargo consolidation not found',
        location: 'consolidation_not_found',
      });
    }

    // Fetch all attached cargos
    const cargos = await this.knex('cargo_registrations as cr')
      .leftJoin('clients as c', 'cr.client_id', 'c.id')
      .leftJoin('employees as e', 'cr.employee_id', 'e.id')
      .select(
        'cr.*',
        'c.first_name as client_first_name',
        'c.last_name as client_last_name',
        'c.company_name as client_company',
        'e.first_name as emp_first_name',
        'e.last_name as emp_last_name',
      )
      .where('cr.consolidation_id', consolidation.id)
      .orderBy('cr.created_at', 'asc');

    let totalVolume = 0;
    let totalWeight = 0;
    let totalSellUsd = 0;

    const rates = await this.currencyService.getLatestRates();

    const formattedCargos = cargos.map((r) => {
      const vol = r.volume ? Number(r.volume) : 0;
      const wt = r.weight ? Number(r.weight) : 0;
      totalVolume += vol;
      totalWeight += wt;

      const cargoItem = this.formatCargoItem(r, true, rates);
      totalSellUsd += cargoItem.total_income_usd;

      return cargoItem;
    });

    const maxVolume = consolidation.max_volume_capacity
      ? Number(consolidation.max_volume_capacity)
      : null;
    const maxWeight = consolidation.max_weight_capacity
      ? Number(consolidation.max_weight_capacity)
      : null;

    const volumeUtilizationPercent =
      maxVolume && maxVolume > 0
        ? Math.round(((totalVolume * 1.0) / maxVolume) * 10000) / 100
        : null;
    const weightUtilizationPercent =
      maxWeight && maxWeight > 0
        ? Math.round(((totalWeight * 1.0) / maxWeight) * 10000) / 100
        : null;

    const remainingVolume =
      maxVolume && maxVolume > 0
        ? Math.round(Math.max(0, maxVolume - totalVolume) * 10000) / 10000
        : null;
    const remainingWeight =
      maxWeight && maxWeight > 0
        ? Math.round(Math.max(0, maxWeight - totalWeight) * 10000) / 10000
        : null;

    const exp = this.computeConsolidationExpenses(consolidation, rates);
    const incomeUsd = Math.round(totalSellUsd * 100) / 100;
    const outcomeUsd = exp.total_usd;
    const netMarginUsd = Math.round((incomeUsd - outcomeUsd) * 100) / 100;

    return {
      id: consolidation.id,
      consolidation_code: consolidation.consolidation_code,
      container_truck_id: consolidation.container_truck_id,
      container_type: consolidation.container_type,
      transport_types:
        consolidation.transport_types ||
        (consolidation.container_type
          ? [
              this.inferTransportType(
                consolidation.container_type,
                null,
                consolidation.container_truck_id,
              ),
            ]
          : ['auto']),
      status: consolidation.status,
      carrier_name: consolidation.carrier_name,
      carrier_phone: consolidation.carrier_phone,
      origin_place: consolidation.origin_place,
      destination_place: consolidation.destination_place,
      load_date: this.formatDateStr(
        consolidation.load_date || consolidation.loaded_date,
      ),
      loaded_date: this.formatDateStr(
        consolidation.load_date || consolidation.loaded_date,
      ),
      departure_date: this.formatDateStr(consolidation.departure_date),
      border_arrival_date: this.formatDateStr(
        consolidation.border_arrival_date,
      ),
      tashkent_arrival_date: this.formatDateStr(
        consolidation.tashkent_arrival_date,
      ),
      estimated_arrival_date: this.formatDateStr(
        consolidation.estimated_arrival_date,
      ),
      arrived_date: this.formatDateStr(consolidation.arrived_date),
      capacity: {
        max_volume_m3: maxVolume,
        assigned_volume_m3: Math.round(totalVolume * 10000) / 10000,
        remaining_volume_m3: remainingVolume,
        volume_utilization_percent: volumeUtilizationPercent,
        max_weight_kg: maxWeight,
        assigned_weight_kg: Math.round(totalWeight * 10000) / 10000,
        remaining_weight_kg: remainingWeight,
        weight_utilization_percent: weightUtilizationPercent,
        total_cargos_count: formattedCargos.length,
      },
      financials: {
        income: incomeUsd,
        income_usd: incomeUsd,
        total_income_usd: incomeUsd,
        total_sell_usd: incomeUsd,
        outcome: exp.total_usd,
        outcome_usd: outcomeUsd,
        total_outcome_usd: outcomeUsd,
        total_purchase_usd: 0,
        expenses: {
          agent: {
            amount: exp.agent,
            currency: exp.agent_currency,
            amount_usd: exp.agent_usd,
          },
          china_warehouse: {
            amount: exp.china_warehouse,
            currency: exp.china_warehouse_currency,
            amount_usd: exp.china_warehouse_usd,
          },
          company_service: {
            amount: exp.company_service,
            currency: exp.company_service_currency,
            amount_usd: exp.company_service_usd,
          },
          customs_clearance_of_goods: {
            amount: exp.customs_clearance_of_goods,
            currency: exp.customs_clearance_of_goods_currency,
            amount_usd: exp.customs_clearance_of_goods_usd,
          },
          cct: {
            amount: exp.cct,
            currency: exp.cct_currency,
            amount_usd: exp.cct_usd,
          },
          total_usd: exp.total_usd,
        },
        consolidated_net_margin: {
          amount: netMarginUsd,
          currency: 'USD',
        },
        net_margin_usd: netMarginUsd,
        net_profit_usd: netMarginUsd,
      },
      description: consolidation.description,
      cargos: formattedCargos,
      created_at: consolidation.created_at,
      updated_at: consolidation.updated_at,
    };
  }

  /**
   * Update consolidation record with optional sync to attached cargos.
   */
  async updateConsolidation(
    id: string,
    user: { id: string; role?: string },
    dto: UpdateCargoConsolidationDto,
  ) {
    const existing = await this.knex('cargo_consolidations')
      .where('id', id)
      .first();

    if (!existing) {
      throw new NotFoundException({
        message: 'Cargo consolidation not found',
        location: 'consolidation_not_found',
      });
    }

    if (
      dto.consolidation_code &&
      dto.consolidation_code !== existing.consolidation_code
    ) {
      const codeExists = await this.knex('cargo_consolidations')
        .where('consolidation_code', dto.consolidation_code.trim())
        .whereNot('id', id)
        .first();
      if (codeExists) {
        throw new BadRequestException({
          message: `Consolidation code "${dto.consolidation_code}" already in use`,
          location: 'consolidation_code_conflict',
        });
      }
    }

    const updatePayload: Record<string, any> = {
      updated_at: this.knex.fn.now(),
    };

    if (dto.consolidation_code !== undefined)
      updatePayload.consolidation_code = dto.consolidation_code.trim();
    if (dto.container_truck_id !== undefined)
      updatePayload.container_truck_id = dto.container_truck_id.trim();
    if (dto.container_type !== undefined)
      updatePayload.container_type = dto.container_type
        ? dto.container_type.trim()
        : null;
    if (dto.transport_types !== undefined)
      updatePayload.transport_types = dto.transport_types;
    if (dto.max_volume_capacity !== undefined)
      updatePayload.max_volume_capacity = dto.max_volume_capacity;
    if (dto.max_weight_capacity !== undefined)
      updatePayload.max_weight_capacity = dto.max_weight_capacity;
    if (dto.carrier_name !== undefined)
      updatePayload.carrier_name = dto.carrier_name
        ? dto.carrier_name.trim()
        : null;
    if (dto.carrier_phone !== undefined)
      updatePayload.carrier_phone = dto.carrier_phone
        ? dto.carrier_phone.trim()
        : null;
    if (dto.origin_place !== undefined)
      updatePayload.origin_place = dto.origin_place
        ? dto.origin_place.trim()
        : null;
    if (dto.destination_place !== undefined)
      updatePayload.destination_place = dto.destination_place
        ? dto.destination_place.trim()
        : null;
    if (dto.load_date !== undefined) {
      updatePayload.load_date = dto.load_date || null;
      updatePayload.loaded_date = dto.load_date || null;
    } else if (dto.loaded_date !== undefined) {
      updatePayload.loaded_date = dto.loaded_date || null;
      updatePayload.load_date = dto.loaded_date || null;
    }
    if (dto.departure_date !== undefined)
      updatePayload.departure_date = dto.departure_date || null;
    if (dto.border_arrival_date !== undefined)
      updatePayload.border_arrival_date = dto.border_arrival_date || null;
    if (dto.tashkent_arrival_date !== undefined)
      updatePayload.tashkent_arrival_date = dto.tashkent_arrival_date || null;
    if (dto.estimated_arrival_date !== undefined)
      updatePayload.estimated_arrival_date = dto.estimated_arrival_date || null;
    if (dto.arrived_date !== undefined)
      updatePayload.arrived_date = dto.arrived_date || null;
    if (dto.agent !== undefined) {
      updatePayload.agent = dto.agent;
      if (dto.total_carrier_cost === undefined) {
        updatePayload.total_carrier_cost = dto.agent;
      }
    }
    if (dto.agent_currency !== undefined) {
      updatePayload.agent_currency = dto.agent_currency;
      if (dto.carrier_cost_currency === undefined) {
        updatePayload.carrier_cost_currency = dto.agent_currency;
      }
    }
    if (dto.china_warehouse !== undefined)
      updatePayload.china_warehouse = dto.china_warehouse;
    if (dto.china_warehouse_currency !== undefined)
      updatePayload.china_warehouse_currency = dto.china_warehouse_currency;
    if (dto.company_service !== undefined)
      updatePayload.company_service = dto.company_service;
    if (dto.company_service_currency !== undefined)
      updatePayload.company_service_currency = dto.company_service_currency;
    if (dto.customs_clearance_of_goods !== undefined)
      updatePayload.customs_clearance_of_goods = dto.customs_clearance_of_goods;
    if (dto.customs_clearance_of_goods_currency !== undefined)
      updatePayload.customs_clearance_of_goods_currency =
        dto.customs_clearance_of_goods_currency;
    if (dto.cct !== undefined) updatePayload.cct = dto.cct;
    if (dto.cct_currency !== undefined)
      updatePayload.cct_currency = dto.cct_currency;
    if (dto.total_carrier_cost !== undefined) {
      updatePayload.total_carrier_cost = dto.total_carrier_cost;
      if (dto.agent === undefined) {
        updatePayload.agent = dto.total_carrier_cost;
      }
    }
    if (dto.carrier_cost_currency !== undefined) {
      updatePayload.carrier_cost_currency = dto.carrier_cost_currency;
      if (dto.agent_currency === undefined) {
        updatePayload.agent_currency = dto.carrier_cost_currency;
      }
    }
    if (dto.status !== undefined) updatePayload.status = dto.status;
    if (dto.description !== undefined)
      updatePayload.description = dto.description || null;

    await this.knex('cargo_consolidations')
      .where('id', id)
      .update(updatePayload);

    // Sync consolidation fields to attached cargos
    const cargoUpdates: Record<string, any> = {};

    if (dto.container_truck_id !== undefined) {
      cargoUpdates.container_truck_id = dto.container_truck_id.trim();
    }
    if (dto.carrier_name !== undefined) {
      cargoUpdates.agent_name = dto.carrier_name
        ? dto.carrier_name.trim()
        : dto.container_truck_id || existing.container_truck_id;
    }
    if (dto.transport_types !== undefined) {
      cargoUpdates.transport_types = dto.transport_types;
    }
    if (dto.origin_place !== undefined) {
      cargoUpdates.origin_city = dto.origin_place
        ? dto.origin_place.trim()
        : null;
    }
    if (dto.destination_place !== undefined) {
      cargoUpdates.destination_city = dto.destination_place
        ? dto.destination_place.trim()
        : null;
    }
    if (dto.load_date !== undefined || dto.loaded_date !== undefined) {
      cargoUpdates.loaded_date = dto.load_date || dto.loaded_date || null;
    }
    if (dto.arrived_date !== undefined) {
      cargoUpdates.arrived_date = dto.arrived_date || null;
    }
    if (dto.status !== undefined) {
      cargoUpdates.status = dto.status;
    }
    if (dto.carrier_cost_currency !== undefined) {
      cargoUpdates.purchase_currency = dto.carrier_cost_currency;
    }

    // Support legacy explicit sync flags if passed
    if (dto.sync_status_to_cargos && dto.status) {
      cargoUpdates.status = dto.status;
    }
    if (dto.sync_transport_types_to_cargos && dto.transport_types) {
      cargoUpdates.transport_types = dto.transport_types;
    }
    if (dto.sync_dates_to_cargos) {
      if (dto.load_date !== undefined || dto.loaded_date !== undefined)
        cargoUpdates.loaded_date = dto.load_date || dto.loaded_date || null;
      if (dto.arrived_date !== undefined)
        cargoUpdates.arrived_date = dto.arrived_date || null;
    }

    if (Object.keys(cargoUpdates).length > 0) {
      await this.knex('cargo_registrations')
        .where('consolidation_id', id)
        .update(cargoUpdates);
    }

    await this.invalidateCache();

    return this.findConsolidationDetails(id);
  }

  /**
   * Assign multiple cargo registrations to this consolidation.
   */
  async assignCargos(id: string, dto: AssignCargosDto) {
    const consolidation = await this.knex('cargo_consolidations')
      .where('id', id)
      .first();

    if (!consolidation) {
      throw new NotFoundException({
        message: 'Cargo consolidation not found',
        location: 'consolidation_not_found',
      });
    }

    // Verify cargos exist
    const existingCargos = await this.knex('cargo_registrations')
      .whereIn('id', dto.cargo_registration_ids)
      .select('id');

    if (existingCargos.length !== dto.cargo_registration_ids.length) {
      throw new NotFoundException({
        message: 'One or more cargo registrations not found',
        location: 'cargos_not_found',
      });
    }

    const consTransportTypes =
      consolidation.transport_types ||
      (consolidation.container_type
        ? [
            this.inferTransportType(
              consolidation.container_type,
              null,
              consolidation.container_truck_id,
            ),
          ]
        : ['auto']);

    await this.knex('cargo_registrations')
      .whereIn('id', dto.cargo_registration_ids)
      .update({
        consolidation_id: id,
        container_truck_id: consolidation.container_truck_id,
        agent_name:
          consolidation.carrier_name || consolidation.container_truck_id,
        transport_types: consTransportTypes,
        origin_city: consolidation.origin_place || null,
        origin_country: consolidation.origin_country || null,
        origin_country_code: consolidation.origin_country_code || null,
        origin_geoname_id: consolidation.origin_geoname_id || null,
        origin_lat: consolidation.origin_lat || null,
        origin_lng: consolidation.origin_lng || null,
        destination_city: consolidation.destination_place || null,
        destination_country: consolidation.destination_country || null,
        destination_country_code:
          consolidation.destination_country_code || null,
        destination_geoname_id: consolidation.destination_geoname_id || null,
        destination_lat: consolidation.destination_lat || null,
        destination_lng: consolidation.destination_lng || null,
        loaded_date: this.formatDateStr(
          consolidation.load_date || consolidation.loaded_date,
        ),
        arrived_date: this.formatDateStr(consolidation.arrived_date),
        status: consolidation.status || 'Waiting',
        purchase_price: 0,
        purchase_currency: consolidation.carrier_cost_currency || 'USD',
        purchase_usd_rate: Number(consolidation.carrier_cost_usd_rate || 1.0),
      });

    await this.invalidateCache();

    return this.findConsolidationDetails(id);
  }

  /**
   * Remove/unlink cargo registrations from this consolidation.
   */
  async removeCargos(id: string, dto: RemoveCargosDto) {
    const consolidation = await this.knex('cargo_consolidations')
      .where('id', id)
      .first();

    if (!consolidation) {
      throw new NotFoundException({
        message: 'Cargo consolidation not found',
        location: 'consolidation_not_found',
      });
    }

    await this.knex('cargo_registrations')
      .where('consolidation_id', id)
      .whereIn('id', dto.cargo_registration_ids)
      .update({
        consolidation_id: null,
      });

    await this.invalidateCache();

    return this.findConsolidationDetails(id);
  }

  /**
   * Delete consolidation (unlinks attached cargos safely).
   */
  async deleteConsolidation(id: string) {
    const existing = await this.knex('cargo_consolidations')
      .where('id', id)
      .first();

    if (!existing) {
      throw new NotFoundException({
        message: 'Cargo consolidation not found',
        location: 'consolidation_not_found',
      });
    }

    // Unlink cargos
    await this.knex('cargo_registrations')
      .where('consolidation_id', id)
      .update({ consolidation_id: null });

    // Delete consolidation
    await this.knex('cargo_consolidations').where('id', id).del();

    await this.invalidateCache();

    return {
      message: 'Cargo consolidation deleted successfully',
      deleted_id: id,
    };
  }
}
