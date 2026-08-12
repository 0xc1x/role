import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import type { AuthUser } from './auth.types';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

function mockContext(user?: AuthUser) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as any;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(mockContext())).toBe(true);
  });

  it('allows when required roles array is empty', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    expect(guard.canActivate(mockContext())).toBe(true);
  });

  it('throws when user is missing and roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    expect(() => guard.canActivate(mockContext())).toThrow(ForbiddenException);
  });

  it('allows user with matching role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['business']);
    const user: AuthUser = {
      id: 'u1',
      email: 'b@test.com',
      role: 'business',
    };
    expect(guard.canActivate(mockContext(user))).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      expect.anything(),
      expect.anything(),
    ]);
  });

  it('allows admin even when not in required roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['business']);
    const user: AuthUser = {
      id: 'a1',
      email: 'admin@test.com',
      role: 'admin',
    };
    expect(guard.canActivate(mockContext(user))).toBe(true);
  });

  it('forbids user without required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const user: AuthUser = {
      id: 'u1',
      email: 'u@test.com',
      role: 'user',
    };
    expect(() => guard.canActivate(mockContext(user))).toThrow(
      ForbiddenException,
    );
  });
});
