import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedProfile,
} from '../../../test/seed';
import { BusinessesService } from './businesses.service';
import { BusinessesRepository } from './businesses.repository';

let ctx: TestDbContext;
let service: BusinessesService;
let ownerId: string;
let businessId: string;

const admin = { id: 'admin-1', email: 'a@x.cl', role: 'admin' } as never;
const owner = () => ({ id: ownerId, email: 'o@x.cl', role: 'business' }) as never;
const stranger = () =>
  ({ id: '00000000-0000-0000-0000-000000000001', email: 's@x.cl', role: 'business' }) as never;

beforeAll(async () => {
  ctx = await createTestDb();
  service = new BusinessesService(new BusinessesRepository(ctx.db));
  ownerId = await seedProfile(ctx.db);
  businessId = (await seedBusiness(ctx.db, ownerId)).id;
  await seedLocation(ctx.db, businessId);
});

afterAll(async () => {
  await ctx.stop();
});

describe('BusinessesService.list/getById (DB real)', () => {
  test('admin ve todo; dueño ve lo suyo; ajeno ve vacío', async () => {
    expect((await service.list(admin, { page: 1, limit: 10 })).meta.total).toBeGreaterThanOrEqual(1);
    expect((await service.list(owner(), { page: 1, limit: 10 })).meta.total).toBeGreaterThanOrEqual(1);
    expect((await service.list(stranger(), { page: 1, limit: 10 })).meta.total).toBe(0);
  });

  test('getById con permiso y sin permiso', async () => {
    expect((await service.getById(admin, businessId)).id).toBe(businessId);
    expect((await service.getById(owner(), businessId)).id).toBe(businessId);
    await expect(service.getById(stranger(), businessId)).rejects.toThrow();
  });
});

describe('BusinessesService locations (DB real)', () => {
  test('CRUD de sucursales con permisos', async () => {
    const created = await service.createLocation(owner(), businessId, {
      name: 'Sucursal',
      address: 'Calle 2',
      latitude: -33.4,
      longitude: -70.6,
    } as never);
    expect(created.latitude).toBe(-33.4);

    const listed = await service.listLocations(owner(), businessId, { page: 1, limit: 10 });
    expect(listed.meta.total).toBeGreaterThanOrEqual(2);

    expect((await service.getLocation(owner(), businessId, created.id)).name).toBe('Sucursal');
    await expect(
      service.getLocation(owner(), businessId, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow();

    const updated = await service.updateLocation(owner(), businessId, created.id, {
      name: 'Sucursal 2',
    } as never);
    expect(updated.name).toBe('Sucursal 2');

    await service.removeLocation(owner(), businessId, created.id);
    await expect(service.removeLocation(stranger(), businessId, created.id)).rejects.toThrow();
  });
});
