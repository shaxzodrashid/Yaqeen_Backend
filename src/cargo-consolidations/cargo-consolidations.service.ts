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
   * Helper to format an individual cargo registration attached to a consolidation.
   */
  private formatCargoItem(r: any) {
    const vol =
      r.volume !== null && r.volume !== undefined ? Number(r.volume) : null;
    const wt =
      r.weight !== null && r.weight !== undefined ? Number(r.weight) : null;

    // Sell USD calculation
    let sellUsd = Number(r.sell_price || 0);
    if (r.sell_currency === 'UZS') {
      const rate = r.sell_custom_rate || r.sell_usd_rate || 12850;
      sellUsd = rate > 0 ? sellUsd / rate : 0;
    } else if (
      (r.sell_currency === 'RMB' || r.sell_currency === 'CNY') &&
      r.usd_rmb_rate > 0
    ) {
      sellUsd = sellUsd / r.usd_rmb_rate;
    } else if (r.sell_currency === 'RUB') {
      const rate = r.sell_custom_rate || r.sell_usd_rate || 12850;
      sellUsd = rate > 0 ? (sellUsd * 145.0) / rate : 0;
    }

    // Purchase USD calculation
    let purchaseUsd = Number(r.purchase_price || 0);
    if (r.purchase_currency === 'UZS') {
      const rate = r.purchase_custom_rate || r.purchase_usd_rate || 12850;
      purchaseUsd = rate > 0 ? purchaseUsd / rate : 0;
    } else if (
      (r.purchase_currency === 'RMB' || r.purchase_currency === 'CNY') &&
      r.usd_rmb_rate > 0
    ) {
      purchaseUsd = purchaseUsd / r.usd_rmb_rate;
    } else if (r.purchase_currency === 'RUB') {
      const rate = r.purchase_custom_rate || r.purchase_usd_rate || 12850;
      purchaseUsd = rate > 0 ? (purchaseUsd * 145.0) / rate : 0;
    }

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
      net_yield_usd: Math.round((sellUsd - purchaseUsd) * 100) / 100,
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
      if (carrierCurrency === 'UZS') {
        const usdRate = rates['USD']
          ? rates['USD'].rate / (rates['USD'].nominal || 1)
          : 12850;
        carrierCostUsdRate = usdRate;
      } else if (carrierCurrency === 'RUB') {
        const rubObj = rates['RUB'] || { rate: 145, nominal: 1 };
        carrierCostUsdRate = rubObj.rate / (rubObj.nominal || 1);
      } else if (carrierCurrency === 'RMB' || carrierCurrency === 'CNY') {
        const rmbObj = rates['RMB'] ||
          rates['CNY'] || { rate: 1815, nominal: 1 };
        carrierCostUsdRate = rmbObj.rate / (rmbObj.nominal || 1);
      }
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
        loaded_date: dto.loaded_date || null,
        departure_date: dto.departure_date || null,
        estimated_arrival_date: dto.estimated_arrival_date || null,
        arrived_date: dto.arrived_date || null,
        total_carrier_cost: dto.total_carrier_cost || 0,
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
          transport_types: consTransportTypes,
          ...(dto.container_type
            ? { container_type: dto.container_type.trim() }
            : {}),
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

    // Aggregation query: count total, active count, volume capacities, and net margin across matching consolidations
    const innerAggQuery = baseWhere
      .clone()
      .leftJoin('cargo_registrations as cr', 'cc.id', 'cr.consolidation_id')
      .select(
        'cc.id',
        'cc.status',
        'cc.max_volume_capacity',
        this.knex.raw(`
          CASE
            WHEN cc.carrier_cost_currency = 'UZS' AND cc.carrier_cost_usd_rate > 0 THEN COALESCE(cc.total_carrier_cost, 0) / cc.carrier_cost_usd_rate
            WHEN cc.carrier_cost_currency = 'RUB' AND cc.carrier_cost_usd_rate > 0 THEN (COALESCE(cc.total_carrier_cost, 0) * 145.0) / 12850.0
            WHEN cc.carrier_cost_currency IN ('RMB', 'CNY') AND cc.carrier_cost_usd_rate > 0 THEN (COALESCE(cc.total_carrier_cost, 0) * 1815.0) / 12850.0
            ELSE COALESCE(cc.total_carrier_cost, 0)
          END as carrier_cost_usd
        `),
        this.knex.raw(`
          COALESCE(SUM(
            CASE
              WHEN cr.sell_currency = 'USD' THEN cr.sell_price
              WHEN cr.sell_currency = 'UZS' THEN cr.sell_price / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, 12850), 0)
              WHEN cr.sell_currency IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN cr.sell_price / cr.usd_rmb_rate
              WHEN cr.sell_currency = 'RUB' THEN (cr.sell_price * 145.0) / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, 12850), 0)
              ELSE 0
            END
          ), 0) as total_cargos_sell_usd
        `),
        this.knex.raw(`
          COALESCE(SUM(
            CASE
              WHEN cr.purchase_currency = 'USD' THEN cr.purchase_price
              WHEN cr.purchase_currency = 'UZS' THEN cr.purchase_price / NULLIF(COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, 12850), 0)
              WHEN cr.purchase_currency IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN cr.purchase_price / cr.usd_rmb_rate
              WHEN cr.purchase_currency = 'RUB' THEN (cr.purchase_price * 145.0) / NULLIF(COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, 12850), 0)
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
        'COALESCE(SUM(t.total_cargos_sell_usd - t.total_cargos_purchase_usd - t.carrier_cost_usd), 0) as total_net_margin_usd',
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

    const rates = await this.currencyService.getLatestRates();
    const usdRate = rates['USD']
      ? rates['USD'].rate / (rates['USD'].nominal || 1)
      : 12850;
    const rubRate = rates['RUB']
      ? rates['RUB'].rate / (rates['RUB'].nominal || 1)
      : 145;
    const rmbRate = rates['RMB']
      ? rates['RMB'].rate / (rates['RMB'].nominal || 1)
      : rates['CNY']
        ? rates['CNY'].rate / (rates['CNY'].nominal || 1)
        : 1815;

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
                WHEN cr.sell_currency = 'UZS' THEN cr.sell_price / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, 12850), 0)
                WHEN cr.sell_currency IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN cr.sell_price / cr.usd_rmb_rate
                WHEN cr.sell_currency = 'RUB' THEN (cr.sell_price * 145.0) / NULLIF(COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, 12850), 0)
                ELSE 0
              END
            ), 0) as total_cargos_sell_usd
          `),
          this.knex.raw(`
            COALESCE(SUM(
              CASE
                WHEN cr.purchase_currency = 'USD' THEN cr.purchase_price
                WHEN cr.purchase_currency = 'UZS' THEN cr.purchase_price / NULLIF(COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, 12850), 0)
                WHEN cr.purchase_currency IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN cr.purchase_price / cr.usd_rmb_rate
                WHEN cr.purchase_currency = 'RUB' THEN (cr.purchase_price * 145.0) / NULLIF(COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, 12850), 0)
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

    const cargosByConsolidation = new Map<string, any[]>();
    if (rows.length > 0) {
      const consolidationIds = rows.map((r) => r.id);
      const attachedCargos = await this.knex('cargo_registrations as cr')
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
        .whereIn('cr.consolidation_id', consolidationIds)
        .orderBy('cr.created_at', 'asc');

      for (const cargoRow of attachedCargos) {
        const cId = cargoRow.consolidation_id;
        if (!cargosByConsolidation.has(cId)) {
          cargosByConsolidation.set(cId, []);
        }
        cargosByConsolidation.get(cId)!.push(this.formatCargoItem(cargoRow));
      }
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

      const cargosSellUsd =
        Math.round(Number(r.total_cargos_sell_usd || 0) * 100) / 100;
      const cargosPurchaseUsd =
        Math.round(Number(r.total_cargos_purchase_usd || 0) * 100) / 100;

      // Carrier cost USD equivalent
      let carrierCostUsd = Number(r.total_carrier_cost || 0);
      if (r.carrier_cost_currency === 'UZS' && r.carrier_cost_usd_rate > 0) {
        carrierCostUsd = carrierCostUsd / r.carrier_cost_usd_rate;
      } else if (
        r.carrier_cost_currency === 'RUB' &&
        r.carrier_cost_usd_rate > 0
      ) {
        carrierCostUsd = (carrierCostUsd * 145.0) / 12850.0;
      } else if (
        (r.carrier_cost_currency === 'RMB' ||
          r.carrier_cost_currency === 'CNY') &&
        r.carrier_cost_usd_rate > 0
      ) {
        carrierCostUsd = (carrierCostUsd * 1815.0) / 12850.0;
      }
      carrierCostUsd = Math.round(carrierCostUsd * 100) / 100;

      const netMarginUsd =
        Math.round((cargosSellUsd - cargosPurchaseUsd - carrierCostUsd) * 100) /
        100;

      const assignedCargos = cargosByConsolidation.get(r.id) || [];

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
          total_sell_usd: cargosSellUsd,
          total_purchase_usd: cargosPurchaseUsd,
          carrier_cost: {
            amount: Number(r.total_carrier_cost || 0),
            currency: r.carrier_cost_currency,
            amount_usd: carrierCostUsd,
          },
          consolidated_net_margin: {
            amount: netMarginUsd,
            currency: 'USD',
          },
        },
        description: r.description,
        cargos: assignedCargos,
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
    let totalPurchaseUsd = 0;

    const formattedCargos = cargos.map((r) => {
      const vol = r.volume ? Number(r.volume) : 0;
      const wt = r.weight ? Number(r.weight) : 0;
      totalVolume += vol;
      totalWeight += wt;

      const cargoItem = this.formatCargoItem(r);
      totalSellUsd += cargoItem.sell_price.amount_usd;
      totalPurchaseUsd += cargoItem.purchase_price.amount_usd;

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

    let carrierCostUsd = Number(consolidation.total_carrier_cost || 0);
    if (
      consolidation.carrier_cost_currency === 'UZS' &&
      consolidation.carrier_cost_usd_rate > 0
    ) {
      carrierCostUsd = carrierCostUsd / consolidation.carrier_cost_usd_rate;
    } else if (
      consolidation.carrier_cost_currency === 'RUB' &&
      consolidation.carrier_cost_usd_rate > 0
    ) {
      carrierCostUsd = (carrierCostUsd * 145.0) / 12850.0;
    } else if (
      (consolidation.carrier_cost_currency === 'RMB' ||
        consolidation.carrier_cost_currency === 'CNY') &&
      consolidation.carrier_cost_usd_rate > 0
    ) {
      carrierCostUsd = (carrierCostUsd * 1815.0) / 12850.0;
    }
    carrierCostUsd = Math.round(carrierCostUsd * 100) / 100;

    const consolidatedNetMarginUsd =
      Math.round((totalSellUsd - totalPurchaseUsd - carrierCostUsd) * 100) /
      100;

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
      loaded_date: this.formatDateStr(consolidation.loaded_date),
      departure_date: this.formatDateStr(consolidation.departure_date),
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
        total_sell_usd: Math.round(totalSellUsd * 100) / 100,
        total_purchase_usd: Math.round(totalPurchaseUsd * 100) / 100,
        carrier_cost: {
          amount: Number(consolidation.total_carrier_cost || 0),
          currency: consolidation.carrier_cost_currency,
          amount_usd: carrierCostUsd,
        },
        consolidated_net_margin: {
          amount: consolidatedNetMarginUsd,
          currency: 'USD',
        },
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
    if (dto.loaded_date !== undefined)
      updatePayload.loaded_date = dto.loaded_date || null;
    if (dto.departure_date !== undefined)
      updatePayload.departure_date = dto.departure_date || null;
    if (dto.estimated_arrival_date !== undefined)
      updatePayload.estimated_arrival_date = dto.estimated_arrival_date || null;
    if (dto.arrived_date !== undefined)
      updatePayload.arrived_date = dto.arrived_date || null;
    if (dto.total_carrier_cost !== undefined)
      updatePayload.total_carrier_cost = dto.total_carrier_cost;
    if (dto.carrier_cost_currency !== undefined)
      updatePayload.carrier_cost_currency = dto.carrier_cost_currency;
    if (dto.status !== undefined) updatePayload.status = dto.status;
    if (dto.description !== undefined)
      updatePayload.description = dto.description || null;

    await this.knex('cargo_consolidations')
      .where('id', id)
      .update(updatePayload);

    // Sync to attached cargos if requested
    const cargoUpdates: Record<string, any> = {};

    if (dto.container_truck_id) {
      cargoUpdates.container_truck_id = dto.container_truck_id.trim();
    }
    if (dto.sync_status_to_cargos && dto.status) {
      cargoUpdates.status = dto.status;
    }
    if (dto.sync_transport_types_to_cargos && dto.transport_types) {
      cargoUpdates.transport_types = dto.transport_types;
    }
    if (dto.sync_dates_to_cargos) {
      if (dto.loaded_date !== undefined)
        cargoUpdates.loaded_date = dto.loaded_date || null;
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
        transport_types: consTransportTypes,
        ...(consolidation.container_type
          ? { container_type: consolidation.container_type }
          : {}),
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
