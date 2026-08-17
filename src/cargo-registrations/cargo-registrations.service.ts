import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { CurrencyService } from '../currency/currency.service';
import {
  CreateCargoRegistrationDto,
  UpdateCargoRegistrationDto,
  QueryCargoRegistrationDto,
  ALLOWED_CONTAINER_TYPES,
} from './dto/cargo-registrations.dto';

@Injectable()
export class CargoRegistrationsService {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly currencyService: CurrencyService,
  ) {}

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
    }
  }

  /**
   * Safe helper to format Date objects, date strings, or fallback to YYYY-MM-DD.
   */
  private formatDateStr(d: any): string {
    if (!d) return new Date().toISOString().slice(0, 10);
    if (typeof d === 'string') return d.slice(0, 10);
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    try {
      return new Date(d).toISOString().slice(0, 10);
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  /**
   * Validate RMB rate condition.
   */
  private validateRmbRateRule(data: {
    purchase_currency: string;
    sell_currency: string;
    usd_rmb_rate?: number | null;
  }) {
    const isRmbInvolved =
      data.purchase_currency === 'RMB' || data.sell_currency === 'RMB';

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
        : 12850;
      return {
        amount_usd: 0,
        amount_uzs: 0,
        usd_rate_used: customRate || defaultUsd,
      };
    }

    const usdObj = rates['USD'] || { rate: 12850, nominal: 1 };
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
          rates['CNY'] || { rate: 1815, nominal: 1 };
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
      const rubObj = rates['RUB'] || { rate: 145, nominal: 1 };
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
   * Create new cargo registration.
   */
  async createCargoRegistration(
    user: { id: string; role?: string },
    dto: CreateCargoRegistrationDto,
  ) {
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
    });

    // Validate RMB rate rule
    this.validateRmbRateRule({
      purchase_currency: dto.purchase_currency,
      sell_currency: dto.sell_currency,
      usd_rmb_rate: dto.usd_rmb_rate,
    });

    const purchaseDate = this.formatDateStr(
      dto.purchase_date || dto.confirmed_date,
    );
    const sellDate = this.formatDateStr(dto.sell_date);

    const purchaseRates =
      await this.currencyService.getRatesForDate(purchaseDate);
    const sellRates = await this.currencyService.getRatesForDate(sellDate);

    const purchaseRes = this.convertPriceToUsdAndUzs(
      dto.purchase_price,
      dto.purchase_currency,
      purchaseRates,
      dto.usd_rmb_rate,
      dto.purchase_exchange_rate,
    );

    const sellRes = this.convertPriceToUsdAndUzs(
      dto.sell_price,
      dto.sell_currency,
      sellRates,
      dto.usd_rmb_rate,
      dto.sell_exchange_rate,
    );

    const [inserted] = await this.knex('cargo_registrations')
      .insert({
        cargo_type: dto.cargo_type,
        volume: dto.cargo_type === 'LTL' ? dto.volume : null,
        weight: dto.cargo_type === 'LTL' ? dto.weight : null,
        container_type:
          dto.cargo_type === 'FTL' && dto.container_type
            ? dto.container_type.trim()
            : null,
        container_truck_id: dto.container_truck_id.trim(),
        agent_name: dto.agent_name.trim(),
        cargo: dto.cargo.trim(),
        confirmed_date: dto.confirmed_date || null,
        loaded_date: dto.loaded_date || null,
        arrived_date: dto.arrived_date || null,
        purchase_price: dto.purchase_price,
        purchase_currency: dto.purchase_currency,
        purchase_date: purchaseDate,
        purchase_usd_rate: purchaseRes.usd_rate_used,
        purchase_custom_rate: dto.purchase_exchange_rate || null,
        sell_price: dto.sell_price,
        sell_currency: dto.sell_currency,
        sell_date: sellDate,
        sell_usd_rate: sellRes.usd_rate_used,
        sell_custom_rate: dto.sell_exchange_rate || null,
        usd_rmb_rate: dto.usd_rmb_rate || null,
        status: dto.status || 'Waiting',
        description: dto.description || null,
        client_id: dto.client_id,
        employee_id: finalEmployeeId,
      })
      .returning('id');

    const insertedId = typeof inserted === 'object' ? inserted.id : inserted;
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
    });

    const effectivePurchaseCurrency =
      dto.purchase_currency || existing.purchase_currency;
    const effectiveSellCurrency = dto.sell_currency || existing.sell_currency;
    const effectiveUsdRmbRate =
      dto.usd_rmb_rate !== undefined ? dto.usd_rmb_rate : existing.usd_rmb_rate;

    this.validateRmbRateRule({
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
      updatePayload.container_type = null;
    } else {
      if (dto.container_type !== undefined)
        updatePayload.container_type = dto.container_type.trim();
      updatePayload.volume = null;
      updatePayload.weight = null;
    }

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
    if (dto.description !== undefined)
      updatePayload.description = dto.description || null;
    if (dto.client_id !== undefined) updatePayload.client_id = dto.client_id;
    if (dto.employee_id !== undefined)
      updatePayload.employee_id = dto.employee_id;

    await this.knex('cargo_registrations')
      .where('id', id)
      .update(updatePayload);

    return this.findCargoRegistrationDetails(id);
  }

  /**
   * Find all cargo registrations with filters and pagination.
   */
  async findAllCargoRegistrations(query: QueryCargoRegistrationDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const offset =
      query.offset !== undefined
        ? Math.max(0, Number(query.offset))
        : (page - 1) * limit;

    const baseQuery = this.knex('cargo_registrations as cr')
      .leftJoin('clients as c', 'cr.client_id', 'c.id')
      .leftJoin('employees as e', 'cr.employee_id', 'e.id');

    // Apply Filters
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

    // Search filter across container_truck_id and cargo
    if (query.search && query.search.trim()) {
      const searchTerm = `%${query.search.trim()}%`;
      baseQuery.where((builder) => {
        builder
          .where('cr.container_truck_id', 'ILIKE', searchTerm)
          .orWhere('cr.cargo', 'ILIKE', searchTerm);
      });
    }

    // Clone query for totals count & aggregated financial calculation
    const countQuery = baseQuery.clone();
    const countResult = await countQuery.count('cr.id as total').first();
    const total = parseInt((countResult?.total as string) || '0', 10);

    // Fetch all matching rows for aggregate calculation (meta)
    const allMatchingRows = await baseQuery
      .clone()
      .select(
        'cr.purchase_price',
        'cr.purchase_currency',
        'cr.purchase_date',
        'cr.purchase_usd_rate',
        'cr.purchase_custom_rate',
        'cr.sell_price',
        'cr.sell_currency',
        'cr.sell_date',
        'cr.sell_usd_rate',
        'cr.sell_custom_rate',
        'cr.usd_rmb_rate',
        'cr.confirmed_date',
        'cr.created_at',
      );

    // Fetch paginated rows for data list
    const rows = await baseQuery
      .select(
        'cr.id',
        'cr.cargo_type',
        'cr.volume',
        'cr.weight',
        'cr.container_type',
        'cr.container_truck_id',
        'cr.agent_name',
        'cr.cargo',
        'cr.usd_rmb_rate',
        'cr.purchase_price',
        'cr.purchase_currency',
        'cr.purchase_date',
        'cr.purchase_usd_rate',
        'cr.purchase_custom_rate',
        'cr.sell_price',
        'cr.sell_currency',
        'cr.sell_date',
        'cr.sell_usd_rate',
        'cr.sell_custom_rate',
        'cr.confirmed_date',
        'cr.created_at',
        'cr.status',
        'c.first_name as client_first_name',
        'c.last_name as client_last_name',
        'c.company_name as client_company',
        'e.first_name as emp_first_name',
        'e.last_name as emp_last_name',
      )
      .orderBy('cr.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    // Batch resolve currency rates for all unique dates in matching and paginated rows
    const uniqueDates = new Set<string>();
    for (const row of allMatchingRows) {
      const purchaseDate = this.formatDateStr(
        row.purchase_date || row.confirmed_date || row.created_at,
      );
      const sellDate = this.formatDateStr(row.sell_date || row.created_at);
      uniqueDates.add(purchaseDate);
      uniqueDates.add(sellDate);
    }
    for (const row of rows) {
      const purchaseDate = this.formatDateStr(
        row.purchase_date || row.confirmed_date || row.created_at,
      );
      const sellDate = this.formatDateStr(row.sell_date || row.created_at);
      uniqueDates.add(purchaseDate);
      uniqueDates.add(sellDate);
    }

    const ratesMap = new Map<string, Record<string, any>>();
    await Promise.all(
      Array.from(uniqueDates).map(async (d) => {
        const rates = await this.currencyService.getRatesForDate(d);
        ratesMap.set(d, rates);
      }),
    );

    const grossSalesRevenue: Record<string, number> = {
      UZS: 0,
      USD: 0,
      RUB: 0,
      RMB: 0,
    };

    let totalGrossSalesRevenueUsd = 0;
    let totalGrossSalesRevenueUzs = 0;
    let totalCalculatedNetYieldUsd = 0;
    let totalCalculatedNetYieldUzs = 0;

    for (const row of allMatchingRows) {
      const sellPrice = Number(row.sell_price || 0);
      const purchasePrice = Number(row.purchase_price || 0);
      const sellCurr = row.sell_currency || 'UZS';
      const purchaseCurr = row.purchase_currency || 'UZS';

      // Gross Sales Revenue aggregated by raw sell currency
      grossSalesRevenue[sellCurr] =
        (grossSalesRevenue[sellCurr] || 0) + sellPrice;

      const purchaseDate = this.formatDateStr(
        row.purchase_date || row.confirmed_date || row.created_at,
      );
      const sellDate = this.formatDateStr(row.sell_date || row.created_at);

      const purchaseRates = ratesMap.get(purchaseDate) || {};
      const sellRates = ratesMap.get(sellDate) || {};

      const purchaseRes = this.convertPriceToUsdAndUzs(
        purchasePrice,
        purchaseCurr,
        purchaseRates,
        row.usd_rmb_rate ? Number(row.usd_rmb_rate) : null,
        row.purchase_custom_rate
          ? Number(row.purchase_custom_rate)
          : row.purchase_usd_rate
            ? Number(row.purchase_usd_rate)
            : null,
      );

      const sellRes = this.convertPriceToUsdAndUzs(
        sellPrice,
        sellCurr,
        sellRates,
        row.usd_rmb_rate ? Number(row.usd_rmb_rate) : null,
        row.sell_custom_rate
          ? Number(row.sell_custom_rate)
          : row.sell_usd_rate
            ? Number(row.sell_usd_rate)
            : null,
      );

      totalGrossSalesRevenueUsd += sellRes.amount_usd;
      totalGrossSalesRevenueUzs += sellRes.amount_uzs;
      totalCalculatedNetYieldUsd += sellRes.amount_usd - purchaseRes.amount_usd;
      totalCalculatedNetYieldUzs += sellRes.amount_uzs - purchaseRes.amount_uzs;
    }

    // Round values in meta
    for (const curr of Object.keys(grossSalesRevenue)) {
      grossSalesRevenue[curr] = Math.round(grossSalesRevenue[curr] * 100) / 100;
    }

    const formattedData = rows.map((r) => {
      const clientName = r.client_first_name
        ? `${r.client_first_name} ${r.client_last_name || ''}`.trim()
        : r.client_company || 'N/A';
      const employeeName = r.emp_first_name
        ? `${r.emp_first_name} ${r.emp_last_name || ''}`.trim()
        : 'N/A';

      const purchaseAmount = Number(r.purchase_price);
      const sellAmount = Number(r.sell_price);

      const purchaseDate = this.formatDateStr(
        r.purchase_date || r.confirmed_date || r.created_at,
      );
      const sellDate = this.formatDateStr(r.sell_date || r.created_at);

      const purchaseRates = ratesMap.get(purchaseDate) || {};
      const sellRates = ratesMap.get(sellDate) || {};

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

      const netYieldUsd =
        Math.round((sellRes.amount_usd - purchaseRes.amount_usd) * 100) / 100;
      const netYieldUzs =
        Math.round((sellRes.amount_uzs - purchaseRes.amount_uzs) * 100) / 100;

      return {
        id: r.id,
        cargo_type: r.cargo_type,
        volume: r.volume ? Number(r.volume) : null,
        weight: r.weight ? Number(r.weight) : null,
        container_type: r.container_type,
        container_truck_id: r.container_truck_id,
        agent_name: r.agent_name,
        client_full_name: clientName,
        cargo: r.cargo,
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
      };
    });

    return {
      meta: {
        total,
        limit,
        offset,
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
  }

  /**
   * Aggregate statistics for cargo registrations (LTL vs FTL, financials, status distribution, manager stats).
   */
  async getCargoRegistrationStats(query: QueryCargoRegistrationDto) {
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
    const statusDistribution: Record<string, number> = {
      Waiting: 0,
      'In Transit': 0,
      Border: 0,
      'At Station': 0,
      Delivered: 0,
    };

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

    return {
      summary: {
        total_cargos: meta.total,
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
  }

  /**
   * Get full details of a specific cargo registration.
   */
  async findCargoRegistrationDetails(id: string) {
    const row = await this.knex('cargo_registrations as cr')
      .leftJoin('clients as c', 'cr.client_id', 'c.id')
      .leftJoin('employees as e', 'cr.employee_id', 'e.id')
      .select(
        'cr.*',
        'c.first_name as client_first_name',
        'c.last_name as client_last_name',
        'c.company_name as client_company',
        'c.phone as client_phone',
        'e.first_name as emp_first_name',
        'e.last_name as emp_last_name',
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

    const purchaseDate = this.formatDateStr(
      row.purchase_date || row.confirmed_date || row.created_at,
    );
    const sellDate = this.formatDateStr(row.sell_date || row.created_at);

    const purchaseRates =
      await this.currencyService.getRatesForDate(purchaseDate);
    const sellRates = await this.currencyService.getRatesForDate(sellDate);

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

    const netYieldUsd =
      Math.round((sellRes.amount_usd - purchaseRes.amount_usd) * 100) / 100;
    const netYieldUzs =
      Math.round((sellRes.amount_uzs - purchaseRes.amount_uzs) * 100) / 100;

    return {
      id: row.id,
      cargo_type: row.cargo_type,
      volume: row.volume ? Number(row.volume) : null,
      weight: row.weight ? Number(row.weight) : null,
      container_type: row.container_type,
      container_truck_id: row.container_truck_id,
      agent_name: row.agent_name,
      cargo: row.cargo,
      confirmed_date: row.confirmed_date,
      loaded_date: row.loaded_date,
      arrived_date: row.arrived_date,
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

    return {
      message: 'Cargo registration successfully deleted',
      id,
    };
  }
}
