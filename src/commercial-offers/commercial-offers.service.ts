import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { CreateCommercialOfferDto } from './dto/create-commercial-offer.dto';
import { UpdateCommercialOfferDto } from './dto/update-commercial-offer.dto';
import { QueryCommercialOfferDto } from './dto/query-commercial-offer.dto';
import { CurrencyService } from '../currency/currency.service';
import { Currency } from '../currency/currency.types';

@Injectable()
export class CommercialOffersService {
  private readonly logger = new Logger(CommercialOffersService.name);

  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    @Optional() private readonly currencyService?: CurrencyService,
  ) {}

  /**
   * Generates a unique offer number in format YQ-YYYY-NNNN.
   * Queries the current max sequence for the given year and increments.
   */
  async generateOfferNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `YQ-${year}-`;

    const lastOffer = await this.knex('commercial_offers')
      .where('offer_number', 'like', `${prefix}%`)
      .orderByRaw(`CAST(SUBSTRING(offer_number FROM '\\d+$') AS INTEGER) DESC`)
      .first();

    let nextSequence = 1;
    if (lastOffer) {
      const lastNumber = lastOffer.offer_number.replace(prefix, '');
      nextSequence = parseInt(lastNumber, 10) + 1;
    }

    return `${prefix}${nextSequence.toString().padStart(4, '0')}`;
  }

  /**
   * Format a single commercial offer row for the API response.
   */
  private formatOfferResponse(row: any) {
    return {
      id: row.id,
      offer_number: row.offer_number,
      client_id: row.client_id,
      client_name: row.client_name,
      client_company: row.client_company,
      origin: row.origin,
      destination: row.destination,
      cargo_description: row.cargo_description,
      cargo_weight: row.cargo_weight ? parseFloat(row.cargo_weight) : null,
      cargo_volume: row.cargo_volume ? parseFloat(row.cargo_volume) : null,
      price_usd: parseFloat(row.price_usd),
      price_local: parseFloat(row.price_local),
      inclusions: row.inclusions || [],
      exclusions: row.exclusions || [],
      terms: row.terms,
      status: row.status,
      created_by: row.created_by,
      creator_name: row.creator_username || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Create a new commercial offer.
   * If client_id is provided, auto-populates client_name and client_company from the clients table.
   */
  async createOffer(dto: CreateCommercialOfferDto, userId: string) {
    let clientName = dto.client_name;
    let clientCompany = dto.client_company;

    // If client_id is provided, verify and auto-fill client info
    if (dto.client_id) {
      const client = await this.knex('clients')
        .where('id', dto.client_id)
        .first();

      if (!client) {
        throw new NotFoundException({
          message: 'Client not found with the provided client_id.',
          location: 'client_not_found',
        });
      }

      clientName = `${client.first_name} ${client.last_name}`;
      clientCompany = client.company_name;
    }

    const offerNumber = await this.generateOfferNumber();

    const [created] = await this.knex('commercial_offers')
      .insert({
        offer_number: offerNumber,
        client_id: dto.client_id || null,
        client_name: clientName,
        client_company: clientCompany,
        origin: dto.origin,
        destination: dto.destination,
        cargo_description: dto.cargo_description || null,
        cargo_weight: dto.cargo_weight ?? null,
        cargo_volume: dto.cargo_volume ?? null,
        price_usd: dto.price_usd,
        price_local: dto.price_local,
        inclusions: dto.inclusions ? JSON.stringify(dto.inclusions) : null,
        exclusions: dto.exclusions ? JSON.stringify(dto.exclusions) : null,
        terms: dto.terms || null,
        status: 'draft',
        created_by: userId,
      })
      .returning('*');

    this.logger.log(
      `Created commercial offer ${offerNumber} by user ${userId}`,
    );
    return this.findOfferById(created.id);
  }

  /**
   * Find all commercial offers with pagination and filtering.
   */
  async findAllOffers(query: QueryCommercialOfferDto) {
    const page = query.page ? Math.max(1, parseInt(query.page, 10)) : 1;
    const limit = query.limit
      ? Math.min(100, Math.max(1, parseInt(query.limit, 10)))
      : 20;
    const offset = (page - 1) * limit;

    const baseQuery = this.knex('commercial_offers')
      .leftJoin('users', 'commercial_offers.created_by', 'users.id')
      .select('commercial_offers.*', 'users.username as creator_username');

    const countQuery = this.knex('commercial_offers').count(
      'commercial_offers.id as total',
    );

    // Apply filters
    if (query.status) {
      baseQuery.where('commercial_offers.status', query.status);
      countQuery.where('status', query.status);
    }

    if (query.client_id) {
      baseQuery.where('commercial_offers.client_id', query.client_id);
      countQuery.where('client_id', query.client_id);
    }

    if (query.created_by) {
      baseQuery.where('commercial_offers.created_by', query.created_by);
      countQuery.where('created_by', query.created_by);
    }

    if (query.date_from) {
      baseQuery.where('commercial_offers.created_at', '>=', query.date_from);
      countQuery.where('created_at', '>=', query.date_from);
    }

    if (query.date_to) {
      baseQuery.where('commercial_offers.created_at', '<=', query.date_to);
      countQuery.where('created_at', '<=', query.date_to);
    }

    if (query.search) {
      const searchTerm = `%${query.search.trim()}%`;
      baseQuery.where(function () {
        this.whereILike('commercial_offers.offer_number', searchTerm)
          .orWhereILike('commercial_offers.client_name', searchTerm)
          .orWhereILike('commercial_offers.client_company', searchTerm)
          .orWhereILike('commercial_offers.origin', searchTerm)
          .orWhereILike('commercial_offers.destination', searchTerm);
      });
      countQuery.where(function () {
        this.whereILike('offer_number', searchTerm)
          .orWhereILike('client_name', searchTerm)
          .orWhereILike('client_company', searchTerm)
          .orWhereILike('origin', searchTerm)
          .orWhereILike('destination', searchTerm);
      });
    }

    const [{ total }] = await countQuery;
    const totalCount = parseInt(total as string, 10);
    const totalPages = Math.ceil(totalCount / limit);

    const rows = await baseQuery
      .orderBy('commercial_offers.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map((row) => this.formatOfferResponse(row)),
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Find a single commercial offer by ID.
   */
  async findOfferById(id: string) {
    const row = await this.knex('commercial_offers')
      .leftJoin('users', 'commercial_offers.created_by', 'users.id')
      .select('commercial_offers.*', 'users.username as creator_username')
      .where('commercial_offers.id', id)
      .first();

    if (!row) {
      throw new NotFoundException({
        message: 'Commercial offer not found.',
        location: 'offer_not_found',
      });
    }

    return this.formatOfferResponse(row);
  }

  /**
   * Update an existing commercial offer.
   */
  async updateOffer(id: string, dto: UpdateCommercialOfferDto) {
    const existing = await this.knex('commercial_offers')
      .where('id', id)
      .first();

    if (!existing) {
      throw new NotFoundException({
        message: 'Commercial offer not found.',
        location: 'offer_not_found',
      });
    }

    // If client_id is updated, verify and auto-fill client info
    if (dto.client_id) {
      const client = await this.knex('clients')
        .where('id', dto.client_id)
        .first();

      if (!client) {
        throw new NotFoundException({
          message: 'Client not found with the provided client_id.',
          location: 'client_not_found',
        });
      }

      // Auto-fill client_name and client_company unless explicitly overridden
      if (!dto.client_name) {
        dto.client_name = `${client.first_name} ${client.last_name}`;
      }
      if (!dto.client_company) {
        dto.client_company = client.company_name;
      }
    }

    const updatePayload: Record<string, any> = {
      updated_at: this.knex.fn.now(),
    };

    if (dto.client_id !== undefined) updatePayload.client_id = dto.client_id;
    if (dto.client_name !== undefined)
      updatePayload.client_name = dto.client_name;
    if (dto.client_company !== undefined)
      updatePayload.client_company = dto.client_company;
    if (dto.origin !== undefined) updatePayload.origin = dto.origin;
    if (dto.destination !== undefined)
      updatePayload.destination = dto.destination;
    if (dto.cargo_description !== undefined)
      updatePayload.cargo_description = dto.cargo_description;
    if (dto.cargo_weight !== undefined)
      updatePayload.cargo_weight = dto.cargo_weight;
    if (dto.cargo_volume !== undefined)
      updatePayload.cargo_volume = dto.cargo_volume;
    if (dto.price_usd !== undefined) updatePayload.price_usd = dto.price_usd;
    if (dto.price_local !== undefined)
      updatePayload.price_local = dto.price_local;
    if (dto.inclusions !== undefined)
      updatePayload.inclusions = JSON.stringify(dto.inclusions);
    if (dto.exclusions !== undefined)
      updatePayload.exclusions = JSON.stringify(dto.exclusions);
    if (dto.terms !== undefined) updatePayload.terms = dto.terms;

    await this.knex('commercial_offers').where('id', id).update(updatePayload);

    return this.findOfferById(id);
  }

  /**
   * Update the status of a commercial offer.
   * Enforces valid status transitions:
   * - draft → sent, accepted, rejected
   * - sent → accepted, rejected, draft
   * - accepted → draft (reopen)
   * - rejected → draft (reopen)
   */
  async updateOfferStatus(id: string, newStatus: string) {
    const existing = await this.knex('commercial_offers')
      .where('id', id)
      .first();

    if (!existing) {
      throw new NotFoundException({
        message: 'Commercial offer not found.',
        location: 'offer_not_found',
      });
    }

    const validTransitions: Record<string, string[]> = {
      draft: ['sent', 'accepted', 'rejected'],
      sent: ['accepted', 'rejected', 'draft'],
      accepted: ['draft'],
      rejected: ['draft'],
    };

    const allowedNextStatuses = validTransitions[existing.status] || [];

    if (!allowedNextStatuses.includes(newStatus)) {
      throw new BadRequestException({
        message: `Cannot transition from "${existing.status}" to "${newStatus}". Allowed transitions: ${allowedNextStatuses.join(', ') || 'none'}.`,
        location: 'invalid_status_transition',
      });
    }

    await this.knex('commercial_offers').where('id', id).update({
      status: newStatus,
      updated_at: this.knex.fn.now(),
    });

    this.logger.log(
      `Offer ${existing.offer_number} status: ${existing.status} → ${newStatus}`,
    );

    return this.findOfferById(id);
  }

  /**
   * Duplicate an existing commercial offer.
   * Creates a new copy with fresh offer number and 'draft' status.
   */
  async duplicateOffer(id: string, userId: string) {
    const existing = await this.knex('commercial_offers')
      .where('id', id)
      .first();

    if (!existing) {
      throw new NotFoundException({
        message: 'Commercial offer not found.',
        location: 'offer_not_found',
      });
    }

    const newOfferNumber = await this.generateOfferNumber();

    const [duplicated] = await this.knex('commercial_offers')
      .insert({
        offer_number: newOfferNumber,
        client_id: existing.client_id,
        client_name: existing.client_name,
        client_company: existing.client_company,
        origin: existing.origin,
        destination: existing.destination,
        cargo_description: existing.cargo_description,
        cargo_weight: existing.cargo_weight,
        cargo_volume: existing.cargo_volume,
        price_usd: existing.price_usd,
        price_local: existing.price_local,
        inclusions: existing.inclusions
          ? JSON.stringify(existing.inclusions)
          : null,
        exclusions: existing.exclusions
          ? JSON.stringify(existing.exclusions)
          : null,
        terms: existing.terms,
        status: 'draft',
        created_by: userId,
      })
      .returning('*');

    this.logger.log(
      `Duplicated offer ${existing.offer_number} → ${newOfferNumber}`,
    );

    return this.findOfferById(duplicated.id);
  }

  /**
   * Delete a commercial offer.
   */
  async deleteOffer(id: string) {
    const existing = await this.knex('commercial_offers')
      .where('id', id)
      .first();

    if (!existing) {
      throw new NotFoundException({
        message: 'Commercial offer not found.',
        location: 'offer_not_found',
      });
    }

    await this.knex('commercial_offers').where('id', id).delete();

    this.logger.log(`Deleted commercial offer ${existing.offer_number}`);
  }

  /**
   * Get summary statistics for the dashboard.
   * Returns counts by status and total revenue from accepted offers.
   */
  async getOffersSummary(currency?: Currency) {
    const targetCurrency = currency || Currency.UZS;

    const statusCounts = await this.knex('commercial_offers')
      .select('status')
      .count('id as count')
      .groupBy('status');

    const totalAcceptedRevenue = await this.knex('commercial_offers')
      .where('status', 'accepted')
      .sum('price_usd as total_usd')
      .sum('price_local as total_local');

    const totalOffers =
      await this.knex('commercial_offers').count('id as total');

    const statusMap: Record<string, number> = {
      draft: 0,
      sent: 0,
      accepted: 0,
      rejected: 0,
    };

    statusCounts.forEach((row: any) => {
      statusMap[row.status] = parseInt(row.count as string, 10);
    });

    const totalUsd = parseFloat(
      (totalAcceptedRevenue[0] as any).total_usd || '0',
    );
    const totalLocalUzs = parseFloat(
      (totalAcceptedRevenue[0] as any).total_local || '0',
    );

    let convertedAmount = totalLocalUzs;
    if (targetCurrency === Currency.USD) {
      convertedAmount = totalUsd;
    } else if (targetCurrency !== Currency.UZS && this.currencyService) {
      const res = await this.currencyService.convert(
        totalLocalUzs,
        Currency.UZS,
        targetCurrency,
      );
      convertedAmount = res.converted_amount;
    }

    return {
      currency: targetCurrency,
      total_offers: parseInt((totalOffers[0] as any).total as string, 10),
      by_status: statusMap,
      accepted_revenue: {
        amount: Math.round(convertedAmount * 100) / 100,
        total_usd: totalUsd,
        total_local: totalLocalUzs,
      },
    };
  }
}
