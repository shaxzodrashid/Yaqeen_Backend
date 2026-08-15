import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
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
   * Helper to check if a user has "can_work_with_all_clients" permission.
   */
  async checkCanWorkWithAllClients(user?: {
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

    const clientPerms = permissions?.clients;
    if (clientPerms && clientPerms.can_work_with_all_clients === true) {
      return true;
    }

    // Default system ROP role allows working with all clients
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
    const cleanClient = { ...clientRow };
    delete cleanClient.employee_id;
    delete cleanClient.employee_first_name;
    delete cleanClient.employee_last_name;
    delete cleanClient.employee_phone;
    delete cleanClient.employee_color;

    return {
      ...cleanClient,
      effective_color: effectiveColor,
      assigned_employee: assignedEmployee,
      attachments,
    };
  }

  async createClient(
    dto: CreateClientDto,
    user?: { id: string; role?: string },
  ) {
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

    let finalAssignedEmployeeId = dto.assigned_employee_id || null;

    if (user) {
      const canWorkWithAll = await this.checkCanWorkWithAllClients(user);
      const userEmployeeId = await this.getUserEmployeeId(user.id);

      if (!canWorkWithAll) {
        if (!userEmployeeId) {
          throw new BadRequestException({
            message:
              'Current user account is not linked to an employee profile',
            location: 'user_not_linked_to_employee',
          });
        }
        if (
          dto.assigned_employee_id &&
          dto.assigned_employee_id !== userEmployeeId
        ) {
          throw new ForbiddenException({
            message:
              'You do not have permission to assign clients to other employees',
            location: 'permission_denied_for_other_employees',
          });
        }
        finalAssignedEmployeeId = userEmployeeId;
      }
    }

    // Verify assigned employee exists if provided
    if (finalAssignedEmployeeId) {
      const employee = await this.knex('employees')
        .where('id', finalAssignedEmployeeId)
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
        assigned_employee_id: finalAssignedEmployeeId,
        is_active: dto.is_active !== undefined ? dto.is_active : true,
      })
      .returning('*');

    return this.findClientById(createdClient.id);
  }

  async findAllClients(
    query: QueryClientDto,
    user?: { id: string; role?: string },
  ) {
    const page = query.page ? Math.max(1, parseInt(query.page, 10)) : 1;
    const limit = query.limit
      ? Math.min(100, Math.max(1, parseInt(query.limit, 10)))
      : 20;
    const offset = (page - 1) * limit;

    let canWorkWithAll = false;
    let userEmployeeId: string | null = null;

    if (user) {
      canWorkWithAll = await this.checkCanWorkWithAllClients(user);
      if (!canWorkWithAll) {
        userEmployeeId = await this.getUserEmployeeId(user.id);
      }
    } else {
      canWorkWithAll = true;
    }

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

    const countQuery = this.knex('clients')
      .leftJoin('employees', 'clients.assigned_employee_id', 'employees.id')
      .count('clients.id as total');

    // Scoping rule: If user does not have permission, scope only to their assigned clients
    if (!canWorkWithAll) {
      if (!userEmployeeId) {
        baseQuery.whereRaw('1 = 0');
        countQuery.whereRaw('1 = 0');
      } else {
        baseQuery.where('clients.assigned_employee_id', userEmployeeId);
        countQuery.where('clients.assigned_employee_id', userEmployeeId);
      }
    } else if (query.assigned_employee_id) {
      baseQuery.where(
        'clients.assigned_employee_id',
        query.assigned_employee_id,
      );
      countQuery.where(
        'clients.assigned_employee_id',
        query.assigned_employee_id,
      );
    }

    if (query.color) {
      baseQuery.whereRaw(`COALESCE(employees.color, '#808080') = ?`, [
        query.color,
      ]);
      countQuery.whereRaw(`COALESCE(employees.color, '#808080') = ?`, [
        query.color,
      ]);
    }

    if (query.is_active !== undefined) {
      const isActiveBool =
        query.is_active === 'true' || query.is_active === '1';
      baseQuery.where('clients.is_active', isActiveBool);
      countQuery.where('clients.is_active', isActiveBool);
    }

    if (query.search) {
      const searchTerm = `%${query.search.trim()}%`;
      const normalizedSearch = this.normalizePhone(query.search);

      const searchCondition = function (this: Knex.QueryBuilder) {
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
      };

      baseQuery.where(searchCondition);
      countQuery.where(searchCondition);
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

  async findClientById(id: string, user?: { id: string; role?: string }) {
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

    if (user) {
      const canWorkWithAll = await this.checkCanWorkWithAllClients(user);
      if (!canWorkWithAll) {
        const userEmployeeId = await this.getUserEmployeeId(user.id);
        if (!userEmployeeId || row.assigned_employee_id !== userEmployeeId) {
          throw new ForbiddenException({
            message:
              'You do not have permission to view clients assigned to other employees',
            location: 'permission_denied_for_other_employees',
          });
        }
      }
    }

    const attachments = await this.knex('attachments')
      .where('entity_type', 'client')
      .where('entity_id', id)
      .select('*');

    return this.formatClientResponse(row, attachments);
  }

  async updateClient(
    id: string,
    dto: UpdateClientDto,
    user?: { id: string; role?: string },
  ) {
    const client = await this.knex('clients').where('id', id).first();
    if (!client) {
      throw new NotFoundException({
        message: 'Client not found.',
        location: 'client_not_found',
      });
    }

    if (user) {
      const canWorkWithAll = await this.checkCanWorkWithAllClients(user);
      const userEmployeeId = await this.getUserEmployeeId(user.id);

      if (!canWorkWithAll) {
        if (!userEmployeeId || client.assigned_employee_id !== userEmployeeId) {
          throw new ForbiddenException({
            message:
              'You do not have permission to update clients assigned to other employees',
            location: 'permission_denied_for_other_employees',
          });
        }
        if (
          dto.assigned_employee_id &&
          dto.assigned_employee_id !== userEmployeeId
        ) {
          throw new ForbiddenException({
            message:
              'You do not have permission to reassign clients to another employee',
            location: 'reassignment_prohibited',
          });
        }
      }
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

  async deleteClient(id: string, user?: { id: string; role?: string }) {
    const client = await this.knex('clients').where('id', id).first();
    if (!client) {
      throw new NotFoundException({
        message: 'Client not found.',
        location: 'client_not_found',
      });
    }

    if (user) {
      const canWorkWithAll = await this.checkCanWorkWithAllClients(user);
      const userEmployeeId = await this.getUserEmployeeId(user.id);

      if (!canWorkWithAll) {
        if (!userEmployeeId || client.assigned_employee_id !== userEmployeeId) {
          throw new ForbiddenException({
            message:
              'You do not have permission to delete clients assigned to other employees',
            location: 'permission_denied_for_other_employees',
          });
        }
      }
    }

    // Clean up associated attachments
    await this.knex('attachments')
      .where('entity_type', 'client')
      .where('entity_id', id)
      .delete();

    await this.knex('clients').where('id', id).delete();
  }

  async getClientColorStats(user?: { id: string; role?: string }) {
    let canWorkWithAll = true;
    let userEmployeeId: string | null = null;

    if (user) {
      canWorkWithAll = await this.checkCanWorkWithAllClients(user);
      if (!canWorkWithAll) {
        userEmployeeId = await this.getUserEmployeeId(user.id);
      }
    }

    const colorStatsQuery = this.knex('clients')
      .leftJoin('employees', 'clients.assigned_employee_id', 'employees.id')
      .select(this.knex.raw(`COALESCE(employees.color, '#808080') as color`))
      .count('clients.id as client_count')
      .groupByRaw(`COALESCE(employees.color, '#808080')`);

    const employeeStatsQuery = this.knex('clients')
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

    if (!canWorkWithAll) {
      if (!userEmployeeId) {
        colorStatsQuery.whereRaw('1 = 0');
        employeeStatsQuery.whereRaw('1 = 0');
      } else {
        colorStatsQuery.where('clients.assigned_employee_id', userEmployeeId);
        employeeStatsQuery.where(
          'clients.assigned_employee_id',
          userEmployeeId,
        );
      }
    }

    const colorStats = await colorStatsQuery;
    const employeeStats = await employeeStatsQuery;

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
