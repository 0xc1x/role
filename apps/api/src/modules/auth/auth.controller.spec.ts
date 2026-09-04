jest.mock('@0xc1x/role-commons', () => ({
  LoginRequestSchema: {},
  RegisterRequestSchema: {},
  RefreshRequestSchema: {},
  LogoutRequestSchema: {},
}));

import { Test } from '@nestjs/testing';
import type { AuthUser } from '../../auth/auth.types';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: jest.Mocked<AuthService>;

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
          },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
    service = module.get(AuthService);
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
});
