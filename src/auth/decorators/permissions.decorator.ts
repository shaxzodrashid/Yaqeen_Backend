import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'require_permission';

export interface RequiredPermission {
  module: string;
  action: 'create' | 'read' | 'update' | 'delete';
}

export const RequirePermission = (
  module: string,
  action: 'create' | 'read' | 'update' | 'delete',
) => SetMetadata(PERMISSION_KEY, { module, action });
