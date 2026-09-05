import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

export interface ModulePermissionAction {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
  assign_cargo?: boolean;
  register_for_everyone?: boolean;
  can_work_with_all_clients?: boolean;
  plan_settable?: boolean;
}

export type RolePermissions = Record<string, ModulePermissionAction>;

export const SYSTEM_MODULES = [
  {
    module: 'clients',
    label: 'Clients Management',
    actions: [
      'create',
      'read',
      'update',
      'delete',
      'can_work_with_all_clients',
    ],
  },
  {
    module: 'employees',
    label: 'Employee Management',
    actions: ['create', 'read', 'update', 'delete'],
  },
  {
    module: 'departments',
    label: 'Department Management',
    actions: ['create', 'read', 'update', 'delete'],
  },
  {
    module: 'cargo_kpi',
    label: 'Cargo KPI',
    actions: ['create', 'read', 'update', 'delete', 'plan_settable'],
  },
  {
    module: 'cargo_registrations',
    label: 'Cargo Registrations',
    actions: ['create', 'read', 'update', 'delete', 'register_for_everyone'],
  },
  {
    module: 'cargo_consolidations',
    label: 'Cargo Consolidations & Trucks',
    actions: ['create', 'read', 'update', 'delete', 'assign_cargo'],
  },
  {
    module: 'finance',
    label: 'Finance & Expenses',
    actions: ['create', 'read', 'update', 'delete'],
  },
  {
    module: 'commercial_offers',
    label: 'Commercial Offers',
    actions: ['create', 'read', 'update', 'delete'],
  },
  {
    module: 'tasks',
    label: 'Kanban Tasks & Board',
    actions: ['create', 'read', 'update', 'delete'],
  },
  {
    module: 'currency',
    label: 'Currency Rates',
    actions: ['create', 'read', 'update', 'delete'],
  },
  {
    module: 'attachments',
    label: 'Attachments & Documents',
    actions: ['create', 'read', 'update', 'delete'],
  },
  {
    module: 'roles',
    label: 'Role & Permissions Management',
    actions: ['create', 'read', 'update', 'delete'],
  },
  {
    module: 'agents',
    label: 'Agents Management',
    actions: ['create', 'read', 'update', 'delete'],
  },
];

