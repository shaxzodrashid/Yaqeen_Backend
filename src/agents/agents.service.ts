import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { QueryAgentDto } from './dto/query-agent.dto';

export interface FormattedAgent {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  phone_number: string | null;
  email: string | null;
  company_name: string | null;
  company_names: string[];
  notes: string | null;
  is_active: boolean;
  cargos_count?: number;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  /**
   * Helper to format display name from first_name, last_name, and company_name.
   */
  getAgentDisplayName(agent: {
    first_name?: string | null;
    last_name?: string | null;
    company_name?: string | null;
  }): string {
    const nameParts = [agent.first_name, agent.last_name]
      .filter((p) => p && p.trim().length > 0)
      .map((p) => p!.trim());
    const fullName = nameParts.join(' ');

    if (fullName && agent.company_name && agent.company_name.trim()) {
      return `${fullName} (${agent.company_name.trim()})`;
    }
    if (fullName) return fullName;
    if (agent.company_name && agent.company_name.trim()) {
      return agent.company_name.trim();
    }
    return 'Unnamed Agent';
  }

  /**
   * Normalizes company names array and primary company name.
   */
  private normalizeCompanyFields(
    companyName?: string,
    companyNames?: string[],
  ): { primaryCompanyName: string | null; allCompanyNames: string[] } {
    const list: string[] = [];
    if (companyName && companyName.trim()) {
      list.push(companyName.trim());
    }
    if (Array.isArray(companyNames)) {
      for (const name of companyNames) {
        if (typeof name === 'string' && name.trim()) {
          const trimmed = name.trim();
          if (!list.includes(trimmed)) {
            list.push(trimmed);
          }
        }
      }
    }

    const primaryCompanyName = list.length > 0 ? list[0] : null;
    return { primaryCompanyName, allCompanyNames: list };
  }

  /**
   * Format agent database row into clean typed response.
   */
  formatAgentRow(row: any): FormattedAgent {
    let companyNames: string[] = [];
    if (row.company_names) {
      if (Array.isArray(row.company_names)) {
        companyNames = row.company_names;
      } else if (typeof row.company_names === 'string') {
        try {
          companyNames = JSON.parse(row.company_names);
        } catch {
          companyNames = [row.company_names];
        }
      }
    }

    const displayName = this.getAgentDisplayName({
      first_name: row.first_name,
      last_name: row.last_name,
      company_name: row.company_name,
    });

    return {
      id: row.id,
      first_name: row.first_name || null,
      last_name: row.last_name || null,
      display_name: displayName,
      phone_number: row.phone_number || null,
      email: row.email || null,
      company_name: row.company_name || null,
      company_names: companyNames,
      notes: row.notes || null,
      is_active: Boolean(row.is_active),
      cargos_count:
        row.cargos_count !== undefined ? Number(row.cargos_count) : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Create a new agent record.
   */
  async createAgent(dto: CreateAgentDto, user?: any): Promise<FormattedAgent> {
    const firstName = dto.first_name?.trim() || null;
    const lastName = dto.last_name?.trim() || null;
    const { primaryCompanyName, allCompanyNames } = this.normalizeCompanyFields(
      dto.company_name,
      dto.company_names,
    );

    if (!firstName && !lastName && !primaryCompanyName) {
      throw new BadRequestException({
        message:
          'At least one of first name, last name, or company name must be provided.',
        location: 'agent_name_required',
      });
    }

    const phoneNumber = (dto.phone_number || dto.phone || '').trim() || null;
    const email = dto.email?.trim().toLowerCase() || null;
    const notes = dto.notes?.trim() || null;
    const isActive = dto.is_active !== undefined ? dto.is_active : true;

    const [inserted] = await this.knex('agents')
      .insert({
        first_name: firstName,
        last_name: lastName,
        phone_number: phoneNumber,
        email,
        company_name: primaryCompanyName,
        company_names: JSON.stringify(allCompanyNames),
        notes,
        is_active: isActive,
      })
      .returning('*');

    this.logger.log(
      `Agent created: ID=${inserted.id}, Name="${this.getAgentDisplayName(inserted)}" by User=${user?.id || 'system'}`,
    );

    return this.formatAgentRow(inserted);
  }

  /**
   * List agents with filtering, search, and pagination.
   */
  async findAllAgents(query: QueryAgentDto) {
    const isAll = query.all === 'true' || query.all === '1';
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(query.limit || '20', 10) || 20),
    );
    const offset = (page - 1) * limit;

    const baseQuery = this.knex('agents as a')
      .leftJoin('cargo_registrations as cr', 'a.id', 'cr.agent_id')
      .groupBy('a.id');

    if (query.is_active !== undefined) {
      const activeBool = query.is_active === 'true' || query.is_active === '1';
      baseQuery.where('a.is_active', activeBool);
    }

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      baseQuery.where((builder) => {
        builder
          .whereILike('a.first_name', term)
          .orWhereILike('a.last_name', term)
          .orWhereILike('a.company_name', term)
          .orWhereILike('a.phone_number', term)
          .orWhereILike('a.email', term)
          .orWhereRaw('a.company_names::text ILIKE ?', [term]);
      });
    }

