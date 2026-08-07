import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientDto } from './dto/query-client.dto';

@Injectable()
export class ClientsService {
  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  /**
   * Normalize phone number to contain only digits.
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  /**
   * Helper to format effective client object with assigned employee details and attachments.
   */
  private formatClientResponse(clientRow: any, attachments: any[] = []) {
    const assignedEmployee = clientRow.employee_id
      ? {
          id: clientRow.employee_id,
          first_name: clientRow.employee_first_name,
          last_name: clientRow.employee_last_name,
          phone: clientRow.employee_phone,
          color: clientRow.employee_color,
        }
      : null;

    const effectiveColor = assignedEmployee?.color || '#808080';

    // Clean joined employee fields from main client payload
    const {
      employee_id,
      employee_first_name,
      employee_last_name,
      employee_phone,
      employee_color,
      ...cleanClient
    } = clientRow;

    return {
      ...cleanClient,
      effective_color: effectiveColor,
      assigned_employee: assignedEmployee,
      attachments,
    };
  }

  async createClient(dto: CreateClientDto) {
    const normalizedPhone = this.normalizePhone(dto.phone);

    // Check if phone already exists
    const existingPhone = await this.knex('clients')
      .whereRaw(`regexp_replace(phone, '\\D', '', 'g') = ?`, [normalizedPhone])
      .first();

    if (existingPhone) {
      throw new BadRequestException({
        message: `Client with phone number "${dto.phone}" already exists.`,
        location: 'client_phone_exists',
      });
    }

    // Verify assigned employee exists if provided
    if (dto.assigned_employee_id) {
      const employee = await this.knex('employees')
        .where('id', dto.assigned_employee_id)
        .first();

      if (!employee) {
        throw new NotFoundException({
          message: 'Assigned employee not found.',
          location: 'assigned_employee_not_found',
        });
      }
    }

    const [createdClient] = await this.knex('clients')
      .insert({
        first_name: dto.first_name,
        last_name: dto.last_name,
        phone: dto.phone,
        company_name: dto.company_name,
        address: dto.address || null,
        assigned_employee_id: dto.assigned_employee_id || null,
        is_active: dto.is_active !== undefined ? dto.is_active : true,
      })
      .returning('*');

    return this.findClientById(createdClient.id);
  }

  async findAllClients(query: QueryClientDto) {
    const page = query.page ? Math.max(1, parseInt(query.page, 10)) : 1;
    const limit = query.limit
      ? Math.min(100, Math.max(1, parseInt(query.limit, 10)))
      : 20;
    const offset = (page - 1) * limit;

    const baseQuery = this.knex('clients')
      .leftJoin('employees', 'clients.assigned_employee_id', 'employees.id')
      .select(
        'clients.*',
        'employees.id as employee_id',
        'employees.first_name as employee_first_name',
        'employees.last_name as employee_last_name',
        'employees.phone as employee_phone',
        'employees.color as employee_color',
      );

    if (query.assigned_employee_id) {
      baseQuery.where(
        'clients.assigned_employee_id',
        query.assigned_employee_id,
      );
    }

    if (query.color) {
      baseQuery.whereRaw(`COALESCE(employees.color, '#808080') = ?`, [
        query.color,
      ]);
    }

    if (query.is_active !== undefined) {
      const isActiveBool =
        query.is_active === 'true' || query.is_active === '1';
      baseQuery.where('clients.is_active', isActiveBool);
    }

    if (query.search) {
      const searchTerm = `%${query.search.trim()}%`;
      const normalizedSearch = this.normalizePhone(query.search);

      baseQuery.where(function () {
        this.whereILike('clients.first_name', searchTerm)
          .orWhereILike('clients.last_name', searchTerm)
          .orWhereILike('clients.company_name', searchTerm)
          .orWhereILike('clients.phone', searchTerm);

        if (normalizedSearch.length >= 3) {
          this.orWhereRaw(
            `regexp_replace(clients.phone, '\\D', '', 'g') ILIKE ?`,
            [`%${normalizedSearch}%`],
          );
        }
      });
    }

    // Count query
    const countQuery = this.knex('clients')
      .leftJoin('employees', 'clients.assigned_employee_id', 'employees.id')
      .count('clients.id as total');

    if (query.assigned_employee_id) {
      countQuery.where(
        'clients.assigned_employee_id',
        query.assigned_employee_id,
      );
    }

    if (query.color) {
      countQuery.whereRaw(`COALESCE(employees.color, '#808080') = ?`, [
        query.color,
      ]);
    }

    if (query.is_active !== undefined) {
      const isActiveBool =
        query.is_active === 'true' || query.is_active === '1';
      countQuery.where('clients.is_active', isActiveBool);
    }

    if (query.search) {
      const searchTerm = `%${query.search.trim()}%`;
      const normalizedSearch = this.normalizePhone(query.search);

      countQuery.where(function () {
        this.whereILike('clients.first_name', searchTerm)
          .orWhereILike('clients.last_name', searchTerm)
          .orWhereILike('clients.company_name', searchTerm)
          .orWhereILike('clients.phone', searchTerm);

        if (normalizedSearch.length >= 3) {
          this.orWhereRaw(
            `regexp_replace(clients.phone, '\\D', '', 'g') ILIKE ?`,
            [`%${normalizedSearch}%`],
          );
        }
      });
    }

    const [{ total }] = await countQuery;
    const totalCount = parseInt(total as string, 10);
    const totalPages = Math.ceil(totalCount / limit);

    const rows = await baseQuery
      .orderBy('clients.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    // Fetch attachments for retrieved clients
    const clientIds = rows.map((r) => r.id);
    let attachmentsMap: Record<string, any[]> = {};

    if (clientIds.length > 0) {
      const attachments = await this.knex('attachments')
        .where('entity_type', 'client')
        .whereIn('entity_id', clientIds)
        .select('*');

      attachmentsMap = attachments.reduce(
        (acc, att) => {
          if (!acc[att.entity_id]) acc[att.entity_id] = [];
          acc[att.entity_id].push(att);
          return acc;
        },
        {} as Record<string, any[]>,
      );
    }

    const formattedData = rows.map((r) =>
      this.formatClientResponse(r, attachmentsMap[r.id] || []),
    );

    return {
      data: formattedData,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages,
      },
    };
  }