@Injectable()
export class RolesService implements OnModuleInit {
  private readonly logger = new Logger(RolesService.name);

  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  async onModuleInit() {
    try {
      const defaultRoles = [
        {
          name: 'CEO',
          display_name: 'Chief Executive Officer',
          description:
            'Full administrative access to all modules and system settings',
          is_system: true,
          is_plan_settable: false,
          permissions: {
            clients: {
              create: true,
              read: true,
              update: true,
              delete: true,
              can_work_with_all_clients: true,
            },
            employees: { create: true, read: true, update: true, delete: true },
            departments: {
              create: true,
              read: true,
              update: true,
              delete: true,
            },
            cargo_kpi: {
              create: true,
              read: true,
              update: true,
              delete: true,
              plan_settable: false,
            },
            cargo_registrations: {
              create: true,
              read: true,
              update: true,
              delete: true,
              register_for_everyone: true,
            },
            cargo_consolidations: {
              create: true,
              read: true,
              update: true,
              delete: true,
              assign_cargo: true,
            },
            finance: { create: true, read: true, update: true, delete: true },
            commercial_offers: {
              create: true,
              read: true,
              update: true,
              delete: true,
            },
            tasks: { create: true, read: true, update: true, delete: true },
            currency: { create: true, read: true, update: true, delete: true },
            attachments: {
              create: true,
              read: true,
              update: true,
              delete: true,
            },
            roles: { create: true, read: true, update: true, delete: true },
            agents: { create: true, read: true, update: true, delete: true },
          },
        },
        {
          name: 'ROP',
          display_name: 'Head of Sales / Operations',
          description: 'Department head level access for operations and sales',
          is_system: true,
          is_plan_settable: true,
          permissions: {
            clients: {
              create: true,
              read: true,
              update: true,
              delete: true,
              can_work_with_all_clients: true,
            },
            employees: {
              create: false,
              read: true,
              update: true,
              delete: false,
            },
            departments: {
              create: false,
              read: true,
              update: false,
              delete: false,
            },
            cargo_kpi: {
              create: true,
              read: true,
              update: true,
              delete: true,
              plan_settable: true,
            },
            cargo_registrations: {
              create: true,
              read: true,
              update: true,
              delete: true,
              register_for_everyone: true,
            },
            cargo_consolidations: {
              create: true,
              read: true,
              update: true,
              delete: true,
              assign_cargo: true,
            },
            finance: {
              create: false,
              read: true,
              update: false,
              delete: false,
            },
            commercial_offers: {
              create: true,
              read: true,
              update: true,
              delete: true,
            },
            tasks: { create: true, read: true, update: true, delete: true },
            currency: {
              create: false,
              read: true,
              update: false,
              delete: false,
            },
            attachments: {
              create: true,
              read: true,
              update: true,
              delete: true,
            },
            roles: { create: false, read: true, update: false, delete: false },
            agents: { create: true, read: true, update: true, delete: true },
          },
        },
        {
          name: 'EMPLOYEE',
          display_name: 'Standard Employee',
          description: 'Standard operational user access',
          is_system: true,
          is_plan_settable: true,
          permissions: {
            clients: {
              create: false,
              read: true,
              update: true,
              delete: false,
              can_work_with_all_clients: false,
            },
            employees: {
              create: false,
              read: true,
              update: false,
              delete: false,
            },
            departments: {
              create: false,
              read: true,
              update: false,
              delete: false,
            },
            cargo_kpi: {
              create: false,
              read: true,
              update: false,
              delete: false,
              plan_settable: true,
            },
            cargo_registrations: {
              create: true,
              read: true,
              update: true,
              delete: false,
              register_for_everyone: false,
            },
            cargo_consolidations: {
              create: true,
              read: true,
              update: true,
              delete: false,
              assign_cargo: true,
            },
            finance: {
              create: false,
              read: false,
              update: false,
              delete: false,
            },
            commercial_offers: {
              create: true,
              read: true,
              update: false,
              delete: false,
            },
            tasks: { create: true, read: true, update: true, delete: false },
            currency: {
              create: false,
              read: true,
              update: false,
              delete: false,
            },
            attachments: {
              create: true,
              read: true,
              update: false,
              delete: false,
            },
            roles: { create: false, read: false, update: false, delete: false },
            agents: { create: true, read: true, update: true, delete: false },
          },
        },
      ];

      const hasPlanSettableCol = this.knex.schema?.hasColumn
        ? await this.knex.schema.hasColumn('roles', 'is_plan_settable')
        : false;

      for (const roleDef of defaultRoles) {
        const existing = await this.knex('roles')
          .whereRaw('LOWER(name) = ?', [roleDef.name.toLowerCase()])
          .first();

        const normalizedPerms = JSON.stringify(
          this.normalizePermissions(roleDef.permissions),
        );

        const rolePayload: Record<string, any> = {
          permissions: normalizedPerms,
        };
        if (hasPlanSettableCol && roleDef.is_plan_settable !== undefined) {
          rolePayload.is_plan_settable = roleDef.is_plan_settable;
        }

        if (!existing) {
          await this.knex('roles').insert({
            name: roleDef.name,
            display_name: roleDef.display_name,
            description: roleDef.description,
            is_system: true,
            ...rolePayload,
          });
        } else if (existing.is_system) {
          await this.knex('roles')
            .where('id', existing.id)
            .update({
              ...rolePayload,
              updated_at: this.knex.fn.now(),
            });
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to seed/sync default system roles: ${err}`);
    }
  }

  /**
   * Return available system modules taxonomy for dynamic UI forms.
   */
  getModulesTaxonomy() {
    return SYSTEM_MODULES;
  }

  /**
   * Helper to normalize raw permissions into standard structured CRUD flags per module.
   */
  public normalizePermissions(rawPermissions: any): RolePermissions {
    const normalized: RolePermissions = {};

    for (const item of SYSTEM_MODULES) {
      const moduleKey = item.module;
      const rawModule = rawPermissions?.[moduleKey] || {};

      normalized[moduleKey] = {
        create: Boolean(rawModule.create),
        read: Boolean(rawModule.read),
        update: Boolean(rawModule.update),
        delete: Boolean(rawModule.delete),
      };

      if (item.actions.includes('assign_cargo')) {
        normalized[moduleKey].assign_cargo = Boolean(
          rawModule.assign_cargo !== undefined
            ? rawModule.assign_cargo
            : rawModule.update !== undefined
              ? rawModule.update
              : rawModule.create !== undefined
                ? rawModule.create
                : false,
        );
      }

      if (item.actions.includes('register_for_everyone')) {
        normalized[moduleKey].register_for_everyone = Boolean(
          rawModule.register_for_everyone,
        );
      }

      if (item.actions.includes('can_work_with_all_clients')) {
        normalized[moduleKey].can_work_with_all_clients = Boolean(
          rawModule.can_work_with_all_clients,
        );
      }

      if (item.actions.includes('plan_settable')) {
        normalized[moduleKey].plan_settable = Boolean(
          rawModule.plan_settable !== undefined
            ? rawModule.plan_settable
            : rawModule.set_plan !== undefined
              ? rawModule.set_plan
              : false,
        );
      }
    }

    return normalized;
  }

  /**
   * List all roles with employee user count assigned.
   */
  async findAllRoles() {
    const hasPlanSettableCol = this.knex.schema?.hasColumn
      ? await this.knex.schema.hasColumn('roles', 'is_plan_settable')
      : false;

    const selectCols = [
      'r.id',
      'r.name',
      'r.display_name',
      'r.description',
      'r.permissions',
      'r.is_system',
      'r.created_at',
      'r.updated_at',
    ];
    if (hasPlanSettableCol) {
      selectCols.push('r.is_plan_settable');
    }

    const roles = await this.knex('roles as r')
      .leftJoin('users as u', 'r.id', 'u.role_id')
      .select(selectCols)
      .count('u.id as user_count')
      .groupBy(selectCols)
      .orderBy('r.is_system', 'desc')
      .orderBy('r.created_at', 'asc');

    return roles.map((role: any) => {
      const perms =
        typeof role.permissions === 'string'
          ? this.normalizePermissions(JSON.parse(role.permissions))
          : this.normalizePermissions(role.permissions);

      const isPlanSettable = Boolean(
        role.is_plan_settable !== undefined
          ? role.is_plan_settable
          : perms?.cargo_kpi?.plan_settable,
      );

      return {
        ...role,
        is_plan_settable: isPlanSettable,
        user_count: parseInt((role.user_count as string) || '0', 10),
        permissions: perms,
      };
    });
  }

  /**
   * Get single role by ID.
   */
  async findRoleById(id: string) {
    const role = await this.knex('roles').where('id', id).first();
    if (!role) {
      throw new NotFoundException({
        message: 'Role not found.',
        location: 'role_not_found',
      });
    }

    const userCountResult = await this.knex('users')
      .where('role_id', id)
      .count('id as count')
      .first();

    const perms =
      typeof role.permissions === 'string'
        ? this.normalizePermissions(JSON.parse(role.permissions))
        : this.normalizePermissions(role.permissions);

    const isPlanSettable = Boolean(
      role.is_plan_settable !== undefined
        ? role.is_plan_settable
        : perms?.cargo_kpi?.plan_settable,
    );

    return {
      ...role,
      is_plan_settable: isPlanSettable,
      user_count: parseInt((userCountResult?.count as string) || '0', 10),
      permissions: perms,
    };
  }

  /**
   * Helper to find role by name.
   */
  async findRoleByName(name: string) {
    const role = await this.knex('roles')
      .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
      .first();

    if (!role) {
      return null;
    }

    const perms =
      typeof role.permissions === 'string'
        ? this.normalizePermissions(JSON.parse(role.permissions))
        : this.normalizePermissions(role.permissions);

    const isPlanSettable = Boolean(
      role.is_plan_settable !== undefined
        ? role.is_plan_settable
        : perms?.cargo_kpi?.plan_settable,
    );

    return {
      ...role,
      is_plan_settable: isPlanSettable,
      permissions: perms,
    };
  }

  /**
   * Create custom role.
   */
  async createRole(dto: CreateRoleDto) {
    const existing = await this.findRoleByName(dto.name);
    if (existing) {
      throw new BadRequestException({
        message: `Role with name "${dto.name}" already exists.`,
        location: 'role_name_exists',
      });
    }

    const isPlanSettable =
      dto.is_plan_settable !== undefined
        ? Boolean(dto.is_plan_settable)
        : Boolean(dto.permissions?.cargo_kpi?.plan_settable);

    const normalizedPermissions = this.normalizePermissions(dto.permissions);
    if (normalizedPermissions.cargo_kpi) {
      normalizedPermissions.cargo_kpi.plan_settable = isPlanSettable;
    }

    const insertPayload: Record<string, any> = {
      name: dto.name.trim(),
      display_name: dto.display_name.trim(),
      description: dto.description || null,
      permissions: JSON.stringify(normalizedPermissions),
      is_system: false,
    };

    const hasPlanSettableCol = this.knex.schema?.hasColumn
      ? await this.knex.schema.hasColumn('roles', 'is_plan_settable')
      : false;
    if (hasPlanSettableCol) {
      insertPayload.is_plan_settable = isPlanSettable;
    }

    const [role] = await this.knex('roles')
      .insert(insertPayload)
      .returning('*');

    return {
      ...role,
      is_plan_settable: isPlanSettable,
      user_count: 0,
      permissions: normalizedPermissions,
    };
  }

  /**
   * Update role details and permissions.
   */
  async updateRole(id: string, dto: UpdateRoleDto) {
    const role = await this.findRoleById(id);

    if (dto.name && dto.name.toLowerCase() !== role.name.toLowerCase()) {
      if (role.is_system) {
        throw new BadRequestException({
          message: 'System role names cannot be renamed.',
          location: 'system_role_rename_prohibited',
        });
      }

      const existing = await this.findRoleByName(dto.name);
      if (existing && existing.id !== id) {
        throw new BadRequestException({
          message: `Role with name "${dto.name}" already exists.`,
          location: 'role_name_exists',
        });
      }
    }

    const updatePayload: Record<string, any> = {
      updated_at: this.knex.fn.now(),
    };

    if (dto.name && !role.is_system) {
      updatePayload.name = dto.name.trim();
    }
    if (dto.display_name) {
      updatePayload.display_name = dto.display_name.trim();
    }
    if (dto.description !== undefined) {
      updatePayload.description = dto.description || null;
    }

    let isPlanSettable: boolean | undefined = undefined;
    if (dto.is_plan_settable !== undefined) {
      isPlanSettable = Boolean(dto.is_plan_settable);
    } else if (dto.permissions?.cargo_kpi?.plan_settable !== undefined) {
      isPlanSettable = Boolean(dto.permissions.cargo_kpi.plan_settable);
    }

    const hasPlanSettableCol = this.knex.schema?.hasColumn
      ? await this.knex.schema.hasColumn('roles', 'is_plan_settable')
      : false;
    if (hasPlanSettableCol && isPlanSettable !== undefined) {
      updatePayload.is_plan_settable = isPlanSettable;
    }

    if (dto.permissions || isPlanSettable !== undefined) {
      const mergedPermissions = {
        ...role.permissions,
        ...(dto.permissions || {}),
      };
      if (isPlanSettable !== undefined) {
        if (!mergedPermissions.cargo_kpi) {
          mergedPermissions.cargo_kpi = {};
        }
        mergedPermissions.cargo_kpi.plan_settable = isPlanSettable;
      }
      updatePayload.permissions = JSON.stringify(
        this.normalizePermissions(mergedPermissions),
      );
    }

    const [updated] = await this.knex('roles')
      .where('id', id)
      .update(updatePayload)
      .returning('*');

    return this.findRoleById(updated.id);
  }

  /**
   * Delete custom role.
   */
  async deleteRole(id: string) {
    const role = await this.findRoleById(id);

    if (role.is_system) {
      throw new BadRequestException({
        message: 'System roles cannot be deleted.',
        location: 'system_role_delete_prohibited',
      });
    }

    if (role.user_count > 0) {
      throw new BadRequestException({
        message: `Cannot delete role "${role.name}" because ${role.user_count} user(s) are assigned to it.`,
        location: 'role_has_assigned_users',
      });
    }

    await this.knex('roles').where('id', id).del();
  }
}