    // Count total query
    const countQuery = this.knex('agents as a');
    if (query.is_active !== undefined) {
      const activeBool = query.is_active === 'true' || query.is_active === '1';
      countQuery.where('a.is_active', activeBool);
    }
    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      countQuery.where((builder) => {
        builder
          .whereILike('a.first_name', term)
          .orWhereILike('a.last_name', term)
          .orWhereILike('a.company_name', term)
          .orWhereILike('a.phone_number', term)
          .orWhereILike('a.email', term)
          .orWhereRaw('a.company_names::text ILIKE ?', [term]);
      });
    }

    const totalCountRes = await countQuery.count('a.id as total').first();
    const total = totalCountRes ? Number(totalCountRes.total) : 0;

    // Build select query
    const selectQuery = baseQuery.select(
      'a.*',
      this.knex.raw('COUNT(cr.id) as cargos_count'),
    );

    // Sorting
    const sortField = (query.sort_by || 'created_at').toLowerCase();
    const sortOrder = (query.sort_order || 'DESC').toUpperCase() as
      'ASC' | 'DESC';

    if (sortField === 'name' || sortField === 'display_name') {
      selectQuery.orderByRaw(
        `COALESCE(a.first_name, '') || ' ' || COALESCE(a.last_name, '') ${sortOrder}`,
      );
    } else if (sortField === 'company_name' || sortField === 'company') {
      selectQuery.orderBy('a.company_name', sortOrder);
    } else if (sortField === 'cargos_count') {
      selectQuery.orderByRaw(`COUNT(cr.id) ${sortOrder}`);
    } else {
      selectQuery.orderBy('a.created_at', sortOrder);
    }

    if (!isAll) {
      selectQuery.limit(limit).offset(offset);
    }

    const rows = await selectQuery;
    const data = rows.map((r) => this.formatAgentRow(r));

    return {
      data,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages: isAll ? 1 : Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get single agent by ID with detailed cargo metrics.
   */
  async findAgentById(id: string) {
    const agent = await this.knex('agents').where('id', id).first();
    if (!agent) {
      throw new NotFoundException({
        message: 'Agent not found.',
        location: 'agent_not_found',
      });
    }

    // Compute cargo statistics
    const stats = await this.knex('cargo_registrations')
      .where('agent_id', id)
      .select(
        this.knex.raw('COUNT(id) as total_cargos_count'),
        this.knex.raw(
          `COUNT(CASE WHEN LOWER(COALESCE(status, '')) NOT IN ('arrived', 'delivered', 'completed') THEN 1 END) as active_cargos_count`,
        ),
        this.knex.raw(
          `COALESCE(SUM(CASE WHEN payment_status IS NULL OR LOWER(payment_status) != 'paid' THEN purchase_price ELSE 0 END), 0) as total_payable_amount`,
        ),
      )
      .first();

    // Fetch recent 5 cargos
    const recentCargos = await this.knex('cargo_registrations')
      .where('agent_id', id)
      .select(
        'id',
        'cargo',
        'cargo_type',
        'container_truck_id',
        'status',
        'purchase_price',
        'purchase_currency',
        'confirmed_date',
        'created_at',
      )
      .orderBy('created_at', 'desc')
      .limit(5);

    const formatted = this.formatAgentRow(agent);
    return {
      ...formatted,
      stats: {
        total_cargos_count: Number(stats?.total_cargos_count || 0),
        active_cargos_count: Number(stats?.active_cargos_count || 0),
        total_payable_amount: Number(stats?.total_payable_amount || 0),
      },
      recent_cargos: recentCargos,
    };
  }

  /**
   * Update agent details and optionally synchronize cargo_registrations.agent_name.
   */
  async updateAgent(id: string, dto: UpdateAgentDto, user?: any) {
    const agent = await this.knex('agents').where('id', id).first();
    if (!agent) {
      throw new NotFoundException({
        message: 'Agent not found.',
        location: 'agent_not_found',
      });
    }

    const updatePayload: any = {
      updated_at: this.knex.fn.now(),
    };

    if (dto.first_name !== undefined) {
      updatePayload.first_name = dto.first_name?.trim() || null;
    }
    if (dto.last_name !== undefined) {
      updatePayload.last_name = dto.last_name?.trim() || null;
    }
    if (dto.phone_number !== undefined || dto.phone !== undefined) {
      updatePayload.phone_number =
        (dto.phone_number || dto.phone || '').trim() || null;
    }
    if (dto.email !== undefined) {
      updatePayload.email = dto.email?.trim().toLowerCase() || null;
    }
    if (dto.notes !== undefined) {
      updatePayload.notes = dto.notes?.trim() || null;
    }
    if (dto.is_active !== undefined) {
      updatePayload.is_active = dto.is_active;
    }

    if (dto.company_name !== undefined || dto.company_names !== undefined) {
      const existingCompanyNames = Array.isArray(agent.company_names)
        ? agent.company_names
        : [];
      const { primaryCompanyName, allCompanyNames } =
        this.normalizeCompanyFields(
          dto.company_name !== undefined
            ? dto.company_name
            : agent.company_name,
          dto.company_names !== undefined
            ? dto.company_names
            : existingCompanyNames,
        );
      updatePayload.company_name = primaryCompanyName;
      updatePayload.company_names = JSON.stringify(allCompanyNames);
    }

    await this.knex('agents').where('id', id).update(updatePayload);

    // If name changed, synchronize agent_name across linked cargo registrations
    const updatedAgent = await this.knex('agents').where('id', id).first();
    const newDisplayName = this.getAgentDisplayName(updatedAgent);

    await this.knex('cargo_registrations')
      .where('agent_id', id)
      .update({ agent_name: newDisplayName });

    this.logger.log(
      `Agent updated: ID=${id}, NewName="${newDisplayName}" by User=${user?.id || 'system'}`,
    );

    return this.findAgentById(id);
  }

  /**
   * Delete or deactivate agent.
   */
  async deleteAgent(id: string, user?: any) {
    const agent = await this.knex('agents').where('id', id).first();
    if (!agent) {
      throw new NotFoundException({
        message: 'Agent not found.',
        location: 'agent_not_found',
      });
    }

    // Check if any cargo registrations are linked
    const linkedCargos = await this.knex('cargo_registrations')
      .where('agent_id', id)
      .count('id as total')
      .first();

    const cargoCount = linkedCargos ? Number(linkedCargos.total) : 0;

    if (cargoCount > 0) {
      // Deactivate rather than delete to preserve historical integrity
      await this.knex('agents')
        .where('id', id)
        .update({ is_active: false, updated_at: this.knex.fn.now() });

      this.logger.log(
        `Agent ID=${id} deactivated (soft-deleted) due to ${cargoCount} linked cargo registrations by User=${user?.id || 'system'}`,
      );
      return {
        message:
          'Agent has associated cargo records and was deactivated instead of deleted.',
        deactivated: true,
      };
    }

    // If no cargo records, delete permanently
    await this.knex('agents').where('id', id).delete();
    this.logger.log(
      `Agent ID=${id} permanently deleted by User=${user?.id || 'system'}`,
    );
    return {
      message: 'Agent deleted successfully.',
      deleted: true,
    };
  }

  /**
   * Fast dropdown list of active agents for frontend selectors.
   */
  async getDropdownAgents(search?: string) {
    const query = this.knex('agents')
      .select('id', 'first_name', 'last_name', 'company_name', 'phone_number')
      .where('is_active', true);

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query.where((builder) => {
        builder
          .whereILike('first_name', term)
          .orWhereILike('last_name', term)
          .orWhereILike('company_name', term)
          .orWhereILike('phone_number', term);
      });
    }

    query.orderByRaw("COALESCE(first_name, company_name, '') ASC");

    const rows = await query;
    return rows.map((r) => ({
      id: r.id,
      name: this.getAgentDisplayName(r),
      first_name: r.first_name,
      last_name: r.last_name,
      company_name: r.company_name,
      phone_number: r.phone_number,
    }));
  }
}
