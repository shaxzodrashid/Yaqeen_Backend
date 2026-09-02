import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { CurrencyService } from '../currency/currency.service';
import { RedisService } from '../redis/redis.service';
import { LocationsService } from '../locations/locations.service';
import {
  CreateCargoRegistrationDto,
  UpdateCargoRegistrationDto,
  QueryCargoRegistrationDto,
  CheckDuplicateCargoDto,
  ALLOWED_CONTAINER_TYPES,
  TransportType,
  CARGO_STATUSES,
} from './dto/cargo-registrations.dto';

@Injectable()
export class CargoRegistrationsService {
  private readonly logger = new Logger(CargoRegistrationsService.name);

  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly currencyService: CurrencyService,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly locationsService?: LocationsService,
  ) {}

  /**
   * Infer default transport type from container_type, cargo_type, or truck ID.
   */
  inferTransportType(
    containerType?: string | null,
    cargoType?: string | null,
    truckOrContainerId?: string | null,
  ): TransportType {
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
   * Generates deterministic Redis cache key for cargo registration list queries.
   */
  private getListCacheKey(query: QueryCargoRegistrationDto): string {
    const keys = Object.keys(query).sort();
    const serialized = keys.map((k) => `${k}=${(query as any)[k]}`).join('&');
    return `cargo_registrations:list:${serialized || 'all'}`;
  }

  /**
   * Generates deterministic Redis cache key for cargo registration stats queries.
   */
  private getStatsCacheKey(query: QueryCargoRegistrationDto): string {
    const keys = Object.keys(query).sort();
    const serialized = keys.map((k) => `${k}=${(query as any)[k]}`).join('&');
    return `cargo_registrations:stats:${serialized || 'all'}`;
  }

  /**
   * Invalidate all cargo registration cached responses in Redis.
   */
  async invalidateCache(): Promise<void> {
    if (this.redisService) {
      try {
        await this.redisService.delByPattern('cargo_registrations:*');
      } catch (err) {
        this.logger.warn(`Redis cache invalidation error: ${err.message}`);
      }
    }
  }

  /**
   * Helper to check if a user has "register_for_everyone" permission.
   */
  async checkCanRegisterForEveryone(user: {
    id: string;
    role?: string;
  }): Promise<boolean> {
    if (!user || !user.id) return false;

    // Fetch user role and permissions from DB
    const dbUser = await this.knex('users as u')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .select('u.role', 'r.name as role_name', 'r.permissions')
      .where('u.id', user.id)
      .first();

    if (!dbUser) return false;

    const roleName = dbUser.role_name || dbUser.role || user.role;
    if (roleName === 'CEO' || dbUser.role === 'CEO') {
      return true;
    }

    let permissions = dbUser.permissions;
    if (typeof permissions === 'string') {
      try {
        permissions = JSON.parse(permissions);
      } catch {
        permissions = {};
      }
    }

    const cargoPerms = permissions?.cargo_registrations;
    if (cargoPerms && cargoPerms.register_for_everyone === true) {
      return true;
    }

    // Default system ROP role allows registering for everyone
    if (roleName === 'ROP') {
      return true;
    }

    return false;
  }

  /**
   * Helper to resolve the employee_id associated with a user account.
   */
  async getUserEmployeeId(userId: string): Promise<string | null> {
    const userRow = await this.knex('users')
      .select('employee_id')
      .where('id', userId)
      .first();

    return userRow?.employee_id || null;
  }

  /**
   * Validate LTL / FTL specific fields.
   */
  private validateCargoTypeRules(data: {
    cargo_type: 'LTL' | 'FTL';
    volume?: number | null;
    weight?: number | null;
    container_type?: string | null;
    container_truck_id?: string | null;
    agent_name?: string | null;
    purchase_price?: number | null;
    purchase_currency?: string | null;
    consolidation_id?: string | null;
    new_consolidation?: unknown;
  }) {
    if (data.cargo_type === 'LTL') {
      if (
        data.volume === undefined ||
        data.volume === null ||
        Number(data.volume) <= 0
      ) {
        throw new BadRequestException({
          message:
            'Volume is required and must be greater than 0 for LTL cargo',
          location: 'volume_required_for_ltl',
        });
      }
      if (
        data.weight === undefined ||
        data.weight === null ||
        Number(data.weight) <= 0
      ) {
        throw new BadRequestException({
          message:
            'Weight is required and must be greater than 0 for LTL cargo',
          location: 'weight_required_for_ltl',
        });
      }
      if (!data.consolidation_id && !data.new_consolidation) {
        throw new BadRequestException({
          message:
            'consolidation_id or new_consolidation is required for LTL cargo',
          location: 'consolidation_required_for_ltl',
        });
      }
    } else if (data.cargo_type === 'FTL') {
      if (!data.container_type || !data.container_type.trim()) {
        throw new BadRequestException({
          message: 'Container type is required for FTL cargo',
          location: 'container_type_required_for_ftl',
        });
      }

      const isValidContainer = ALLOWED_CONTAINER_TYPES.includes(
        data.container_type.trim() as any,
      );
      if (!isValidContainer) {
        throw new BadRequestException({
          message: `Invalid container type "${data.container_type}". Allowed types: ${ALLOWED_CONTAINER_TYPES.join(', ')}`,
          location: 'invalid_container_type',
        });
      }

      if (!data.container_truck_id || !data.container_truck_id.trim()) {
        throw new BadRequestException({
          message: 'Container / Truck ID is required for FTL cargo',
          location: 'container_truck_id_required',
        });
      }

      if (!data.agent_name || !data.agent_name.trim()) {
        throw new BadRequestException({
          message: 'Agent / Carrier name is required for FTL cargo',
          location: 'agent_name_required',
        });
      }

      if (
        data.purchase_price === undefined ||
        data.purchase_price === null ||
        Number(data.purchase_price) < 0
      ) {
        throw new BadRequestException({
          message: 'Purchase price is required for FTL cargo',
          location: 'purchase_price_required',
        });
      }

      if (!data.purchase_currency) {
        throw new BadRequestException({
          message: 'Purchase currency is required for FTL cargo',
          location: 'purchase_currency_required',
        });
      }
    }
  }

  private getLocalDateStr(d: Date = new Date()): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Safe helper to format Date objects, date strings, or fallback to YYYY-MM-DD.
   */
  private formatDateStr(d: any): string {
    if (!d) return this.getLocalDateStr();
    if (typeof d === 'string') return d.slice(0, 10);
    if (d instanceof Date) return this.getLocalDateStr(d);
    try {
      const parsed = new Date(d);
      if (isNaN(parsed.getTime())) return this.getLocalDateStr();
      return this.getLocalDateStr(parsed);
    } catch {
      return this.getLocalDateStr();
    }
  }

  /**
   * Validate RMB rate condition.
   */
  private validateRmbRateRule(data: {
    cargo_type: 'LTL' | 'FTL';
    purchase_currency?: string | null;
    sell_currency: string;
    usd_rmb_rate?: number | null;
  }) {
    const isRmbInvolved =
      (data.cargo_type === 'FTL' && data.purchase_currency === 'RMB') ||
      data.sell_currency === 'RMB';

    if (isRmbInvolved) {
      if (
        data.usd_rmb_rate === undefined ||
        data.usd_rmb_rate === null ||
        Number(data.usd_rmb_rate) <= 0
      ) {
        throw new BadRequestException({
          message:
            'USD->RMB rate (usd_rmb_rate) is required when purchase or sell currency is RMB',
          location: 'usd_rmb_rate_required',
        });
      }
    }
  }

  /**
   * Helper to convert an amount in any currency to USD and UZS based on historical/custom rates.
   */
  private convertPriceToUsdAndUzs(
    amount: number,
    currency: string,
    rates: Record<string, any>,
    usdRmbRate?: number | null,
    customRate?: number | null,
  ): { amount_usd: number; amount_uzs: number; usd_rate_used: number } {
    if (amount <= 0) {
      const defaultUsd = rates['USD']
        ? rates['USD'].rate / (rates['USD'].nominal || 1)
        : 11820.48;
      return {
        amount_usd: 0,
        amount_uzs: 0,
        usd_rate_used: customRate || defaultUsd,
      };
    }

    const usdObj = rates['USD'] || { rate: 11820.48, nominal: 1 };
    const defaultUsdRateInUzs = usdObj.rate / (usdObj.nominal || 1);
    const usdRateInUzs =
      customRate && customRate > 0 ? customRate : defaultUsdRateInUzs;

    if (currency === 'USD') {
      const uzs = amount * usdRateInUzs;
      return {
        amount_usd: Math.round(amount * 100) / 100,
        amount_uzs: Math.round(uzs * 100) / 100,
        usd_rate_used: usdRateInUzs,
      };
    }

    if (currency === 'UZS') {
      const usd = usdRateInUzs > 0 ? amount / usdRateInUzs : 0;
      return {
        amount_usd: Math.round(usd * 100) / 100,
        amount_uzs: Math.round(amount * 100) / 100,
        usd_rate_used: usdRateInUzs,
      };
    }

    if (currency === 'RMB' || currency === 'CNY') {
      let usd: number;
      if (usdRmbRate && usdRmbRate > 0) {
        usd = amount / usdRmbRate;
      } else {
        const rmbObj = rates['RMB'] ||
          rates['CNY'] || { rate: 1758.76, nominal: 1 };
        const rmbInUzs = rmbObj.rate / (rmbObj.nominal || 1);
        const totalUzs = amount * rmbInUzs;
        usd = usdRateInUzs > 0 ? totalUzs / usdRateInUzs : 0;
      }
      const uzs = usd * usdRateInUzs;
      return {
        amount_usd: Math.round(usd * 100) / 100,
        amount_uzs: Math.round(uzs * 100) / 100,
        usd_rate_used: usdRateInUzs,
      };
    }

    if (currency === 'RUB') {
      const rubObj = rates['RUB'] || { rate: 137.51, nominal: 1 };
      const rubInUzs = rubObj.rate / (rubObj.nominal || 1);
      const uzs = amount * rubInUzs;
      const usd = usdRateInUzs > 0 ? uzs / usdRateInUzs : 0;
      return {
        amount_usd: Math.round(usd * 100) / 100,
        amount_uzs: Math.round(uzs * 100) / 100,
        usd_rate_used: usdRateInUzs,
      };
    }

    return { amount_usd: 0, amount_uzs: 0, usd_rate_used: usdRateInUzs };
  }

  /**
   * Optional check to detect exact identical duplicate submissions (same client, same truck, exact same cargo, route, and purchase price).
   * Note: Multiple legitimate loads in the same truck and route are fully supported.
   */
  async checkDuplicateCargoRegistration(dto: CheckDuplicateCargoDto) {
    const cargoName = dto.cargo ? dto.cargo.trim().toLowerCase() : '';
    const truckId = dto.container_truck_id
      ? dto.container_truck_id.trim()
      : null;
    const originCity = dto.origin_city
      ? dto.origin_city.trim().toLowerCase()
      : null;
    const destCity = dto.destination_city
      ? dto.destination_city.trim().toLowerCase()
      : null;

    let query = this.knex('cargo_registrations as cr')
      .where('cr.client_id', dto.client_id)
      .whereRaw('LOWER(cr.cargo) = ?', [cargoName]);

    if (truckId) {
      query = query.whereILike('cr.container_truck_id', truckId);
    }
    if (dto.consolidation_id) {
      query = query.where('cr.consolidation_id', dto.consolidation_id);
    }
    if (dto.cargo_type) {
      query = query.where('cr.cargo_type', dto.cargo_type);
    }

    if (dto.purchase_price !== undefined && dto.purchase_price !== null) {
      query = query.where('cr.purchase_price', dto.purchase_price);
    }

    if (dto.origin_geoname_id) {
      query = query.where('cr.origin_geoname_id', dto.origin_geoname_id);
    } else if (originCity) {
      query = query.whereRaw('LOWER(cr.origin_city) = ?', [originCity]);
    }

    if (dto.destination_geoname_id) {
      query = query.where(
        'cr.destination_geoname_id',
        dto.destination_geoname_id,
      );
    } else if (destCity) {
      query = query.whereRaw('LOWER(cr.destination_city) = ?', [destCity]);
    }

    if (dto.confirmed_date) {
      query = query.where('cr.confirmed_date', dto.confirmed_date);
    }

    const existing = await query.first();

    if (existing) {
      const routeStr =
        existing.origin_city && existing.destination_city
          ? ` (${existing.origin_city} -> ${existing.destination_city})`
          : '';
      return {
        is_duplicate: true,
        existing_cargo_id: existing.id,
        message: `An identical cargo entry "${existing.cargo}"${routeStr} with the exact same price and truck was already registered.`,
      };
    }

    return {
      is_duplicate: false,
      existing_cargo_id: null,
      message: null,
    };
  }

  /**
   * Create new cargo registration.
   */
  async createCargoRegistration(
    user: { id: string; role?: string },
    dto: CreateCargoRegistrationDto,
  ) {
    // 0. Idempotency Key check to prevent rapid double-clicks and repeated submissions
    if (dto.idempotency_key && this.redisService) {
      const idempotencyKey = `cargo_registrations:idempotency:${dto.idempotency_key.trim()}`;
      try {
        const cachedId = await this.redisService.get(idempotencyKey);
        if (cachedId) {
          const cachedRecord =
            await this.findCargoRegistrationDetails(cachedId);
          if (cachedRecord) {
            return cachedRecord;
          }
        }
      } catch (err) {
        this.logger.warn(`Idempotency check error: ${err.message}`);
      }
    }

    const canRegisterEveryone = await this.checkCanRegisterForEveryone(user);
    const userEmployeeId = await this.getUserEmployeeId(user.id);

    let finalEmployeeId: string;

    if (canRegisterEveryone) {
      const resolvedEmpId = dto.employee_id || userEmployeeId;
      if (!resolvedEmpId) {
        throw new BadRequestException({
          message: 'employee_id must be provided or linked to current user',
          location: 'employee_id_missing',
        });
      }
      finalEmployeeId = resolvedEmpId;
    } else {
      if (!userEmployeeId) {
        throw new BadRequestException({
          message: 'Current user account is not linked to an employee profile',
          location: 'user_not_linked_to_employee',
        });
      }
      if (dto.employee_id && dto.employee_id !== userEmployeeId) {
        throw new ForbiddenException({
          message:
            'You do not have permission to register cargo for other employees',
          location: 'permission_denied_for_other_employees',
        });
      }
      finalEmployeeId = userEmployeeId;
    }

    // Verify employee exists
    const employeeExists = await this.knex('employees')
      .where('id', finalEmployeeId)
      .first();
    if (!employeeExists) {
      throw new NotFoundException({
        message: 'Assigned employee not found',
        location: 'employee_not_found',
      });
    }

    // Verify client exists
    const clientExists = await this.knex('clients')
      .where('id', dto.client_id)
      .first();
    if (!clientExists) {
      throw new NotFoundException({
        message: 'Client not found',
        location: 'client_not_found',
      });
    }

    // Validate LTL/FTL rules
    this.validateCargoTypeRules({
      cargo_type: dto.cargo_type,
      volume: dto.volume,
      weight: dto.weight,
      container_type: dto.container_type,
      container_truck_id: dto.container_truck_id,
      agent_name: dto.agent_name,
      purchase_price: dto.purchase_price,
      purchase_currency: dto.purchase_currency,
      consolidation_id: dto.consolidation_id,
      new_consolidation: dto.new_consolidation,
    });

    // Validate RMB rate rule
    this.validateRmbRateRule({
      cargo_type: dto.cargo_type,
      purchase_currency: dto.purchase_currency,
      sell_currency: dto.sell_currency,
      usd_rmb_rate: dto.usd_rmb_rate,
    });

    let finalConsolidationId: string | null = null;
    let finalContainerTruckId = '';
    let finalContainerType: string | null = null;
    let finalAgentName = '';
    let finalTransportTypes: string[] = ['auto'];
    let finalOriginPlace = {
      city: null as string | null,
      country: null as string | null,
      country_code: null as string | null,
      geoname_id: null as number | null,
      lat: null as number | null,
      lng: null as number | null,
    };
    let finalDestPlace = {
      city: null as string | null,
      country: null as string | null,
      country_code: null as string | null,
      geoname_id: null as number | null,
      lat: null as number | null,
      lng: null as number | null,
    };
    let finalLoadedDate: string | null = null;
    let finalArrivedDate: string | null = null;
    let finalStatus = 'Waiting';
    let finalPurchasePrice = 0;
    let finalPurchaseCurrency = 'USD';
    let finalPurchaseDate: string | null = null;
    let finalPurchaseUsdRate = 1.0;
    let finalPurchaseCustomRate: number | null = null;

    if (dto.cargo_type === 'LTL') {
      if (dto.new_consolidation) {
        const nc = dto.new_consolidation;
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
          if (!isNaN(lastSeq)) seq = lastSeq + 1;
        }
        const code = `${prefix}${String(seq).padStart(4, '0')}`;

        let consTransportTypes: string[] = ['auto'];
        if (nc.transport_types && nc.transport_types.length > 0) {
          consTransportTypes = nc.transport_types;
        } else if (nc.container_type) {
          consTransportTypes = [
            this.inferTransportType(
              nc.container_type,
              null,
              nc.container_truck_id,
            ),
          ];
        }

        let ncOrigin = {
          city: nc.origin_place ? nc.origin_place.trim() : null,
          country: nc.origin_country ? nc.origin_country.trim() : null,
          country_code: nc.origin_country_code
            ? nc.origin_country_code.trim().toUpperCase()
            : null,
          geoname_id: nc.origin_geoname_id || null,
          lat: nc.origin_lat || null,
          lng: nc.origin_lng || null,
        };

        let ncDest = {
          city: nc.destination_place ? nc.destination_place.trim() : null,
          country: nc.destination_country
            ? nc.destination_country.trim()
            : null,
          country_code: nc.destination_country_code
            ? nc.destination_country_code.trim().toUpperCase()
            : null,
          geoname_id: nc.destination_geoname_id || null,
          lat: nc.destination_lat || null,
          lng: nc.destination_lng || null,
        };

        if (this.locationsService) {
          if (nc.origin_place || nc.origin_geoname_id) {
            ncOrigin = await this.locationsService.normalizeAndResolvePlace({
              city: nc.origin_place,
              country: nc.origin_country,
              country_code: nc.origin_country_code,
              geoname_id: nc.origin_geoname_id,
              lat: nc.origin_lat,
              lng: nc.origin_lng,
            });
          }
          if (nc.destination_place || nc.destination_geoname_id) {
            ncDest = await this.locationsService.normalizeAndResolvePlace({
              city: nc.destination_place,
              country: nc.destination_country,
              country_code: nc.destination_country_code,
              geoname_id: nc.destination_geoname_id,
              lat: nc.destination_lat,
              lng: nc.destination_lng,
            });
          }
        }

        const costCurrency = nc.carrier_cost_currency || 'USD';
        let costUsdRate = 1.0;
        const departureDate =
          nc.departure_date || this.formatDateStr(dto.confirmed_date);
        if (costCurrency !== 'USD') {
          const rates =
            await this.currencyService.getRatesForDate(departureDate);
          const usdRate = rates['USD']
            ? rates['USD'].rate / (rates['USD'].nominal || 1)
            : 11820.48;
          costUsdRate = usdRate;
        }

        const loadDate = nc.load_date || nc.loaded_date || null;

        const [newConsInserted] = await this.knex('cargo_consolidations')
          .insert({
            consolidation_code: code,
            container_truck_id: nc.container_truck_id.trim(),
            container_type: nc.container_type ? nc.container_type.trim() : null,
            transport_types: consTransportTypes,
            max_volume_capacity:
              nc.max_volume_capacity !== undefined
                ? nc.max_volume_capacity
                : null,
            max_weight_capacity:
              nc.max_weight_capacity !== undefined
                ? nc.max_weight_capacity
                : null,
            carrier_name: nc.carrier_name ? nc.carrier_name.trim() : null,
            carrier_phone: nc.carrier_phone ? nc.carrier_phone.trim() : null,
            origin_place: ncOrigin.city,
            origin_country: ncOrigin.country,
            origin_country_code: ncOrigin.country_code,
            origin_geoname_id: ncOrigin.geoname_id,
            origin_lat: ncOrigin.lat,
            origin_lng: ncOrigin.lng,
            destination_place: ncDest.city,
            destination_country: ncDest.country,
            destination_country_code: ncDest.country_code,
            destination_geoname_id: ncDest.geoname_id,
            destination_lat: ncDest.lat,
            destination_lng: ncDest.lng,
            load_date: loadDate,
            loaded_date: loadDate,
            departure_date: nc.departure_date || null,
            border_arrival_date: nc.border_arrival_date || null,
            tashkent_arrival_date: nc.tashkent_arrival_date || null,
            estimated_arrival_date: nc.estimated_arrival_date || null,
            arrived_date: nc.arrived_date || null,
            total_carrier_cost:
              nc.total_carrier_cost !== undefined
                ? nc.total_carrier_cost
                : nc.agent || 0,
            agent:
              nc.agent !== undefined ? nc.agent : nc.total_carrier_cost || 0,
            agent_currency: nc.agent_currency || costCurrency,
            customs_clearance_of_goods:
              nc.customs_clearance_of_goods !== undefined
                ? nc.customs_clearance_of_goods
                : nc.tomojnya !== undefined
                  ? nc.tomojnya
                  : nc.tamojnya || 0,
            customs_clearance_of_goods_currency:
              nc.customs_clearance_of_goods_currency ||
              nc.tomojnya_currency ||
              nc.tamojnya_currency ||
              'USD',
            cct: nc.cct !== undefined ? nc.cct : nc.certificate || 0,
            cct_currency: nc.cct_currency || nc.certificate_currency || 'USD',
            carrier_cost_currency: costCurrency,
            carrier_cost_usd_rate: costUsdRate,
            status: nc.status || 'Waiting',
            description: nc.description || null,
            created_by_user_id: user?.id || null,
          })
          .returning('id');

        finalConsolidationId =
          typeof newConsInserted === 'object'
            ? newConsInserted.id
            : newConsInserted;
        finalContainerTruckId = nc.container_truck_id.trim();
        finalAgentName = nc.carrier_name
          ? nc.carrier_name.trim()
          : nc.container_truck_id.trim();
        finalTransportTypes = consTransportTypes;
        finalOriginPlace = ncOrigin;
        finalDestPlace = ncDest;
        finalLoadedDate = this.formatDateStr(loadDate);
        finalArrivedDate = this.formatDateStr(nc.arrived_date);
        finalStatus = nc.status || 'Waiting';
        finalPurchasePrice = 0;
        finalPurchaseCurrency = costCurrency;
        finalPurchaseDate = this.formatDateStr(
          nc.load_date || nc.departure_date || dto.confirmed_date,
        );
        finalPurchaseUsdRate = costUsdRate;
      } else if (dto.consolidation_id) {
        const consolidation = await this.knex('cargo_consolidations')
          .where('id', dto.consolidation_id)
          .first();
        if (!consolidation) {
          throw new NotFoundException({
            message: 'Selected cargo consolidation truck not found',
            location: 'consolidation_not_found',
          });
        }
        finalConsolidationId = consolidation.id;
        finalContainerTruckId = consolidation.container_truck_id;
        finalAgentName =
          consolidation.carrier_name || consolidation.container_truck_id;
        finalTransportTypes =
          consolidation.transport_types &&
          consolidation.transport_types.length > 0
            ? consolidation.transport_types
            : [
                this.inferTransportType(
                  consolidation.container_type,
                  null,
                  consolidation.container_truck_id,
                ),
              ];
        finalOriginPlace = {
          city: consolidation.origin_place || null,
          country: consolidation.origin_country || null,
          country_code: consolidation.origin_country_code || null,
          geoname_id: consolidation.origin_geoname_id || null,
          lat: consolidation.origin_lat || null,
          lng: consolidation.origin_lng || null,
        };
        finalDestPlace = {
          city: consolidation.destination_place || null,
          country: consolidation.destination_country || null,
          country_code: consolidation.destination_country_code || null,
          geoname_id: consolidation.destination_geoname_id || null,
          lat: consolidation.destination_lat || null,
          lng: consolidation.destination_lng || null,
        };
        finalLoadedDate = this.formatDateStr(
          consolidation.load_date || consolidation.loaded_date,
        );
        finalArrivedDate = this.formatDateStr(consolidation.arrived_date);
        finalStatus = consolidation.status || 'Waiting';
        finalPurchasePrice = 0;
        finalPurchaseCurrency = consolidation.carrier_cost_currency || 'USD';
        finalPurchaseDate = this.formatDateStr(
          consolidation.load_date ||
            consolidation.departure_date ||
            dto.confirmed_date,
        );
        finalPurchaseUsdRate = Number(
          consolidation.carrier_cost_usd_rate || 1.0,
        );
      }
    } else {
      // FTL flow
      finalContainerTruckId = dto.container_truck_id!.trim();
      finalContainerType = dto.container_type!.trim();
      finalAgentName = dto.agent_name!.trim();
      finalStatus = dto.status || 'Waiting';
      finalLoadedDate = dto.loaded_date
        ? this.formatDateStr(dto.loaded_date)
        : null;
      finalArrivedDate = dto.arrived_date
        ? this.formatDateStr(dto.arrived_date)
        : null;
      finalPurchasePrice = dto.purchase_price!;
      finalPurchaseCurrency = dto.purchase_currency!;
      finalPurchaseDate = this.formatDateStr(
        dto.purchase_date || dto.confirmed_date,
      );
      finalPurchaseCustomRate = dto.purchase_exchange_rate || null;

      if (dto.transport_types && dto.transport_types.length > 0) {
        finalTransportTypes = dto.transport_types;
      } else {
        finalTransportTypes = [
          this.inferTransportType(
            finalContainerType,
            dto.cargo_type,
            finalContainerTruckId,
          ),
        ];
      }

      // Resolve Origin & Destination for FTL
      let originPlace = {
        city: dto.origin_city ? dto.origin_city.trim() : null,
        country: dto.origin_country ? dto.origin_country.trim() : null,
        country_code: dto.origin_country_code
          ? dto.origin_country_code.trim().toUpperCase()
          : null,
        geoname_id: dto.origin_geoname_id || null,
        lat: dto.origin_lat || null,
        lng: dto.origin_lng || null,
      };

      let destPlace = {
        city: dto.destination_city ? dto.destination_city.trim() : null,
        country: dto.destination_country
          ? dto.destination_country.trim()
          : null,
        country_code: dto.destination_country_code
          ? dto.destination_country_code.trim().toUpperCase()
          : null,
        geoname_id: dto.destination_geoname_id || null,
        lat: dto.destination_lat || null,
        lng: dto.destination_lng || null,
      };

      if (this.locationsService) {
        if (dto.origin_city || dto.origin_geoname_id) {
          originPlace = await this.locationsService.normalizeAndResolvePlace({
            city: dto.origin_city,
            country: dto.origin_country,
            country_code: dto.origin_country_code,
            geoname_id: dto.origin_geoname_id,
            lat: dto.origin_lat,
            lng: dto.origin_lng,
          });
        }
        if (dto.destination_city || dto.destination_geoname_id) {
          destPlace = await this.locationsService.normalizeAndResolvePlace({
            city: dto.destination_city,
            country: dto.destination_country,
            country_code: dto.destination_country_code,
            geoname_id: dto.destination_geoname_id,
            lat: dto.destination_lat,
            lng: dto.destination_lng,
          });
        }
      }
      finalOriginPlace = originPlace;
      finalDestPlace = destPlace;

      const purchaseRates =
        await this.currencyService.getRatesForDate(finalPurchaseDate);
      const purchaseRes = this.convertPriceToUsdAndUzs(
        finalPurchasePrice,
        finalPurchaseCurrency,
        purchaseRates,
        dto.usd_rmb_rate,
        finalPurchaseCustomRate,
      );
      finalPurchaseUsdRate = purchaseRes.usd_rate_used;
    }

    const sellDate = this.formatDateStr(dto.sell_date);
    const sellRates = await this.currencyService.getRatesForDate(sellDate);
    const sellRes = this.convertPriceToUsdAndUzs(
      dto.sell_price,
      dto.sell_currency,
      sellRates,
      dto.usd_rmb_rate,
      dto.sell_exchange_rate,
    );

    // Duplicate Prevention: Check if duplicate prevention is requested or enabled
    if (dto.prevent_duplicate) {
      const dupCheck = await this.checkDuplicateCargoRegistration({
        client_id: dto.client_id,
        container_truck_id: finalContainerTruckId,
        consolidation_id: finalConsolidationId || undefined,
        cargo: dto.cargo,
        cargo_type: dto.cargo_type,
        origin_city: finalOriginPlace.city || undefined,
        origin_geoname_id: finalOriginPlace.geoname_id || undefined,
        destination_city: finalDestPlace.city || undefined,
        destination_geoname_id: finalDestPlace.geoname_id || undefined,
        confirmed_date: dto.confirmed_date,
        purchase_price: finalPurchasePrice,
      });

      if (dupCheck.is_duplicate) {
        throw new BadRequestException({
          message:
            dupCheck.message ||
            'Duplicate cargo registration detected for this client and route',
          location: 'duplicate_cargo_detected',
          existing_cargo_id: dupCheck.existing_cargo_id,
        });
      }
    }

    const isTurnkey =
      dto.is_turnkey !== undefined ? Boolean(dto.is_turnkey) : false;
    let turnkeyPrice = 0;
    const turnkeyCurrency = dto.turnkey_currency || dto.sell_currency || 'USD';
    if (isTurnkey) {
      if (
        dto.turnkey_price === undefined ||
        dto.turnkey_price === null ||
        Number(dto.turnkey_price) <= 0
      ) {
        throw new BadRequestException({
          message:
            'turnkey_price is required and must be greater than 0 when is_turnkey is true',
          location: 'turnkey_price_required',
        });
      }
      turnkeyPrice = Number(dto.turnkey_price);
    }

    const rawSpeedUp =
      dto.speed_up !== undefined
        ? Number(dto.speed_up)
        : dto.speed_up_price !== undefined
          ? Number(dto.speed_up_price)
          : 0;
    const isSpeedUp =
      dto.is_speed_up !== undefined ? Boolean(dto.is_speed_up) : rawSpeedUp > 0;
    const speedUp = isSpeedUp ? rawSpeedUp : 0;
    const speedUpCurrency = dto.speed_up_currency || dto.sell_currency || 'USD';

    const additionalExpense =
      dto.additional_expense !== undefined ? Number(dto.additional_expense) : 0;
    const additionalExpenseCurrency = dto.additional_expense_currency || 'USD';

    const [inserted] = await this.knex('cargo_registrations')
      .insert({
        cargo_type: dto.cargo_type,
        volume: dto.cargo_type === 'LTL' ? dto.volume : null,
        weight: dto.cargo_type === 'LTL' ? dto.weight : null,
        load_code:
          dto.cargo_type === 'LTL' && dto.load_code
            ? dto.load_code.trim()
            : null,
        is_turnkey: isTurnkey,
        turnkey_price: turnkeyPrice,
        turnkey_currency: turnkeyCurrency,
        is_speed_up: isSpeedUp,
        speed_up: speedUp,
        speed_up_currency: speedUpCurrency,
        additional_expense: additionalExpense,
        additional_expense_currency: additionalExpenseCurrency,
        container_type:
          dto.cargo_type === 'FTL' && finalContainerType
            ? finalContainerType
            : null,
        transport_types: finalTransportTypes,
        container_truck_id: finalContainerTruckId,
        consolidation_id: finalConsolidationId,
        agent_name: finalAgentName,
        cargo: dto.cargo.trim(),
        origin_city: finalOriginPlace.city,
        origin_country: finalOriginPlace.country,
        origin_country_code: finalOriginPlace.country_code,
        origin_geoname_id: finalOriginPlace.geoname_id,
        origin_lat: finalOriginPlace.lat,
        origin_lng: finalOriginPlace.lng,
        destination_city: finalDestPlace.city,
        destination_country: finalDestPlace.country,
        destination_country_code: finalDestPlace.country_code,
        destination_geoname_id: finalDestPlace.geoname_id,
        destination_lat: finalDestPlace.lat,
        destination_lng: finalDestPlace.lng,
        confirmed_date: dto.confirmed_date || null,
        loaded_date: finalLoadedDate,
        arrived_date: finalArrivedDate,
        purchase_price: finalPurchasePrice,
        purchase_currency: finalPurchaseCurrency,
        purchase_date: finalPurchaseDate,
        purchase_usd_rate: finalPurchaseUsdRate,
        purchase_custom_rate: finalPurchaseCustomRate,
        sell_price: dto.sell_price,
        sell_currency: dto.sell_currency,
        sell_date: sellDate,
        sell_usd_rate: sellRes.usd_rate_used,
        sell_custom_rate: dto.sell_exchange_rate || null,
        usd_rmb_rate: dto.usd_rmb_rate || null,
        status: finalStatus,
        payment_status: dto.payment_status || 'waiting',
        payment_deadline_days:
          dto.payment_deadline_days !== undefined
            ? dto.payment_deadline_days
            : 15,
        is_kpi_received: dto.is_kpi_received || false,
        kpi_received_at: dto.is_kpi_received ? this.knex.fn.now() : null,
        description: dto.description || null,
        client_id: dto.client_id,
        employee_id: finalEmployeeId,
      })
      .returning('id');

    await this.invalidateCache();

    const insertedId = typeof inserted === 'object' ? inserted.id : inserted;

    // Cache idempotency token if supplied (expires in 5 minutes)
    if (dto.idempotency_key && this.redisService) {
      try {
        await this.redisService.set(
          `cargo_registrations:idempotency:${dto.idempotency_key.trim()}`,
          insertedId,
          300,
        );
      } catch (err) {
        this.logger.warn(`Failed to cache idempotency key: ${err.message}`);
      }
    }

    return this.findCargoRegistrationDetails(insertedId);
  }

  /**
   * Update existing cargo registration.
   */
  async updateCargoRegistration(
    id: string,
    user: { id: string; role?: string },
    dto: UpdateCargoRegistrationDto,
  ) {
    const existing = await this.knex('cargo_registrations')
      .where('id', id)
      .first();

    if (!existing) {
      throw new NotFoundException({
        message: 'Cargo registration not found',
        location: 'cargo_not_found',
      });
    }

    const canRegisterEveryone = await this.checkCanRegisterForEveryone(user);
    const userEmployeeId = await this.getUserEmployeeId(user.id);

    if (!canRegisterEveryone) {
      if (!userEmployeeId || existing.employee_id !== userEmployeeId) {
        throw new ForbiddenException({
          message:
            'You do not have permission to update cargo registered for other employees',
          location: 'permission_denied_for_other_employees',
        });
      }
      if (dto.employee_id && dto.employee_id !== userEmployeeId) {
        throw new ForbiddenException({
          message:
            'You do not have permission to reassign cargo to another employee',
          location: 'reassignment_prohibited',
        });
      }
    }

    const effectiveCargoType = dto.cargo_type || existing.cargo_type;
    const effectiveVolume =
      dto.volume !== undefined ? dto.volume : existing.volume;
    const effectiveWeight =
      dto.weight !== undefined ? dto.weight : existing.weight;
    const effectiveContainerType =
      dto.container_type !== undefined
        ? dto.container_type
        : existing.container_type;

    this.validateCargoTypeRules({
      cargo_type: effectiveCargoType,
      volume: effectiveVolume,
      weight: effectiveWeight,
      container_type: effectiveContainerType,
      container_truck_id:
        dto.container_truck_id !== undefined
          ? dto.container_truck_id
          : existing.container_truck_id,
      agent_name:
        dto.agent_name !== undefined ? dto.agent_name : existing.agent_name,
      purchase_price:
        dto.purchase_price !== undefined
          ? dto.purchase_price
          : existing.purchase_price,
      purchase_currency:
        dto.purchase_currency !== undefined
          ? dto.purchase_currency
          : existing.purchase_currency,
      consolidation_id:
        dto.consolidation_id !== undefined
          ? dto.consolidation_id
          : existing.consolidation_id,
    });

    const effectivePurchaseCurrency =
      dto.purchase_currency || existing.purchase_currency;
    const effectiveSellCurrency = dto.sell_currency || existing.sell_currency;
    const effectiveUsdRmbRate =
      dto.usd_rmb_rate !== undefined ? dto.usd_rmb_rate : existing.usd_rmb_rate;

    this.validateRmbRateRule({
      cargo_type: effectiveCargoType,
      purchase_currency: effectivePurchaseCurrency,
      sell_currency: effectiveSellCurrency,
      usd_rmb_rate: effectiveUsdRmbRate,
    });

    if (dto.client_id) {
      const clientExists = await this.knex('clients')
        .where('id', dto.client_id)
        .first();
      if (!clientExists) {
        throw new NotFoundException({
          message: 'Client not found',
          location: 'client_not_found',
        });
      }
    }

    if (dto.employee_id) {
      const employeeExists = await this.knex('employees')
        .where('id', dto.employee_id)
        .first();
      if (!employeeExists) {
        throw new NotFoundException({
          message: 'Employee not found',
          location: 'employee_not_found',
        });
      }
    }

    const effectivePurchaseDate = this.formatDateStr(
      dto.purchase_date ||
        existing.purchase_date ||
        dto.confirmed_date ||
        existing.confirmed_date,
    );
    const effectiveSellDate = this.formatDateStr(
      dto.sell_date || existing.sell_date,
    );

    const updatePayload: Record<string, any> = {
      updated_at: this.knex.fn.now(),
    };

    if (dto.cargo_type !== undefined) updatePayload.cargo_type = dto.cargo_type;
    if (effectiveCargoType === 'LTL') {
      if (dto.volume !== undefined) updatePayload.volume = dto.volume;
      if (dto.weight !== undefined) updatePayload.weight = dto.weight;
      if (dto.load_code !== undefined)
        updatePayload.load_code = dto.load_code ? dto.load_code.trim() : null;
      updatePayload.container_type = null;
    } else {
      if (dto.container_type !== undefined)
        updatePayload.container_type = dto.container_type.trim();
      updatePayload.volume = null;
      updatePayload.weight = null;
      updatePayload.load_code = null;
    }

    const effectiveIsTurnkey =
      dto.is_turnkey !== undefined
        ? Boolean(dto.is_turnkey)
        : Boolean(existing.is_turnkey);
    const effectiveTurnkeyPrice =
      dto.turnkey_price !== undefined
        ? Number(dto.turnkey_price)
        : Number(existing.turnkey_price || 0);

    if (effectiveIsTurnkey) {
      if (effectiveTurnkeyPrice <= 0) {
        throw new BadRequestException({
          message:
            'turnkey_price is required and must be greater than 0 when is_turnkey is true',
          location: 'turnkey_price_required',
        });
      }
      updatePayload.is_turnkey = true;
      updatePayload.turnkey_price = effectiveTurnkeyPrice;
      updatePayload.turnkey_currency =
        dto.turnkey_currency ||
        existing.turnkey_currency ||
        effectiveSellCurrency;
    } else {
      if (dto.is_turnkey !== undefined) {
        updatePayload.is_turnkey = false;
        updatePayload.turnkey_price = 0;
      }
      if (dto.turnkey_currency !== undefined) {
        updatePayload.turnkey_currency = dto.turnkey_currency;
      }
    }

    if (dto.speed_up !== undefined || dto.speed_up_price !== undefined) {
      const val =
        dto.speed_up !== undefined
          ? Number(dto.speed_up)
          : Number(dto.speed_up_price);
      updatePayload.speed_up = val;
      if (dto.is_speed_up !== undefined) {
        updatePayload.is_speed_up = Boolean(dto.is_speed_up);
      } else {
        updatePayload.is_speed_up = val > 0;
      }
    } else if (dto.is_speed_up !== undefined) {
      updatePayload.is_speed_up = Boolean(dto.is_speed_up);
      if (!dto.is_speed_up) {
        updatePayload.speed_up = 0;
      }
    }
    if (dto.speed_up_currency !== undefined) {
      updatePayload.speed_up_currency = dto.speed_up_currency;
    }

    if (dto.additional_expense !== undefined) {
      updatePayload.additional_expense = Number(dto.additional_expense);
    }
    if (dto.additional_expense_currency !== undefined) {
      updatePayload.additional_expense_currency =
        dto.additional_expense_currency;
    }

    if (dto.transport_types !== undefined)
      updatePayload.transport_types = dto.transport_types;

    if (dto.container_truck_id !== undefined)
      updatePayload.container_truck_id = dto.container_truck_id.trim();
    if (dto.agent_name !== undefined)
      updatePayload.agent_name = dto.agent_name.trim();
    if (dto.cargo !== undefined) updatePayload.cargo = dto.cargo.trim();
    if (dto.confirmed_date !== undefined)
      updatePayload.confirmed_date = dto.confirmed_date || null;
    if (dto.loaded_date !== undefined)
      updatePayload.loaded_date = dto.loaded_date || null;
    if (dto.arrived_date !== undefined)
      updatePayload.arrived_date = dto.arrived_date || null;

    if (dto.purchase_date !== undefined)
      updatePayload.purchase_date = dto.purchase_date || null;
    if (dto.sell_date !== undefined)
      updatePayload.sell_date = dto.sell_date || null;
    if (dto.purchase_exchange_rate !== undefined)
      updatePayload.purchase_custom_rate = dto.purchase_exchange_rate || null;
    if (dto.sell_exchange_rate !== undefined)
      updatePayload.sell_custom_rate = dto.sell_exchange_rate || null;

    if (dto.purchase_price !== undefined)
      updatePayload.purchase_price = dto.purchase_price;
    if (dto.purchase_currency !== undefined)
      updatePayload.purchase_currency = dto.purchase_currency;
    if (dto.sell_price !== undefined) updatePayload.sell_price = dto.sell_price;
    if (dto.sell_currency !== undefined)
      updatePayload.sell_currency = dto.sell_currency;
    if (dto.usd_rmb_rate !== undefined)
      updatePayload.usd_rmb_rate = dto.usd_rmb_rate || null;

    // Recalculate purchase USD rate snapshot
    const purchaseRates = await this.currencyService.getRatesForDate(
      effectivePurchaseDate,
    );
    const purchaseRes = this.convertPriceToUsdAndUzs(
      dto.purchase_price !== undefined
        ? dto.purchase_price
        : Number(existing.purchase_price),
      effectivePurchaseCurrency,
      purchaseRates,
      effectiveUsdRmbRate,
      dto.purchase_exchange_rate !== undefined
        ? dto.purchase_exchange_rate
        : existing.purchase_custom_rate
          ? Number(existing.purchase_custom_rate)
          : null,
    );
    updatePayload.purchase_usd_rate = purchaseRes.usd_rate_used;

    // Recalculate sell USD rate snapshot
    const sellRates =
      await this.currencyService.getRatesForDate(effectiveSellDate);
    const sellRes = this.convertPriceToUsdAndUzs(
      dto.sell_price !== undefined
        ? dto.sell_price
        : Number(existing.sell_price),
      effectiveSellCurrency,
      sellRates,
      effectiveUsdRmbRate,
      dto.sell_exchange_rate !== undefined
        ? dto.sell_exchange_rate
        : existing.sell_custom_rate
          ? Number(existing.sell_custom_rate)
          : null,
    );
    updatePayload.sell_usd_rate = sellRes.usd_rate_used;

    if (dto.status !== undefined) updatePayload.status = dto.status;
    if (dto.payment_status !== undefined)
      updatePayload.payment_status = dto.payment_status;
    if (dto.payment_deadline_days !== undefined)
      updatePayload.payment_deadline_days = dto.payment_deadline_days;
    if (dto.is_kpi_received !== undefined) {
      updatePayload.is_kpi_received = dto.is_kpi_received;
      updatePayload.kpi_received_at = dto.is_kpi_received
        ? this.knex.fn.now()
        : null;
    }
    if (dto.description !== undefined)
      updatePayload.description = dto.description || null;
    if (dto.client_id !== undefined) updatePayload.client_id = dto.client_id;
    if (dto.employee_id !== undefined)
      updatePayload.employee_id = dto.employee_id;

    // Origin location updates with normalization
    if (
      dto.origin_city !== undefined ||
      dto.origin_country !== undefined ||
      dto.origin_country_code !== undefined ||
      dto.origin_geoname_id !== undefined ||
      dto.origin_lat !== undefined ||
      dto.origin_lng !== undefined
    ) {
      if (dto.origin_geoname_id === null && dto.origin_city === null) {
        updatePayload.origin_city = null;
        updatePayload.origin_country = null;
        updatePayload.origin_country_code = null;
        updatePayload.origin_geoname_id = null;
        updatePayload.origin_lat = null;
        updatePayload.origin_lng = null;
      } else if (
        this.locationsService &&
        (dto.origin_city || dto.origin_geoname_id)
      ) {
        const isNewGeonameId =
          dto.origin_geoname_id &&
          dto.origin_geoname_id !== existing.origin_geoname_id;

        const resolved = await this.locationsService.normalizeAndResolvePlace({
          city:
            dto.origin_city !== undefined
              ? dto.origin_city
              : isNewGeonameId
                ? null
                : existing.origin_city,
          country:
            dto.origin_country !== undefined
              ? dto.origin_country
              : isNewGeonameId
                ? null
                : existing.origin_country,
          country_code:
            dto.origin_country_code !== undefined
              ? dto.origin_country_code
              : isNewGeonameId
                ? null
                : existing.origin_country_code,
          geoname_id:
            dto.origin_geoname_id !== undefined
              ? dto.origin_geoname_id
              : existing.origin_geoname_id,
          lat:
            dto.origin_lat !== undefined
              ? dto.origin_lat
              : isNewGeonameId
                ? null
                : existing.origin_lat,
          lng:
            dto.origin_lng !== undefined
              ? dto.origin_lng
              : isNewGeonameId
                ? null
                : existing.origin_lng,
        });
        updatePayload.origin_city = resolved.city;
        updatePayload.origin_country = resolved.country;
        updatePayload.origin_country_code = resolved.country_code;
        updatePayload.origin_geoname_id = resolved.geoname_id;
        updatePayload.origin_lat = resolved.lat;
        updatePayload.origin_lng = resolved.lng;
      } else {
        if (dto.origin_city !== undefined)
          updatePayload.origin_city = dto.origin_city
            ? dto.origin_city.trim()
            : null;
        if (dto.origin_country !== undefined)
          updatePayload.origin_country = dto.origin_country
            ? dto.origin_country.trim()
            : null;
        if (dto.origin_country_code !== undefined)
          updatePayload.origin_country_code = dto.origin_country_code
            ? dto.origin_country_code.trim().toUpperCase()
            : null;
        if (dto.origin_geoname_id !== undefined)
          updatePayload.origin_geoname_id = dto.origin_geoname_id || null;
        if (dto.origin_lat !== undefined)
          updatePayload.origin_lat = dto.origin_lat;
        if (dto.origin_lng !== undefined)
          updatePayload.origin_lng = dto.origin_lng;
      }
    }

    // Destination location updates with normalization
    if (
      dto.destination_city !== undefined ||
      dto.destination_country !== undefined ||
      dto.destination_country_code !== undefined ||
      dto.destination_geoname_id !== undefined ||
      dto.destination_lat !== undefined ||
      dto.destination_lng !== undefined
    ) {
      if (
        dto.destination_geoname_id === null &&
        dto.destination_city === null
      ) {
        updatePayload.destination_city = null;
        updatePayload.destination_country = null;
        updatePayload.destination_country_code = null;
        updatePayload.destination_geoname_id = null;
        updatePayload.destination_lat = null;
        updatePayload.destination_lng = null;
      } else if (
        this.locationsService &&
        (dto.destination_city || dto.destination_geoname_id)
      ) {
        const isNewGeonameId =
          dto.destination_geoname_id &&
          dto.destination_geoname_id !== existing.destination_geoname_id;

        const resolved = await this.locationsService.normalizeAndResolvePlace({
          city:
            dto.destination_city !== undefined
              ? dto.destination_city
              : isNewGeonameId
                ? null
                : existing.destination_city,
          country:
            dto.destination_country !== undefined
              ? dto.destination_country
              : isNewGeonameId
                ? null
                : existing.destination_country,
          country_code:
            dto.destination_country_code !== undefined
              ? dto.destination_country_code
              : isNewGeonameId
                ? null
                : existing.destination_country_code,
          geoname_id:
            dto.destination_geoname_id !== undefined
              ? dto.destination_geoname_id
              : existing.destination_geoname_id,
          lat:
            dto.destination_lat !== undefined
              ? dto.destination_lat
              : isNewGeonameId
                ? null
                : existing.destination_lat,
          lng:
            dto.destination_lng !== undefined
              ? dto.destination_lng
              : isNewGeonameId
                ? null
                : existing.destination_lng,
        });
        updatePayload.destination_city = resolved.city;
        updatePayload.destination_country = resolved.country;
        updatePayload.destination_country_code = resolved.country_code;
        updatePayload.destination_geoname_id = resolved.geoname_id;
        updatePayload.destination_lat = resolved.lat;
        updatePayload.destination_lng = resolved.lng;
      } else {
        if (dto.destination_city !== undefined)
          updatePayload.destination_city = dto.destination_city
            ? dto.destination_city.trim()
            : null;
        if (dto.destination_country !== undefined)
          updatePayload.destination_country = dto.destination_country
            ? dto.destination_country.trim()
            : null;
        if (dto.destination_country_code !== undefined)
          updatePayload.destination_country_code = dto.destination_country_code
            ? dto.destination_country_code.trim().toUpperCase()
            : null;
        if (dto.destination_geoname_id !== undefined)
          updatePayload.destination_geoname_id =
            dto.destination_geoname_id || null;
        if (dto.destination_lat !== undefined)
          updatePayload.destination_lat = dto.destination_lat;
        if (dto.destination_lng !== undefined)
          updatePayload.destination_lng = dto.destination_lng;
      }
    }

    if (effectiveCargoType === 'LTL') {
      if (dto.consolidation_id !== undefined) {
        if (dto.consolidation_id === null || dto.consolidation_id === '') {
          throw new BadRequestException({
            message: 'consolidation_id is required for LTL cargo',
            location: 'consolidation_required_for_ltl',
          });
        }
        const consExists = await this.knex('cargo_consolidations')
          .where('id', dto.consolidation_id)
          .first();
        if (!consExists) {
          throw new NotFoundException({
            message: 'Cargo consolidation not found',
            location: 'consolidation_not_found',
          });
        }
        updatePayload.consolidation_id = dto.consolidation_id;
        updatePayload.container_truck_id = consExists.container_truck_id;
        updatePayload.agent_name =
          consExists.carrier_name || consExists.container_truck_id;
        updatePayload.transport_types =
          consExists.transport_types && consExists.transport_types.length > 0
            ? consExists.transport_types
            : [
                this.inferTransportType(
                  consExists.container_type,
                  null,
                  consExists.container_truck_id,
                ),
              ];
        updatePayload.origin_city = consExists.origin_place || null;
        updatePayload.origin_country = consExists.origin_country || null;
        updatePayload.origin_country_code =
          consExists.origin_country_code || null;
        updatePayload.origin_geoname_id = consExists.origin_geoname_id || null;
        updatePayload.origin_lat = consExists.origin_lat || null;
        updatePayload.origin_lng = consExists.origin_lng || null;
        updatePayload.destination_city = consExists.destination_place || null;
        updatePayload.destination_country =
          consExists.destination_country || null;
        updatePayload.destination_country_code =
          consExists.destination_country_code || null;
        updatePayload.destination_geoname_id =
          consExists.destination_geoname_id || null;
        updatePayload.destination_lat = consExists.destination_lat || null;
        updatePayload.destination_lng = consExists.destination_lng || null;
        updatePayload.loaded_date = this.formatDateStr(
          consExists.load_date || consExists.loaded_date,
        );
        updatePayload.arrived_date = this.formatDateStr(
          consExists.arrived_date,
        );
        updatePayload.status = consExists.status || 'Waiting';
        updatePayload.purchase_price = 0;
        updatePayload.purchase_currency =
          consExists.carrier_cost_currency || 'USD';
        updatePayload.purchase_usd_rate = Number(
          consExists.carrier_cost_usd_rate || 1.0,
        );
      } else if (existing.consolidation_id) {
        // Keep purchase_price = 0 for LTL cargo tied to consolidation
        updatePayload.purchase_price = 0;
      }
    } else {
      if (dto.consolidation_id !== undefined) {
        if (dto.consolidation_id === null || dto.consolidation_id === '') {
          updatePayload.consolidation_id = null;
        } else {
          const consExists = await this.knex('cargo_consolidations')
            .where('id', dto.consolidation_id)
            .first();
          if (!consExists) {
            throw new NotFoundException({
              message: 'Cargo consolidation not found',
              location: 'consolidation_not_found',
            });
          }
          updatePayload.consolidation_id = dto.consolidation_id;
          if (dto.container_truck_id === undefined) {
            updatePayload.container_truck_id = consExists.container_truck_id;
          }
          if (dto.container_type === undefined && consExists.container_type) {
            updatePayload.container_type = consExists.container_type;
          }
        }
      }
    }

    await this.knex('cargo_registrations')
      .where('id', id)
      .update(updatePayload);

    await this.invalidateCache();

    return this.findCargoRegistrationDetails(id);
  }

  /**
   * Apply all filter conditions to cargo registrations query builder.
   */
  private applyCargoRegistrationFilters(
    baseQuery: Knex.QueryBuilder,
    query: QueryCargoRegistrationDto,
  ) {
    if (query.status) {
      baseQuery.where('cr.status', query.status);
    }
    if (query.employee_id) {
      baseQuery.where('cr.employee_id', query.employee_id);
    }
    if (query.client_id) {
      baseQuery.where('cr.client_id', query.client_id);
    }
    if (query.cargo_type) {
      baseQuery.where('cr.cargo_type', query.cargo_type);
    }
    if (query.container_type) {
      baseQuery.where('cr.container_type', query.container_type);
    }
    if (query.transport_types && query.transport_types.length > 0) {
      baseQuery.whereRaw('cr.transport_types && ?::text[]', [
        query.transport_types,
      ]);
    }
    if (query.consolidation_id) {
      baseQuery.where('cr.consolidation_id', query.consolidation_id);
    }
    if (query.has_consolidation === 'true' || query.has_consolidation === '1') {
      baseQuery.whereNotNull('cr.consolidation_id');
    } else if (
      query.has_consolidation === 'false' ||
      query.has_consolidation === '0'
    ) {
      baseQuery.whereNull('cr.consolidation_id');
    }

    // Payment status and KPI received filters
    if (query.payment_status) {
      baseQuery.where('cr.payment_status', query.payment_status);
    }
    if (query.is_kpi_received !== undefined) {
      const isReceived =
        query.is_kpi_received === 'true' || query.is_kpi_received === '1';
      baseQuery.where('cr.is_kpi_received', isReceived);
    }
    if (query.is_turnkey !== undefined) {
      const isTurnkey = query.is_turnkey === 'true' || query.is_turnkey === '1';
      baseQuery.where('cr.is_turnkey', isTurnkey);
    }
    if (query.is_speed_up !== undefined) {
      const isSpeedUp =
        query.is_speed_up === 'true' || query.is_speed_up === '1';
      baseQuery.where('cr.is_speed_up', isSpeedUp);
    }

    // Date filters
    if (query.confirmed_start_date) {
      baseQuery.where('cr.confirmed_date', '>=', query.confirmed_start_date);
    }
    if (query.confirmed_end_date) {
      baseQuery.where('cr.confirmed_date', '<=', query.confirmed_end_date);
    }
    if (query.loaded_start_date) {
      baseQuery.where('cr.loaded_date', '>=', query.loaded_start_date);
    }
    if (query.loaded_end_date) {
      baseQuery.where('cr.loaded_date', '<=', query.loaded_end_date);
    }
    if (query.arrived_start_date) {
      baseQuery.where('cr.arrived_date', '>=', query.arrived_start_date);
    }
    if (query.arrived_end_date) {
      baseQuery.where('cr.arrived_date', '<=', query.arrived_end_date);
    }

    // Purchase date filters
    const purchaseStart =
      query.purchase_start_date || query.purchase_date_start;
    const purchaseEnd = query.purchase_end_date || query.purchase_date_end;
    if (purchaseStart) {
      baseQuery.where('cr.purchase_date', '>=', purchaseStart);
    }
    if (purchaseEnd) {
      baseQuery.where('cr.purchase_date', '<=', purchaseEnd);
    }
    if (query.purchase_date && !purchaseStart && !purchaseEnd) {
      baseQuery.where('cr.purchase_date', query.purchase_date);
    }

    // Sell date filters
    const sellStart = query.sell_start_date || query.sell_date_start;
    const sellEnd = query.sell_end_date || query.sell_date_end;
    if (sellStart) {
      baseQuery.where('cr.sell_date', '>=', sellStart);
    }
    if (sellEnd) {
      baseQuery.where('cr.sell_date', '<=', sellEnd);
    }
    if (query.sell_date && !sellStart && !sellEnd) {
      baseQuery.where('cr.sell_date', query.sell_date);
    }

    // Registration creation date filters
    const createdStart = query.created_start_date || query.created_at_start;
    const createdEnd = query.created_end_date || query.created_at_end;

    if (createdStart && createdStart.trim()) {
      const s = createdStart.trim();
      const startDate =
        s.includes('T') || s.includes(' ') ? s : `${s}T00:00:00.000Z`;
      baseQuery.where('cr.created_at', '>=', startDate);
    }
    if (createdEnd && createdEnd.trim()) {
      const e = createdEnd.trim();
      const endDate =
        e.includes('T') || e.includes(' ') ? e : `${e}T23:59:59.999Z`;
      baseQuery.where('cr.created_at', '<=', endDate);
    }

    // Origin location filters
    if (query.origin_city && query.origin_city.trim()) {
      baseQuery.whereILike('cr.origin_city', `%${query.origin_city.trim()}%`);
    }
    if (query.origin_country_code && query.origin_country_code.trim()) {
      baseQuery.where(
        'cr.origin_country_code',
        query.origin_country_code.trim().toUpperCase(),
      );
    }
    if (query.origin_geoname_id) {
      baseQuery.where('cr.origin_geoname_id', Number(query.origin_geoname_id));
    }

    // Destination location filters
    if (query.destination_city && query.destination_city.trim()) {
      baseQuery.whereILike(
        'cr.destination_city',
        `%${query.destination_city.trim()}%`,
      );
    }
    if (
      query.destination_country_code &&
      query.destination_country_code.trim()
    ) {
      baseQuery.where(
        'cr.destination_country_code',
        query.destination_country_code.trim().toUpperCase(),
      );
    }
    if (query.destination_geoname_id) {
      baseQuery.where(
        'cr.destination_geoname_id',
        Number(query.destination_geoname_id),
      );
    }

    // Search filter across container_truck_id, cargo, agent_name, origin_city, destination_city
    if (query.search && query.search.trim()) {
      const searchTerm = `%${query.search.trim()}%`;
      baseQuery.where((builder) => {
        builder
          .where('cr.container_truck_id', 'ILIKE', searchTerm)
          .orWhere('cr.cargo', 'ILIKE', searchTerm)
          .orWhere('cr.agent_name', 'ILIKE', searchTerm)
          .orWhere('cr.origin_city', 'ILIKE', searchTerm)
          .orWhere('cr.destination_city', 'ILIKE', searchTerm);
      });
    }
  }

  /**
   * Find all cargo registrations with filters, high-performance database-level aggregations, and pagination.
   */
  async findAllCargoRegistrations(query: QueryCargoRegistrationDto) {
    const cacheKey = this.getListCacheKey(query);
    if (this.redisService) {
      try {
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        this.logger.warn(`Redis cache get error: ${err.message}`);
      }
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const offset =
      query.offset !== undefined
        ? Math.max(0, Number(query.offset))
        : (page - 1) * limit;

    const baseWhereQuery = this.knex('cargo_registrations as cr');
    this.applyCargoRegistrationFilters(baseWhereQuery, query);

    const rates = await this.currencyService.getLatestRates();
    const usdObj = rates['USD'] || { rate: 11820.48, nominal: 1 };
    const usdRate = usdObj.rate / (usdObj.nominal || 1);
    const rubObj = rates['RUB'] || { rate: 137.51, nominal: 1 };
    const rubRate = rubObj.rate / (rubObj.nominal || 1);
    const rmbObj = rates['RMB'] ||
      rates['CNY'] || { rate: 1758.76, nominal: 1 };
    const rmbRate = rmbObj.rate / (rmbObj.nominal || 1);

    // 1. Direct SQL aggregation for totals and multi-currency financials (Single DB roundtrip)
    const aggQuery = baseWhereQuery.clone().select([
      this.knex.raw('COUNT(cr.id) as total_count'),
      this.knex.raw(`
        COALESCE(SUM(CASE WHEN COALESCE(cr.status, 'Waiting') NOT IN ('Arrived', 'Delivered') THEN 1 ELSE 0 END), 0) as active_containers,
        COALESCE(SUM(CASE WHEN COALESCE(cr.status, 'Waiting') IN ('On the border', 'Border', 'On the way', 'In Transit', 'Station', 'At Station', 'Reload') AND (cr.arrived_date IS NULL OR CAST(cr.arrived_date AS TEXT) = '') THEN 1 ELSE 0 END), 0) as action_required,
        COALESCE(SUM(CASE WHEN cr.sell_currency = 'UZS' THEN cr.sell_price ELSE 0 END + CASE WHEN cr.is_turnkey AND COALESCE(cr.turnkey_currency, cr.sell_currency) = 'UZS' THEN cr.turnkey_price ELSE 0 END + CASE WHEN cr.speed_up > 0 AND COALESCE(cr.speed_up_currency, cr.sell_currency) = 'UZS' THEN cr.speed_up ELSE 0 END), 0) as gross_uzs,
        COALESCE(SUM(CASE WHEN cr.sell_currency = 'USD' THEN cr.sell_price ELSE 0 END + CASE WHEN cr.is_turnkey AND COALESCE(cr.turnkey_currency, cr.sell_currency) = 'USD' THEN cr.turnkey_price ELSE 0 END + CASE WHEN cr.speed_up > 0 AND COALESCE(cr.speed_up_currency, cr.sell_currency) = 'USD' THEN cr.speed_up ELSE 0 END), 0) as gross_usd,
        COALESCE(SUM(CASE WHEN cr.sell_currency = 'RUB' THEN cr.sell_price ELSE 0 END + CASE WHEN cr.is_turnkey AND COALESCE(cr.turnkey_currency, cr.sell_currency) = 'RUB' THEN cr.turnkey_price ELSE 0 END + CASE WHEN cr.speed_up > 0 AND COALESCE(cr.speed_up_currency, cr.sell_currency) = 'RUB' THEN cr.speed_up ELSE 0 END), 0) as gross_rub,
        COALESCE(SUM(CASE WHEN cr.sell_currency IN ('RMB', 'CNY') THEN cr.sell_price ELSE 0 END + CASE WHEN cr.is_turnkey AND COALESCE(cr.turnkey_currency, cr.sell_currency) IN ('RMB', 'CNY') THEN cr.turnkey_price ELSE 0 END + CASE WHEN cr.speed_up > 0 AND COALESCE(cr.speed_up_currency, cr.sell_currency) IN ('RMB', 'CNY') THEN cr.speed_up ELSE 0 END), 0) as gross_rmb,
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
        ), 0) as total_sell_usd,
        COALESCE(SUM(
          CASE
            WHEN cr.sell_currency = 'UZS' THEN cr.sell_price
            WHEN cr.sell_currency = 'USD' THEN cr.sell_price * COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate})
            WHEN cr.sell_currency IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN (cr.sell_price / cr.usd_rmb_rate) * COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate})
            WHEN cr.sell_currency IN ('RMB', 'CNY') THEN cr.sell_price * ${rmbRate}
            WHEN cr.sell_currency = 'RUB' THEN cr.sell_price * ${rubRate}
            ELSE 0
          END
          +
          CASE
            WHEN cr.is_turnkey AND cr.turnkey_price > 0 THEN
              CASE
                WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') = 'UZS' THEN cr.turnkey_price
                WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') = 'USD' THEN cr.turnkey_price * COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate})
                WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN (cr.turnkey_price / cr.usd_rmb_rate) * COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate})
                WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') IN ('RMB', 'CNY') THEN cr.turnkey_price * ${rmbRate}
                WHEN COALESCE(cr.turnkey_currency, cr.sell_currency, 'USD') = 'RUB' THEN cr.turnkey_price * ${rubRate}
                ELSE 0
              END
            ELSE 0
          END
          +
          CASE
            WHEN cr.speed_up > 0 THEN
              CASE
                WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') = 'UZS' THEN cr.speed_up
                WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') = 'USD' THEN cr.speed_up * COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate})
                WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN (cr.speed_up / cr.usd_rmb_rate) * COALESCE(cr.sell_custom_rate, cr.sell_usd_rate, ${usdRate})
                WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') IN ('RMB', 'CNY') THEN cr.speed_up * ${rmbRate}
                WHEN COALESCE(cr.speed_up_currency, cr.sell_currency, 'USD') = 'RUB' THEN cr.speed_up * ${rubRate}
                ELSE 0
              END
            ELSE 0
          END
        ), 0) as total_sell_uzs,
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
        ), 0) as total_purchase_usd,
        COALESCE(SUM(
          CASE
            WHEN cr.purchase_currency = 'UZS' THEN cr.purchase_price
            WHEN cr.purchase_currency = 'USD' THEN cr.purchase_price * COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, ${usdRate})
            WHEN cr.purchase_currency IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN (cr.purchase_price / cr.usd_rmb_rate) * COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, ${usdRate})
            WHEN cr.purchase_currency IN ('RMB', 'CNY') THEN cr.purchase_price * ${rmbRate}
            WHEN cr.purchase_currency = 'RUB' THEN cr.purchase_price * ${rubRate}
            ELSE 0
          END
          +
          CASE
            WHEN cr.additional_expense > 0 THEN
              CASE
                WHEN COALESCE(cr.additional_expense_currency, 'USD') = 'UZS' THEN cr.additional_expense
                WHEN COALESCE(cr.additional_expense_currency, 'USD') = 'USD' THEN cr.additional_expense * COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, ${usdRate})
                WHEN COALESCE(cr.additional_expense_currency, 'USD') IN ('RMB', 'CNY') AND cr.usd_rmb_rate > 0 THEN (cr.additional_expense / cr.usd_rmb_rate) * COALESCE(cr.purchase_custom_rate, cr.purchase_usd_rate, ${usdRate})
                WHEN COALESCE(cr.additional_expense_currency, 'USD') IN ('RMB', 'CNY') THEN cr.additional_expense * ${rmbRate}
                WHEN COALESCE(cr.additional_expense_currency, 'USD') = 'RUB' THEN cr.additional_expense * ${rubRate}
                ELSE 0
              END
            ELSE 0
          END
        ), 0) as total_purchase_uzs
      `),
    ]);

    const aggResult = await aggQuery.first();
    const total = parseInt(
      (aggResult?.total_count as string) || (aggResult?.total as string) || '0',
      10,
    );
    const activeContainers = parseInt(
      (aggResult?.active_containers as string) || '0',
      10,
    );
    const actionRequired = parseInt(
      (aggResult?.action_required as string) || '0',
      10,
    );

    const totalGrossSalesRevenueUsd = Number(aggResult?.total_sell_usd || 0);
    const totalGrossSalesRevenueUzs = Number(aggResult?.total_sell_uzs || 0);
    const totalPurchaseUsd = Number(aggResult?.total_purchase_usd || 0);
    const totalPurchaseUzs = Number(aggResult?.total_purchase_uzs || 0);

    const grossSalesRevenue: Record<string, number> = {
      UZS: Math.round(Number(aggResult?.gross_uzs || 0) * 100) / 100,
      USD: Math.round(Number(aggResult?.gross_usd || 0) * 100) / 100,
      RUB: Math.round(Number(aggResult?.gross_rub || 0) * 100) / 100,
      RMB: Math.round(Number(aggResult?.gross_rmb || 0) * 100) / 100,
    };

    const totalCalculatedNetYieldUsd =
      totalGrossSalesRevenueUsd - totalPurchaseUsd;
    const totalCalculatedNetYieldUzs =
      totalGrossSalesRevenueUzs - totalPurchaseUzs;

    let formattedData: any[] = [];

    if (total > 0) {
      const paginatedQuery = baseWhereQuery
        .clone()
        .leftJoin('clients as c', 'cr.client_id', 'c.id')
        .leftJoin('employees as e', 'cr.employee_id', 'e.id')
        .leftJoin('cargo_consolidations as cc', 'cr.consolidation_id', 'cc.id')
        .select(
          'cr.id',
          'cr.cargo_type',
          'cr.volume',
          'cr.weight',
          'cr.load_code',
          'cr.is_turnkey',
          'cr.turnkey_price',
          'cr.turnkey_currency',
          'cr.is_speed_up',
          'cr.speed_up',
          'cr.speed_up_currency',
          'cr.additional_expense',
          'cr.additional_expense_currency',
          'cr.container_type',
          'cr.transport_types',
          'cr.container_truck_id',
          'cr.consolidation_id',
          'cr.agent_name',
          'cr.origin_city',
          'cr.origin_country',
          'cr.origin_country_code',
          'cr.origin_geoname_id',
          'cr.origin_lat',
          'cr.origin_lng',
          'cr.destination_city',
          'cr.destination_country',
          'cr.destination_country_code',
          'cr.destination_geoname_id',
          'cr.destination_lat',
          'cr.destination_lng',
          'cr.cargo',
          'cr.confirmed_date',
          'cr.loaded_date',
          'cr.arrived_date',
          'cr.purchase_date',
          'cr.purchase_price',
          'cr.purchase_currency',
          'cr.purchase_usd_rate',
          'cr.purchase_custom_rate',
          'cr.sell_date',
          'cr.sell_price',
          'cr.sell_currency',
          'cr.sell_usd_rate',
          'cr.sell_custom_rate',
          'cr.usd_rmb_rate',
          'cr.status',
          'cr.payment_status',
          'cr.payment_deadline_days',
          'cr.is_kpi_received',
          'cr.kpi_received_at',
          'cr.created_at',
          'cr.updated_at',
          'c.first_name as client_first_name',
          'c.last_name as client_last_name',
          'c.company_name as client_company',
          'e.first_name as emp_first_name',
          'e.last_name as emp_last_name',
          'cc.consolidation_code',
          'cc.status as consolidation_status',
          'cc.carrier_name as consolidation_carrier_name',
        );

      this.applySorting(
        paginatedQuery,
        query.sort_by,
        query.sort_order || query.order,
      );

      const rows = await paginatedQuery.limit(limit).offset(offset);

      if (Array.isArray(rows) && rows.length > 0) {
        // Collect unique dates only for rows that actually require dynamic exchange rates
        const uniqueDates = new Set<string>();
        for (const row of rows) {
          const needsPurchaseRate =
            row.purchase_currency &&
            row.purchase_currency !== 'USD' &&
            !row.purchase_custom_rate &&
            !row.purchase_usd_rate;
          const needsSellRate =
            row.sell_currency &&
            row.sell_currency !== 'USD' &&
            !row.sell_custom_rate &&
            !row.sell_usd_rate;

          if (needsPurchaseRate) {
            const purchaseDate = this.formatDateStr(
              row.purchase_date || row.confirmed_date || row.created_at,
            );
            uniqueDates.add(purchaseDate);
          }
          if (needsSellRate) {
            const sellDate = this.formatDateStr(
              row.sell_date || row.created_at,
            );
            uniqueDates.add(sellDate);
          }
        }

        const ratesMap = new Map<string, Record<string, any>>();
        if (uniqueDates.size > 0) {
          await Promise.all(
            Array.from(uniqueDates).map(async (d) => {
              const rates = await this.currencyService.getRatesForDate(d);
              ratesMap.set(d, rates);
            }),
          );
        }

        const defaultRates = await this.currencyService.getLatestRates();

        formattedData = rows.map((r) => {
          const clientName = r.client_first_name
            ? `${r.client_first_name} ${r.client_last_name || ''}`.trim()
            : r.client_company || 'N/A';
          const employeeName = r.emp_first_name
            ? `${r.emp_first_name} ${r.emp_last_name || ''}`.trim()
            : 'N/A';

          const purchaseAmount = Number(r.purchase_price);
          const sellAmount = Number(r.sell_price);
          const turnkeyAmount = r.is_turnkey ? Number(r.turnkey_price || 0) : 0;
          const turnkeyCurrency =
            r.turnkey_currency || r.sell_currency || 'USD';
          const speedUpAmount = Number(r.speed_up || 0);
          const speedUpCurrency =
            r.speed_up_currency || r.sell_currency || 'USD';
          const isSpeedUp = Boolean(r.is_speed_up || speedUpAmount > 0);
          const additionalExpenseAmount = Number(r.additional_expense || 0);
          const additionalExpenseCurrency =
            r.additional_expense_currency || 'USD';

          const purchaseDate = this.formatDateStr(
            r.purchase_date || r.confirmed_date || r.created_at,
          );
          const sellDate = this.formatDateStr(r.sell_date || r.created_at);

          const purchaseRates = ratesMap.get(purchaseDate) || defaultRates;
          const sellRates = ratesMap.get(sellDate) || defaultRates;

          const purchaseRes = this.convertPriceToUsdAndUzs(
            purchaseAmount,
            r.purchase_currency,
            purchaseRates,
            r.usd_rmb_rate ? Number(r.usd_rmb_rate) : null,
            r.purchase_custom_rate
              ? Number(r.purchase_custom_rate)
              : r.purchase_usd_rate
                ? Number(r.purchase_usd_rate)
                : null,
          );

          const sellRes = this.convertPriceToUsdAndUzs(
            sellAmount,
            r.sell_currency,
            sellRates,
            r.usd_rmb_rate ? Number(r.usd_rmb_rate) : null,
            r.sell_custom_rate
              ? Number(r.sell_custom_rate)
              : r.sell_usd_rate
                ? Number(r.sell_usd_rate)
                : null,
          );

          const turnkeyRes = this.convertPriceToUsdAndUzs(
            turnkeyAmount,
            turnkeyCurrency,
            sellRates,
            r.usd_rmb_rate ? Number(r.usd_rmb_rate) : null,
          );

          const speedUpRes = this.convertPriceToUsdAndUzs(
            speedUpAmount,
            speedUpCurrency,
            sellRates,
            r.usd_rmb_rate ? Number(r.usd_rmb_rate) : null,
          );

          const additionalExpenseRes = this.convertPriceToUsdAndUzs(
            additionalExpenseAmount,
            additionalExpenseCurrency,
            purchaseRates,
            r.usd_rmb_rate ? Number(r.usd_rmb_rate) : null,
          );

          const totalIncomeUsd =
            Math.round(
              (sellRes.amount_usd +
                turnkeyRes.amount_usd +
                speedUpRes.amount_usd) *
                100,
            ) / 100;
          const totalIncomeUzs =
            Math.round(
              (sellRes.amount_uzs +
                turnkeyRes.amount_uzs +
                speedUpRes.amount_uzs) *
                100,
            ) / 100;

          const totalOutcomeUsd =
            Math.round(
              (purchaseRes.amount_usd + additionalExpenseRes.amount_usd) * 100,
            ) / 100;
          const totalOutcomeUzs =
            Math.round(
              (purchaseRes.amount_uzs + additionalExpenseRes.amount_uzs) * 100,
            ) / 100;

          const netYieldUsd =
            Math.round((totalIncomeUsd - totalOutcomeUsd) * 100) / 100;
          const netYieldUzs =
            Math.round((totalIncomeUzs - totalOutcomeUzs) * 100) / 100;

          const originLat =
            r.origin_lat !== null && r.origin_lat !== undefined
              ? Number(r.origin_lat)
              : null;
          const originLng =
            r.origin_lng !== null && r.origin_lng !== undefined
              ? Number(r.origin_lng)
              : null;
          const destLat =
            r.destination_lat !== null && r.destination_lat !== undefined
              ? Number(r.destination_lat)
              : null;
          const destLng =
            r.destination_lng !== null && r.destination_lng !== undefined
              ? Number(r.destination_lng)
              : null;

          const originMapsUrl =
            originLat !== null && originLng !== null
              ? `https://www.google.com/maps/search/?api=1&query=${originLat},${originLng}`
              : r.origin_city
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.origin_city + (r.origin_country ? ', ' + r.origin_country : ''))}`
                : null;

          const destMapsUrl =
            destLat !== null && destLng !== null
              ? `https://www.google.com/maps/search/?api=1&query=${destLat},${destLng}`
              : r.destination_city
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.destination_city + (r.destination_country ? ', ' + r.destination_country : ''))}`
                : null;

          const routeMapsUrl =
            originLat !== null &&
            originLng !== null &&
            destLat !== null &&
            destLng !== null
              ? `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}`
              : r.origin_city && r.destination_city
                ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(r.origin_city + (r.origin_country ? ', ' + r.origin_country : ''))}&destination=${encodeURIComponent(r.destination_city + (r.destination_country ? ', ' + r.destination_country : ''))}`
                : null;

          return {
            id: r.id,
            cargo_type: r.cargo_type,
            volume: r.volume ? Number(r.volume) : null,
            weight: r.weight ? Number(r.weight) : null,
            load_code: r.cargo_type === 'LTL' ? r.load_code || null : null,
            is_turnkey: Boolean(r.is_turnkey),
            turnkey_price: Number(r.turnkey_price || 0),
            turnkey_currency: turnkeyCurrency,
            turnkey_amount_usd: turnkeyRes.amount_usd,
            turnkey_amount_uzs: turnkeyRes.amount_uzs,
            is_speed_up: isSpeedUp,
            speed_up: speedUpAmount,
            speed_up_price: speedUpAmount,
            speed_up_currency: speedUpCurrency,
            speed_up_amount_usd: speedUpRes.amount_usd,
            speed_up_amount_uzs: speedUpRes.amount_uzs,
            additional_expense: additionalExpenseAmount,
            additional_expense_currency: additionalExpenseCurrency,
            additional_expense_amount_usd: additionalExpenseRes.amount_usd,
            additional_expense_amount_uzs: additionalExpenseRes.amount_uzs,
            total_income_usd: totalIncomeUsd,
            total_outcome_usd: totalOutcomeUsd,
            container_type: r.container_type,
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
            container_truck_id: r.container_truck_id,
            consolidation_id: r.consolidation_id || null,
            consolidation: r.consolidation_id
              ? {
                  id: r.consolidation_id,
                  consolidation_code: r.consolidation_code,
                  container_truck_id: r.container_truck_id,
                  status: r.consolidation_status,
                  carrier_name: r.consolidation_carrier_name,
                }
              : null,
            agent_name: r.agent_name,
            client_full_name: clientName,
            cargo: r.cargo,
            origin: {
              city: r.origin_city || null,
              country: r.origin_country || null,
              country_code: r.origin_country_code || null,
              geoname_id: r.origin_geoname_id
                ? Number(r.origin_geoname_id)
                : null,
              latitude: originLat,
              longitude: originLng,
              display_name: r.origin_city
                ? `${r.origin_city}${r.origin_country ? ', ' + r.origin_country : ''}${r.origin_country_code ? ' (' + r.origin_country_code + ')' : ''}`
                : null,
              google_maps_url: originMapsUrl,
            },
            origin_city: r.origin_city || null,
            origin_country: r.origin_country || null,
            origin_country_code: r.origin_country_code || null,
            origin_geoname_id: r.origin_geoname_id
              ? Number(r.origin_geoname_id)
              : null,
            destination: {
              city: r.destination_city || null,
              country: r.destination_country || null,
              country_code: r.destination_country_code || null,
              geoname_id: r.destination_geoname_id
                ? Number(r.destination_geoname_id)
                : null,
              latitude: destLat,
              longitude: destLng,
              display_name: r.destination_city
                ? `${r.destination_city}${r.destination_country ? ', ' + r.destination_country : ''}${r.destination_country_code ? ' (' + r.destination_country_code + ')' : ''}`
                : null,
              google_maps_url: destMapsUrl,
            },
            destination_city: r.destination_city || null,
            destination_country: r.destination_country || null,
            destination_country_code: r.destination_country_code || null,
            destination_geoname_id: r.destination_geoname_id
              ? Number(r.destination_geoname_id)
              : null,
            route: {
              origin: r.origin_city || null,
              destination: r.destination_city || null,
              origin_display: r.origin_city
                ? `${r.origin_city}${r.origin_country ? ', ' + r.origin_country : ''}`
                : null,
              destination_display: r.destination_city
                ? `${r.destination_city}${r.destination_country ? ', ' + r.destination_country : ''}`
                : null,
              google_maps_dir_url: routeMapsUrl,
            },
            confirmed_date: r.confirmed_date
              ? this.formatDateStr(r.confirmed_date)
              : null,
            loaded_date: r.loaded_date
              ? this.formatDateStr(r.loaded_date)
              : null,
            arrived_date: r.arrived_date
              ? this.formatDateStr(r.arrived_date)
              : null,
            purchase_date: r.purchase_date
              ? this.formatDateStr(r.purchase_date)
              : null,
            sell_date: r.sell_date ? this.formatDateStr(r.sell_date) : null,
            usd_rmb_rate: r.usd_rmb_rate ? Number(r.usd_rmb_rate) : null,
            employee_full_name: employeeName,
            purchase_price: {
              amount: purchaseAmount,
              currency: r.purchase_currency,
              amount_usd: purchaseRes.amount_usd,
              amount_uzs: purchaseRes.amount_uzs,
              date: purchaseDate,
            },
            sell_price: {
              amount: sellAmount,
              currency: r.sell_currency,
              amount_usd: sellRes.amount_usd,
              amount_uzs: sellRes.amount_uzs,
              date: sellDate,
            },
            net_yield: {
              amount: netYieldUsd,
              currency: 'USD',
              amount_usd: netYieldUsd,
              amount_uzs: netYieldUzs,
              purchase_currency: r.purchase_currency,
              sell_currency: r.sell_currency,
            },
            status: r.status,
            payment_status: r.payment_status || 'waiting',
            payment_deadline_days:
              r.payment_deadline_days !== null &&
              r.payment_deadline_days !== undefined
                ? Number(r.payment_deadline_days)
                : 15,
            is_kpi_received: Boolean(r.is_kpi_received),
            created_at: r.created_at || null,
            updated_at: r.updated_at || null,
          };
        });
      }
    }

    const response = {
      meta: {
        total,
        limit,
        offset,
        active_containers: activeContainers,
        action_required: actionRequired,
        calculated_net_yield: {
          USD: Math.round(totalCalculatedNetYieldUsd * 100) / 100,
          UZS: Math.round(totalCalculatedNetYieldUzs * 100) / 100,
          total_usd: Math.round(totalCalculatedNetYieldUsd * 100) / 100,
          total_uzs: Math.round(totalCalculatedNetYieldUzs * 100) / 100,
        },
        gross_sales_revenue: {
          ...grossSalesRevenue,
          total_usd_equivalent:
            Math.round(totalGrossSalesRevenueUsd * 100) / 100,
          total_uzs_equivalent:
            Math.round(totalGrossSalesRevenueUzs * 100) / 100,
        },
      },
      data: formattedData,
    };

    if (this.redisService) {
      try {
        await this.redisService.set(cacheKey, JSON.stringify(response), 60);
      } catch (err) {
        this.logger.warn(`Redis cache set error: ${err.message}`);
      }
    }

    return response;
  }

  /**
   * Aggregate statistics for cargo registrations (LTL vs FTL, financials, status distribution, manager stats).
   */
  async getCargoRegistrationStats(query: QueryCargoRegistrationDto) {
    const cacheKey = this.getStatsCacheKey(query);
    if (this.redisService) {
      try {
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        this.logger.warn(`Redis cache get error: ${err.message}`);
      }
    }

    const listResult = await this.findAllCargoRegistrations({
      ...query,
      limit: '100000',
      page: '1',
    });

    const meta = listResult.meta;
    const data = listResult.data;

    let totalLtlCount = 0;
    let totalLtlVolume = 0;
    let totalLtlWeight = 0;

    let totalFtlCount = 0;
    const ftlContainerDistribution: Record<string, number> = {};
    const statusDistribution: Record<string, number> = CARGO_STATUSES.reduce(
      (acc, s) => {
        acc[s] = 0;
        return acc;
      },
      {} as Record<string, number>,
    );

    const managerStatsMap = new Map<
      string,
      {
        employee_name: string;
        total_cargos: number;
        ltl_cargos: number;
        ltl_volume: number;
        ftl_cargos: number;
        gross_sales_usd: number;
        net_yield_usd: number;
      }
    >();

    for (const item of data) {
      // Status distribution
      const status = item.status || 'Waiting';
      statusDistribution[status] = (statusDistribution[status] || 0) + 1;

      // LTL vs FTL
      if (item.cargo_type === 'LTL') {
        totalLtlCount++;
        totalLtlVolume += Number(item.volume || 0);
        totalLtlWeight += Number(item.weight || 0);
      } else if (item.cargo_type === 'FTL') {
        totalFtlCount++;
        const cType = item.container_type || 'Unknown';
        ftlContainerDistribution[cType] =
          (ftlContainerDistribution[cType] || 0) + 1;
      }

      // Manager statistics
      const empName = item.employee_full_name;
      if (empName && empName !== 'N/A') {
        if (!managerStatsMap.has(empName)) {
          managerStatsMap.set(empName, {
            employee_name: empName,
            total_cargos: 0,
            ltl_cargos: 0,
            ltl_volume: 0,
            ftl_cargos: 0,
            gross_sales_usd: 0,
            net_yield_usd: 0,
          });
        }
        const m = managerStatsMap.get(empName)!;
        m.total_cargos += 1;
        if (item.cargo_type === 'LTL') {
          m.ltl_cargos += 1;
          m.ltl_volume += Number(item.volume || 0);
        } else if (item.cargo_type === 'FTL') {
          m.ftl_cargos += 1;
        }
        m.gross_sales_usd += Number(item.sell_price?.amount_usd || 0);
        m.net_yield_usd += Number(item.net_yield?.amount_usd || 0);
      }
    }

    const roundedLtlVolume = Math.round(totalLtlVolume * 100) / 100;
    const roundedLtlWeight = Math.round(totalLtlWeight * 100) / 100;

    const managerStats = Array.from(managerStatsMap.values()).map((m) => ({
      ...m,
      ltl_volume: Math.round(m.ltl_volume * 100) / 100,
      gross_sales_usd: Math.round(m.gross_sales_usd * 100) / 100,
      net_yield_usd: Math.round(m.net_yield_usd * 100) / 100,
    }));

    const result = {
      summary: {
        total_cargos: meta.total,
        active_containers: meta.active_containers ?? 0,
        action_required: meta.action_required ?? 0,
        gross_sales_revenue: meta.gross_sales_revenue,
        calculated_net_yield: meta.calculated_net_yield,
      },
      ltl_statistics: {
        total_count: totalLtlCount,
        total_volume_m3: roundedLtlVolume,
        total_weight_kg: roundedLtlWeight,
        avg_volume_m3:
          totalLtlCount > 0
            ? Math.round((roundedLtlVolume / totalLtlCount) * 100) / 100
            : 0,
        avg_weight_kg:
          totalLtlCount > 0
            ? Math.round((roundedLtlWeight / totalLtlCount) * 100) / 100
            : 0,
      },
      ftl_statistics: {
        total_count: totalFtlCount,
        container_type_distribution: ftlContainerDistribution,
      },
      status_distribution: statusDistribution,
      by_manager: managerStats,
    };

    if (this.redisService) {
      try {
        await this.redisService.set(cacheKey, JSON.stringify(result), 60);
      } catch (err) {
        this.logger.warn(`Redis cache set error: ${err.message}`);
      }
    }

    return result;
  }

  /**
   * Get full details of a specific cargo registration.
   */
  async findCargoRegistrationDetails(id: string) {
    const row = await this.knex('cargo_registrations as cr')
      .leftJoin('clients as c', 'cr.client_id', 'c.id')
      .leftJoin('employees as e', 'cr.employee_id', 'e.id')
      .leftJoin('cargo_consolidations as cc', 'cr.consolidation_id', 'cc.id')
      .select(
        'cr.*',
        'c.first_name as client_first_name',
        'c.last_name as client_last_name',
        'c.company_name as client_company',
        'c.phone as client_phone',
        'e.first_name as emp_first_name',
        'e.last_name as emp_last_name',
        'cc.consolidation_code',
        'cc.status as consolidation_status',
        'cc.carrier_name as consolidation_carrier_name',
        'cc.max_volume_capacity as consolidation_max_volume',
        'cc.max_weight_capacity as consolidation_max_weight',
      )
      .where('cr.id', id)
      .first();

    if (!row) {
      throw new NotFoundException({
        message: 'Cargo registration not found',
        location: 'cargo_not_found',
      });
    }

    const purchaseAmount = Number(row.purchase_price);
    const sellAmount = Number(row.sell_price);
    const turnkeyAmount = row.is_turnkey ? Number(row.turnkey_price || 0) : 0;
    const turnkeyCurrency = row.turnkey_currency || row.sell_currency || 'USD';
    const speedUpAmount = Number(row.speed_up || 0);
    const speedUpCurrency = row.speed_up_currency || row.sell_currency || 'USD';
    const isSpeedUp = Boolean(row.is_speed_up || speedUpAmount > 0);
    const additionalExpenseAmount = Number(row.additional_expense || 0);
    const additionalExpenseCurrency = row.additional_expense_currency || 'USD';

    const purchaseDate = this.formatDateStr(
      row.purchase_date || row.confirmed_date || row.created_at,
    );
    const sellDate = this.formatDateStr(row.sell_date || row.created_at);

    const needsPurchaseRate =
      row.purchase_currency &&
      row.purchase_currency !== 'USD' &&
      !row.purchase_custom_rate &&
      !row.purchase_usd_rate;
    const needsSellRate =
      row.sell_currency &&
      row.sell_currency !== 'USD' &&
      !row.sell_custom_rate &&
      !row.sell_usd_rate;

    const purchaseRates = needsPurchaseRate
      ? await this.currencyService.getRatesForDate(purchaseDate)
      : await this.currencyService.getLatestRates();
    const sellRates = needsSellRate
      ? await this.currencyService.getRatesForDate(sellDate)
      : await this.currencyService.getLatestRates();

    const purchaseRes = this.convertPriceToUsdAndUzs(
      purchaseAmount,
      row.purchase_currency,
      purchaseRates,
      row.usd_rmb_rate ? Number(row.usd_rmb_rate) : null,
      row.purchase_custom_rate
        ? Number(row.purchase_custom_rate)
        : row.purchase_usd_rate
          ? Number(row.purchase_usd_rate)
          : null,
    );

    const sellRes = this.convertPriceToUsdAndUzs(
      sellAmount,
      row.sell_currency,
      sellRates,
      row.usd_rmb_rate ? Number(row.usd_rmb_rate) : null,
      row.sell_custom_rate
        ? Number(row.sell_custom_rate)
        : row.sell_usd_rate
          ? Number(row.sell_usd_rate)
          : null,
    );

    const turnkeyRes = this.convertPriceToUsdAndUzs(
      turnkeyAmount,
      turnkeyCurrency,
      sellRates,
      row.usd_rmb_rate ? Number(row.usd_rmb_rate) : null,
    );

    const speedUpRes = this.convertPriceToUsdAndUzs(
      speedUpAmount,
      speedUpCurrency,
      sellRates,
      row.usd_rmb_rate ? Number(row.usd_rmb_rate) : null,
    );

    const additionalExpenseRes = this.convertPriceToUsdAndUzs(
      additionalExpenseAmount,
      additionalExpenseCurrency,
      purchaseRates,
      row.usd_rmb_rate ? Number(row.usd_rmb_rate) : null,
    );

    const totalIncomeUsd =
      Math.round(
        (sellRes.amount_usd + turnkeyRes.amount_usd + speedUpRes.amount_usd) *
          100,
      ) / 100;
    const totalIncomeUzs =
      Math.round(
        (sellRes.amount_uzs + turnkeyRes.amount_uzs + speedUpRes.amount_uzs) *
          100,
      ) / 100;

    const totalOutcomeUsd =
      Math.round(
        (purchaseRes.amount_usd + additionalExpenseRes.amount_usd) * 100,
      ) / 100;
    const totalOutcomeUzs =
      Math.round(
        (purchaseRes.amount_uzs + additionalExpenseRes.amount_uzs) * 100,
      ) / 100;

    const netYieldUsd =
      Math.round((totalIncomeUsd - totalOutcomeUsd) * 100) / 100;
    const netYieldUzs =
      Math.round((totalIncomeUzs - totalOutcomeUzs) * 100) / 100;

    const originLat =
      row.origin_lat !== null && row.origin_lat !== undefined
        ? Number(row.origin_lat)
        : null;
    const originLng =
      row.origin_lng !== null && row.origin_lng !== undefined
        ? Number(row.origin_lng)
        : null;
    const destLat =
      row.destination_lat !== null && row.destination_lat !== undefined
        ? Number(row.destination_lat)
        : null;
    const destLng =
      row.destination_lng !== null && row.destination_lng !== undefined
        ? Number(row.destination_lng)
        : null;

    const originMapsUrl =
      originLat !== null && originLng !== null
        ? `https://www.google.com/maps/search/?api=1&query=${originLat},${originLng}`
        : row.origin_city
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.origin_city + (row.origin_country ? ', ' + row.origin_country : ''))}`
          : null;

    const destMapsUrl =
      destLat !== null && destLng !== null
        ? `https://www.google.com/maps/search/?api=1&query=${destLat},${destLng}`
        : row.destination_city
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.destination_city + (row.destination_country ? ', ' + row.destination_country : ''))}`
          : null;

    const routeMapsUrl =
      originLat !== null &&
      originLng !== null &&
      destLat !== null &&
      destLng !== null
        ? `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}`
        : row.origin_city && row.destination_city
          ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(row.origin_city + (row.origin_country ? ', ' + row.origin_country : ''))}&destination=${encodeURIComponent(row.destination_city + (row.destination_country ? ', ' + row.destination_country : ''))}`
          : null;

    return {
      id: row.id,
      cargo_type: row.cargo_type,
      volume: row.volume ? Number(row.volume) : null,
      weight: row.weight ? Number(row.weight) : null,
      load_code: row.cargo_type === 'LTL' ? row.load_code || null : null,
      is_turnkey: Boolean(row.is_turnkey),
      turnkey_price: Number(row.turnkey_price || 0),
      turnkey_currency: turnkeyCurrency,
      turnkey_amount_usd: turnkeyRes.amount_usd,
      turnkey_amount_uzs: turnkeyRes.amount_uzs,
      is_speed_up: isSpeedUp,
      speed_up: speedUpAmount,
      speed_up_price: speedUpAmount,
      speed_up_currency: speedUpCurrency,
      speed_up_amount_usd: speedUpRes.amount_usd,
      speed_up_amount_uzs: speedUpRes.amount_uzs,
      additional_expense: additionalExpenseAmount,
      additional_expense_currency: additionalExpenseCurrency,
      additional_expense_amount_usd: additionalExpenseRes.amount_usd,
      additional_expense_amount_uzs: additionalExpenseRes.amount_uzs,
      total_income_usd: totalIncomeUsd,
      total_outcome_usd: totalOutcomeUsd,
      container_type: row.container_type,
      transport_types:
        row.transport_types ||
        (row.container_type
          ? [
              this.inferTransportType(
                row.container_type,
                row.cargo_type,
                row.container_truck_id,
              ),
            ]
          : ['auto']),
      container_truck_id: row.container_truck_id,
      consolidation_id: row.consolidation_id || null,
      consolidation: row.consolidation_id
        ? {
            id: row.consolidation_id,
            consolidation_code: row.consolidation_code,
            container_truck_id: row.container_truck_id,
            status: row.consolidation_status,
            carrier_name: row.consolidation_carrier_name,
            max_volume_capacity: row.consolidation_max_volume
              ? Number(row.consolidation_max_volume)
              : null,
            max_weight_capacity: row.consolidation_max_weight
              ? Number(row.consolidation_max_weight)
              : null,
          }
        : null,
      agent_name: row.agent_name,
      cargo: row.cargo,
      origin: {
        city: row.origin_city || null,
        country: row.origin_country || null,
        country_code: row.origin_country_code || null,
        geoname_id: row.origin_geoname_id
          ? Number(row.origin_geoname_id)
          : null,
        latitude: originLat,
        longitude: originLng,
        display_name: row.origin_city
          ? `${row.origin_city}${row.origin_country ? ', ' + row.origin_country : ''}${row.origin_country_code ? ' (' + row.origin_country_code + ')' : ''}`
          : null,
        google_maps_url: originMapsUrl,
      },
      origin_city: row.origin_city || null,
      origin_country: row.origin_country || null,
      origin_country_code: row.origin_country_code || null,
      origin_geoname_id: row.origin_geoname_id
        ? Number(row.origin_geoname_id)
        : null,
      destination: {
        city: row.destination_city || null,
        country: row.destination_country || null,
        country_code: row.destination_country_code || null,
        geoname_id: row.destination_geoname_id
          ? Number(row.destination_geoname_id)
          : null,
        latitude: destLat,
        longitude: destLng,
        display_name: row.destination_city
          ? `${row.destination_city}${row.destination_country ? ', ' + row.destination_country : ''}${row.destination_country_code ? ' (' + row.destination_country_code + ')' : ''}`
          : null,
        google_maps_url: destMapsUrl,
      },
      destination_city: row.destination_city || null,
      destination_country: row.destination_country || null,
      destination_country_code: row.destination_country_code || null,
      destination_geoname_id: row.destination_geoname_id
        ? Number(row.destination_geoname_id)
        : null,
      route: {
        origin: row.origin_city || null,
        destination: row.destination_city || null,
        origin_display: row.origin_city
          ? `${row.origin_city}${row.origin_country ? ', ' + row.origin_country : ''}`
          : null,
        destination_display: row.destination_city
          ? `${row.destination_city}${row.destination_country ? ', ' + row.destination_country : ''}`
          : null,
        google_maps_dir_url: routeMapsUrl,
      },
      confirmed_date: row.confirmed_date
        ? this.formatDateStr(row.confirmed_date)
        : null,
      loaded_date: row.loaded_date ? this.formatDateStr(row.loaded_date) : null,
      arrived_date: row.arrived_date
        ? this.formatDateStr(row.arrived_date)
        : null,
      purchase_price: purchaseAmount,
      purchase_currency: row.purchase_currency,
      purchase_date: purchaseDate,
      purchase_usd_rate: purchaseRes.usd_rate_used,
      purchase_amount_usd: purchaseRes.amount_usd,
      purchase_amount_uzs: purchaseRes.amount_uzs,
      sell_price: sellAmount,
      sell_currency: row.sell_currency,
      sell_date: sellDate,
      sell_usd_rate: sellRes.usd_rate_used,
      sell_amount_usd: sellRes.amount_usd,
      sell_amount_uzs: sellRes.amount_uzs,
      net_yield: netYieldUsd,
      net_yield_details: {
        amount_usd: netYieldUsd,
        amount_uzs: netYieldUzs,
      },
      usd_rmb_rate: row.usd_rmb_rate ? Number(row.usd_rmb_rate) : null,
      status: row.status,
      payment_status: row.payment_status || 'waiting',
      payment_deadline_days:
        row.payment_deadline_days !== null &&
        row.payment_deadline_days !== undefined
          ? Number(row.payment_deadline_days)
          : 15,
      is_kpi_received: Boolean(row.is_kpi_received),
      kpi_received_at: row.kpi_received_at || null,
      description: row.description,
      client_id: row.client_id,
      client: {
        id: row.client_id,
        first_name: row.client_first_name,
        last_name: row.client_last_name,
        company_name: row.client_company,
        phone: row.client_phone,
      },
      employee_id: row.employee_id,
      employee: {
        id: row.employee_id,
        first_name: row.emp_first_name,
        last_name: row.emp_last_name,
      },
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Delete cargo registration.
   */
  async deleteCargoRegistration(
    id: string,
    user: { id: string; role?: string },
  ) {
    const existing = await this.knex('cargo_registrations')
      .where('id', id)
      .first();

    if (!existing) {
      throw new NotFoundException({
        message: 'Cargo registration not found',
        location: 'cargo_not_found',
      });
    }

    const canRegisterEveryone = await this.checkCanRegisterForEveryone(user);
    const userEmployeeId = await this.getUserEmployeeId(user.id);

    if (!canRegisterEveryone) {
      if (!userEmployeeId || existing.employee_id !== userEmployeeId) {
        throw new ForbiddenException({
          message:
            'You do not have permission to delete cargo registered for other employees',
          location: 'permission_denied_for_other_employees',
        });
      }
    }

    await this.knex('cargo_registrations').where('id', id).del();

    await this.invalidateCache();

    return {
      message: 'Cargo registration successfully deleted',
      id,
    };
  }

  /**
   * Apply dynamic multi-field sorting to cargo registrations query.
   */
  private applySorting(
    queryBuilder: any,
    sortByParam?: string,
    sortOrderParam?: string,
  ) {
    const rawOrder = (sortOrderParam || 'desc').toString().toLowerCase();
    const sortOrder: 'asc' | 'desc' = rawOrder === 'asc' ? 'asc' : 'desc';
    const sortBy = (sortByParam || 'created_at')
      .toString()
      .toLowerCase()
      .trim();

    switch (sortBy) {
      case 'purchase_date':
      case 'purchase':
        return queryBuilder.orderBy('cr.purchase_date', sortOrder);
      case 'sell_date':
      case 'sell':
        return queryBuilder.orderBy('cr.sell_date', sortOrder);
      case 'confirmed_date':
      case 'confirmed':
        return queryBuilder.orderBy('cr.confirmed_date', sortOrder);
      case 'loaded_date':
      case 'loaded':
        return queryBuilder.orderBy('cr.loaded_date', sortOrder);
      case 'arrived_date':
      case 'arrived':
        return queryBuilder.orderBy('cr.arrived_date', sortOrder);
      case 'updated_at':
      case 'updated':
        return queryBuilder.orderBy('cr.updated_at', sortOrder);
      case 'client_name':
      case 'client':
      case 'client_full_name':
        return queryBuilder
          .orderBy('c.first_name', sortOrder)
          .orderBy('c.last_name', sortOrder);
      case 'client_first_name':
        return queryBuilder.orderBy('c.first_name', sortOrder);
      case 'client_last_name':
        return queryBuilder.orderBy('c.last_name', sortOrder);
      case 'client_company':
      case 'company_name':
      case 'company':
        return queryBuilder.orderBy('c.company_name', sortOrder);
      case 'employee_name':
      case 'employee':
      case 'employee_full_name':
      case 'emp_name':
        return queryBuilder
          .orderBy('e.first_name', sortOrder)
          .orderBy('e.last_name', sortOrder);
      case 'emp_first_name':
      case 'employee_first_name':
        return queryBuilder.orderBy('e.first_name', sortOrder);
      case 'emp_last_name':
      case 'employee_last_name':
        return queryBuilder.orderBy('e.last_name', sortOrder);
      case 'container_truck_id':
      case 'truck_id':
        return queryBuilder.orderBy('cr.container_truck_id', sortOrder);
      case 'cargo':
        return queryBuilder.orderBy('cr.cargo', sortOrder);
      case 'agent_name':
      case 'agent':
        return queryBuilder.orderBy('cr.agent_name', sortOrder);
      case 'cargo_type':
        return queryBuilder.orderBy('cr.cargo_type', sortOrder);
      case 'container_type':
        return queryBuilder.orderBy('cr.container_type', sortOrder);
      case 'volume':
        return queryBuilder.orderBy('cr.volume', sortOrder);
      case 'weight':
        return queryBuilder.orderBy('cr.weight', sortOrder);
      case 'status':
        return queryBuilder.orderBy('cr.status', sortOrder);
      case 'purchase_price':
        return queryBuilder.orderBy('cr.purchase_price', sortOrder);
      case 'sell_price':
        return queryBuilder.orderBy('cr.sell_price', sortOrder);
      case 'turnkey_price':
      case 'turnkey':
        return queryBuilder.orderBy('cr.turnkey_price', sortOrder);
      case 'is_turnkey':
        return queryBuilder.orderBy('cr.is_turnkey', sortOrder);
      case 'speed_up':
      case 'speed_up_price':
        return queryBuilder.orderBy('cr.speed_up', sortOrder);
      case 'is_speed_up':
        return queryBuilder.orderBy('cr.is_speed_up', sortOrder);
      case 'additional_expense':
      case 'expense':
        return queryBuilder.orderBy('cr.additional_expense', sortOrder);
      case 'id':
        return queryBuilder.orderBy('cr.id', sortOrder);
      case 'created_at':
      case 'created_date':
      case 'created':
      default:
        return queryBuilder.orderBy('cr.created_at', sortOrder);
    }
  }
}
