import { SetMetadata } from '@nestjs/common';
import type { AppRole } from '@0xc1x/role-commons';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
