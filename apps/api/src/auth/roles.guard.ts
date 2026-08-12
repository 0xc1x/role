import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppRole } from '@0xc1x/role-commons';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import type { AuthUser } from './auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authenticated user required');
    }

    if (!required.includes(user.role) && user.role !== 'admin') {
      throw new ForbiddenException(
        `Requires one of roles: ${required.join(', ')}`,
      );
    }

    return true;
  }
}
