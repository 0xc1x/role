jest.mock('@0xc1x/role-commons', () => ({
  LoginRequestSchema: {},
  RegisterRequestSchema: {},
  RefreshRequestSchema: {},
  LogoutRequestSchema: {},
  ForgotPasswordRequestSchema: {},
  ResetPasswordRequestSchema: {},
  ChangeEmailRequestSchema: {},
}));

import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import type { AuthUser } from '../../auth/auth.types';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: jest.Mocked<AuthService>;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn(),
            register: jest.fn(),
            refresh: jest.fn(),
            logout: jest.fn(),
            forgotPassword: jest.fn(),
            resetPassword: jest.fn(),
            changeEmail: jest.fn(),
            deleteAccount: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
    service = module.get(AuthService);
    reflector = module.get(Reflector);
  });

  it('login delega el body', () => {
    const body = { email: 'a@x.com', password: 'secret' } as never;
    controller.login(body);
    expect(service.login).toHaveBeenCalledWith(body);
  });

  it('register delega el body', () => {
    const body = { email: 'a@x.com', password: 'secret123' } as never;
    controller.register(body);
    expect(service.register).toHaveBeenCalledWith(body);
  });

  it('refresh delega el refresh token', () => {
    const body = { refresh_token: 'rt-1' } as never;
    controller.refresh(body);
    expect(service.refresh).toHaveBeenCalledWith(body);
  });

  it('getProfile devuelve el usuario inyectado por el guard', () => {
    const user: AuthUser = { id: 'user-1', role: 'admin', email: 'a@x.com' };
    expect(controller.getProfile(user)).toEqual({ user });
  });

  it('logout delega el body', () => {
    const body = { refresh_token: 'rt-1' } as never;
    controller.logout(body);
    expect(service.logout).toHaveBeenCalledWith(body);
  });

  it('logout es público y rate-limited', () => {
    expect(reflector.get(IS_PUBLIC_KEY, controller.logout)).toBe(true);
    expect(reflector.get('THROTTLER:LIMITdefault', controller.logout)).toBe(10);
    expect(reflector.get('THROTTLER:TTLdefault', controller.logout)).toBe(
      60_000,
    );
  });

  it('forgotPassword delega el body', () => {
    const body = { email: 'a@x.com' } as never;
    controller.forgotPassword(body);
    expect(service.forgotPassword).toHaveBeenCalledWith(body);
  });

  it('forgotPassword es público y siempre 200', () => {
    // Public: it is the most attractive route in the system to probe, which is
    // exactly why it is the one that must not answer differently.
    expect(reflector.get(IS_PUBLIC_KEY, controller.forgotPassword)).toBe(true);
    expect(reflector.get(HTTP_CODE_METADATA, controller.forgotPassword)).toBe(
      HttpStatus.OK,
    );
  });

  it('forgotPassword lleva dos ventanas: por minuto y por hora', () => {
    // The per-IP bucket is the only lever a decorator has, and one window is
    // not enough: 3/minute alone is 180 emails an hour from one host.
    expect(
      reflector.get('THROTTLER:LIMITdefault', controller.forgotPassword),
    ).toBe(3);
    expect(
      reflector.get('THROTTLER:LIMITauth', controller.forgotPassword),
    ).toBe(5);
    expect(reflector.get('THROTTLER:TTLauth', controller.forgotPassword)).toBe(
      3_600_000,
    );
  });

  it('resetPassword delega el body y es público', () => {
    // Public because the caller is not signed in yet: they hold a recovery
    // token, not a session. The service verifies that token.
    const body = { access_token: 't', password: 'nueva-clave' } as never;
    controller.resetPassword(body);
    expect(service.resetPassword).toHaveBeenCalledWith(body);
    expect(reflector.get(IS_PUBLIC_KEY, controller.resetPassword)).toBe(true);
  });

  it('changeEmail delega en el usuario del guard y responde 202', () => {
    const user: AuthUser = { id: 'user-1', role: 'user', email: 'a@x.com' };
    const body = { new_email: 'b@x.com' } as never;
    controller.changeEmail(user, body);
    expect(service.changeEmail).toHaveBeenCalledWith(user, body);
    // 202, not 200: GoTrue holds the change until the new address confirms, so
    // a 200 would claim a state this API cannot observe.
    expect(reflector.get(HTTP_CODE_METADATA, controller.changeEmail)).toBe(
      HttpStatus.ACCEPTED,
    );
    expect(
      reflector.get(IS_PUBLIC_KEY, controller.changeEmail),
    ).toBeUndefined();
  });

  it('deleteAccount delega en el usuario del guard y responde 204', () => {
    const user: AuthUser = { id: 'user-1', role: 'user', email: 'a@x.com' };
    controller.deleteAccount(user);
    expect(service.deleteAccount).toHaveBeenCalledWith(user);
    expect(reflector.get(HTTP_CODE_METADATA, controller.deleteAccount)).toBe(
      HttpStatus.NO_CONTENT,
    );
    expect(
      reflector.get(IS_PUBLIC_KEY, controller.deleteAccount),
    ).toBeUndefined();
  });
});