  async findClientById(id: string) {
    const row = await this.knex('clients')
      .leftJoin('employees', 'clients.assigned_employee_id', 'employees.id')
      .select(
        'clients.*',
        'employees.id as employee_id',
        'employees.first_name as employee_first_name',
        'employees.last_name as employee_last_name',
        'employees.phone as employee_phone',
        'employees.color as employee_color',
      )
      .where('clients.id', id)
      .first();

    if (!row) {
      throw new NotFoundException({
        message: 'Client not found.',
        location: 'client_not_found',
      });
    }

    const attachments = await this.knex('attachments')
      .where('entity_type', 'client')
      .where('entity_id', id)
      .select('*');

    return this.formatClientResponse(row, attachments);
  }

  async updateClient(id: string, dto: UpdateClientDto) {
    const client = await this.knex('clients').where('id', id).first();
    if (!client) {
      throw new NotFoundException({
        message: 'Client not found.',
        location: 'client_not_found',
      });
    }

    if (dto.phone) {
      const normalizedPhone = this.normalizePhone(dto.phone);
      const existingPhone = await this.knex('clients')
        .whereRaw(`regexp_replace(phone, '\\D', '', 'g') = ?`, [
          normalizedPhone,
        ])
        .whereNot('id', id)
        .first();

      if (existingPhone) {
        throw new BadRequestException({
          message: `Client with phone number "${dto.phone}" already exists.`,
          location: 'client_phone_exists',
        });
      }
    }

    if (dto.assigned_employee_id) {
      const employee = await this.knex('employees')
        .where('id', dto.assigned_employee_id)
        .first();

      if (!employee) {
        throw new NotFoundException({
          message: 'Assigned employee not found.',
          location: 'assigned_employee_not_found',
        });
      }
    }

    const updatePayload: Record<string, any> = {
      updated_at: this.knex.fn.now(),
    };

    if (dto.first_name !== undefined) updatePayload.first_name = dto.first_name;
    if (dto.last_name !== undefined) updatePayload.last_name = dto.last_name;
    if (dto.phone !== undefined) updatePayload.phone = dto.phone;
    if (dto.company_name !== undefined)
      updatePayload.company_name = dto.company_name;
    if (dto.address !== undefined) updatePayload.address = dto.address;
    if (dto.assigned_employee_id !== undefined)
      updatePayload.assigned_employee_id = dto.assigned_employee_id;
    if (dto.is_active !== undefined) updatePayload.is_active = dto.is_active;

    await this.knex('clients').where('id', id).update(updatePayload);

    return this.findClientById(id);
  }

  async deleteClient(id: string) {
    const client = await this.knex('clients').where('id', id).first();
    if (!client) {
      throw new NotFoundException({
        message: 'Client not found.',
        location: 'client_not_found',
      });
    }

    // Clean up associated attachments
    await this.knex('attachments')
      .where('entity_type', 'client')
      .where('entity_id', id)
      .delete();

    await this.knex('clients').where('id', id).delete();
  }

  async getClientColorStats() {
    const colorStats = await this.knex('clients')
      .leftJoin('employees', 'clients.assigned_employee_id', 'employees.id')
      .select(this.knex.raw(`COALESCE(employees.color, '#808080') as color`))
      .count('clients.id as client_count')
      .groupByRaw(`COALESCE(employees.color, '#808080')`);

    const employeeStats = await this.knex('clients')
      .leftJoin('employees', 'clients.assigned_employee_id', 'employees.id')
      .select(
        'employees.id as employee_id',
        'employees.first_name',
        'employees.last_name',
        'employees.color as employee_default_color',
      )
      .count('clients.id as client_count')
      .groupBy(
        'employees.id',
        'employees.first_name',
        'employees.last_name',
        'employees.color',
      );

    return {
      total_clients: colorStats.reduce(
        (acc, curr) => acc + parseInt(curr.client_count as string, 10),
        0,
      ),
      by_color: colorStats.map((c) => ({
        color: c.color,
        count: parseInt(c.client_count as string, 10),
      })),
      by_employee: employeeStats.map((e) => ({
        employee_id: e.employee_id || null,
        employee_name: e.employee_id
          ? `${e.first_name} ${e.last_name}`
          : 'Unassigned',
        default_color: e.employee_default_color || '#808080',
        count: parseInt(e.client_count as string, 10),
      })),
    };
  }
}
