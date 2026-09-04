import { Reflector } from '@nestjs/core';
import { OptionalAuthGuard } from './optional-auth.guard';
import { AuthGuard } from './auth.guard';

function mockContext(authorization?: string) {
  const request: { headers: { authorization?: string }; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as never;
}

describe('OptionalAuthGuard', () => {
  let guard: OptionalAuthGuard;
  let reflector: Reflector;
  let authGuard: jest.Mocked<Pick<AuthGuard, 'canActivate'>>;

  beforeEach(() => {
    reflector = new Reflector();
    authGuard = { canActivate: jest.fn() };
    guard = new OptionalAuthGuard(reflector, authGuard as unknown as AuthGuard);
  });

  it('ruta protegida: delega siempre en AuthGuard', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    authGuard.canActivate.mockResolvedValue(true);

    await expect(guard.canActivate(mockContext('Bearer x'))).resolves.toBe(true);
    expect(authGuard.canActivate).toHaveBeenCalledTimes(1);
  });

  it('ruta pública sin header: pasa sin tocar AuthGuard', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(mockContext())).resolves.toBe(true);
    expect(authGuard.canActivate).not.toHaveBeenCalled();
  });

  it('ruta pública con header que no es Bearer: pasa anónimo', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(mockContext('Basic abc'))).resolves.toBe(true);
    expect(authGuard.canActivate).not.toHaveBeenCalled();
  });

  it('ruta pública con Bearer vacío: pasa anónimo', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(mockContext('Bearer    '))).resolves.toBe(true);
    expect(authGuard.canActivate).not.toHaveBeenCalled();
  });

  it('ruta pública con Bearer válido: intenta autenticar', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    authGuard.canActivate.mockResolvedValue(true);

    await expect(guard.canActivate(mockContext('Bearer token-ok'))).resolves.toBe(
      true,
    );
    expect(authGuard.canActivate).toHaveBeenCalledTimes(1);
  });

  it('ruta pública con Bearer inválido/expirado: degrada a anónimo sin fallar', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    authGuard.canActivate.mockRejectedValue(new Error('jwt expired'));

    await expect(guard.canActivate(mockContext('Bearer token-viejo'))).resolves.toBe(
      true,
    );
  });
});
