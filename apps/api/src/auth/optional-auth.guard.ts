import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authGuard: AuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPublic) {
      return this.authGuard.canActivate(context);
    }

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: import('./auth.types').AuthUser;
    }>();

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return true;
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      return true;
    }

    try {
      return await this.authGuard.canActivate(context);
    } catch {
      return true;
    }
  }
}
