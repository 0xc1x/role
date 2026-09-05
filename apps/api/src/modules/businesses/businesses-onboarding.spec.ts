import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DRIZZLE } from '../../database/database.tokens';
import { BusinessesService } from './businesses.service';
import { BusinessesRepository } from './businesses.repository';

const mockSupabaseAdmin = {
  auth: {
    admin: {
      createUser: jest.fn(),
      deleteUser: jest.fn(),
    },
  },
};

const makeTx = () => ({
  insert: jest.fn(() => ({ values: jest.fn().mockResolvedValue([]) })),
});

describe('BusinessesService.onboard', () => {
  let service: BusinessesService;
  const repository = {
    findBySlug: jest.fn(),
    insert: jest.fn(),
    transaction: jest.fn(),
  };

  const body = {
    email: 'owner@panaderia.com',
    password: 'secret123',
    full_name: 'Dueña Panadería',
    business_name: 'Panadería La Espiga',
    phone: '+593900000000',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BusinessesService,
        { provide: BusinessesRepository, useValue: repository },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                SUPABASE_URL: 'https://test.supabase.co',
                SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
              })[key],
          },
        },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();
    service = module.get(BusinessesService);
    (service as any).supabaseAdmin = mockSupabaseAdmin;
    jest.clearAllMocks();
  });

  it('creates user, profile (business) and pending business', async () => {
    mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    repository.findBySlug.mockResolvedValue(null);
    const tx = makeTx();
    repository.transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
    repository.insert.mockResolvedValue({ id: 'biz-1' });

    const res = await service.onboard(body);

    expect(res.message).toContain('revisión');
    expect(mockSupabaseAdmin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: body.email,
        email_confirm: false,
        user_metadata: { full_name: body.full_name, role: 'business' },
      }),
    );
    // profile insert (role=business)
    expect(tx.insert).toHaveBeenCalledTimes(1);
    const valuesFn = tx.insert.mock.results[0].value.values as jest.Mock;
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-1',
        email: body.email,
        full_name: body.full_name,
        role: 'business',
      }),
    );
    // business insert via repository
    expect(repository.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        owner_id: 'user-1',
        name: body.business_name,
        is_active: false,
        verification_status: 'pending',
      }),
    );
    expect(mockSupabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('maps duplicate email to ConflictException without touching DB', async () => {
    mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    await expect(service.onboard(body)).rejects.toBeInstanceOf(ConflictException);
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it('deletes the auth user when DB writes fail', async () => {
    mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'user-2' } },
      error: null,
    });
    repository.findBySlug.mockResolvedValue(null);
    repository.transaction.mockRejectedValue(new Error('db down'));
    mockSupabaseAdmin.auth.admin.deleteUser.mockResolvedValue({ error: null });

    await expect(service.onboard(body)).rejects.toThrow('db down');
    expect(mockSupabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith('user-2');
  });
});
