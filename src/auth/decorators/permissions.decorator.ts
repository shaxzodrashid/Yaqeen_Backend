import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'require_permission';

export type PermissionAction =
  | 'create'
  | 'read'
  | 'view'
  | 'update'
  | 'delete'
  | 'assign_cargo'
  | 'register_for_everyone'
  | 'can_work_with_all_clients'
  | (string & {});

export interface RequiredPermission {
  module: string;
  action: PermissionAction;
}

export const RequirePermission = (module: string, action: PermissionAction) =>
  SetMetadata(PERMISSION_KEY, { module, action });
