import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSION_KEY,
  RequiredPermission,
} from '../decorators/permissions.decorator';
import { KNEX_CONNECTION } from '../../database/database.module';
import { Knex } from 'knex';

export const DEFAULT_SYSTEM_PERMISSIONS: Record<string, any> = {
  ROP: {
    clients: {
      create: true,
      read: true,
      update: true,
      delete: true,
      can_work_with_all_clients: true,
    },
    employees: { create: false, read: true, update: true, delete: false },
    departments: { create: false, read: true, update: false, delete: false },
    cargo_kpi: { create: true, read: true, update: true, delete: true },
    cargo_registrations: {
      create: true,
      read: true,
      update: true,
      delete: true,
      register_for_everyone: true,
    },
    finance: { create: false, read: true, update: false, delete: false },
    commercial_offers: { create: true, read: true, update: true, delete: true },
    tasks: { create: true, read: true, update: true, delete: true },
    currency: { create: false, read: true, update: false, delete: false },
    attachments: { create: true, read: true, update: true, delete: true },
    roles: { create: false, read: true, update: false, delete: false },
  },
  EMPLOYEE: {
    clients: {
      create: false,
      read: true,
      update: true,
      delete: false,
      can_work_with_all_clients: false,
    },
    employees: { create: false, read: true, update: false, delete: false },
    departments: { create: false, read: true, update: false, delete: false },
    cargo_kpi: { create: false, read: true, update: false, delete: false },
    cargo_registrations: {
      create: true,
      read: true,
      update: true,
      delete: false,
      register_for_everyone: false,
    },
    finance: { create: false, read: false, update: false, delete: false },
    commercial_offers: {
      create: true,
      read: true,
      update: false,
      delete: false,
    },
    tasks: { create: true, read: true, update: true, delete: false },
    currency: { create: false, read: true, update: false, delete: false },
    attachments: { create: true, read: true, update: false, delete: false },
    roles: { create: false, read: false, update: false, delete: false },
  },
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission =
      this.reflector.getAllAndOverride<RequiredPermission>(PERMISSION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

    if (!requiredPermission) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.id) {
      throw new ForbiddenException({
        message: 'Access denied: User context missing.',
        location: 'user_missing',
      });
    }

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        user.id,
      );
    if (!isUuid) {
      throw new ForbiddenException({
        message: 'Access denied: Invalid user ID format.',
        location: 'invalid_user_id',
      });
    }

    // Fetch user's role permissions
    const dbUser = await this.knex('users as u')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .select('u.role', 'r.name as role_name', 'r.permissions')
      .where('u.id', user.id)
      .first();

    if (!dbUser) {
      throw new ForbiddenException({
        message: 'Access denied: User account not found.',
        location: 'user_not_found',
      });
    }

    const effectiveRole = dbUser.role_name || dbUser.role || user.role;

    // CEO role bypasses all explicit permission checks
    if (
      user.role === 'CEO' ||
      dbUser.role === 'CEO' ||
      effectiveRole === 'CEO'
    ) {
      return true;
    }

    let rawPermissions = dbUser.permissions;

    // Fallback 1: If user has no role_id linked, look up role by name in `roles` table
    if (!rawPermissions && (dbUser.role || user.role)) {
      const targetRoleName = dbUser.role || user.role;
      const fallbackRole = await this.knex('roles')
        .whereRaw('LOWER(name) = ?', [targetRoleName.toLowerCase()])
        .first();
      if (fallbackRole) {
        rawPermissions = fallbackRole.permissions;
      }
    }

    // Fallback 2: Default system role permissions fallback
    if (!rawPermissions) {
      const roleKey = (dbUser.role || user.role || '').toUpperCase();
      rawPermissions = DEFAULT_SYSTEM_PERMISSIONS[roleKey] || {};
    }

    const permissions =
      typeof rawPermissions === 'string'
        ? JSON.parse(rawPermissions)
        : rawPermissions || {};

    const modulePerms = permissions[requiredPermission.module];
    const hasAction =
      modulePerms && modulePerms[requiredPermission.action] === true;

    if (!hasAction) {
      throw new ForbiddenException({
        message: `Access denied: Missing required permission "${requiredPermission.module}:${requiredPermission.action}".`,
        location: 'insufficient_permissions',
      });
    }

    return true;
  }
}
