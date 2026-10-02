import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { AppStoreRepository } from '../store/app-store.repository';
import { ContactInboxService } from './contact-inbox.service';

let ctx: TestDbContext;
let store: AppStoreRepository;
let service: ContactInboxService;

const MENSAJE = {
  name: 'Ana',
  email: 'ana@example.com',
  role: 'persona',
  city: 'Quito',
  city_raw: 'Quito',
  city_other: null,
  message: 'Quiero recibir comida en mi casa',
  at: '2026-09-20T10:00:00.000Z',
  ip: '203.0.113.7',
  to: 'hola@role.ec',
  from: 'notificaciones@role.ec',
};

/** Fila de contacto con un `value` válido, como la escribe `POST /contact`. */
const seedContacto = (
  value: unknown = MENSAJE,
  deliveryStatus?: 'PENDIENTE' | 'PROCESADO',
) =>
  store.insert({
    namespace: 'contact',
    value,
    ...(deliveryStatus ? { delivery_status: deliveryStatus } : {}),
  });

beforeAll(async () => {
  ctx = await createTestDb();
  store = new AppStoreRepository(ctx.db);
  service = new ContactInboxService(store);
});

afterAll(async () => {
  await ctx?.stop();
});

describe('la bandeja está atada al namespace contact', () => {
  test('el listado no devuelve filas de otro namespace', async () => {
    const contacto = await seedContacto();
    const ajeno = await store.insert({
      namespace: 'jobs',
      value: { a: 1 },
    });

    const { data, meta } = await service.list({ page: 1, limit: 100 });
    const ids = data.map((f) => f.id);

    expect(ids).toContain(contacto.id);
    expect(ids).not.toContain(ajeno.id);
    expect(meta.total).toBeGreaterThan(0);
  });

  test('el detalle de una fila de otro namespace es 404', async () => {
    const ajeno = await store.insert({ namespace: 'jobs', value: { a: 1 } });
    await expect(service.getById(ajeno.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test('marcar como atendido una fila de otro namespace es 404 y no la toca', async () => {
    const ajeno = await store.insert({ namespace: 'jobs', value: { a: 1 } });

    await expect(service.markHandled(ajeno.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // La fila intacta: el 404 tiene que ocurrir ANTES de escribir, no después.
    expect((await store.findById(ajeno.id))?.delivery_status).toBe('PENDIENTE');
  });

  test('una fila borrada (soft delete) tampoco se ve', async () => {
    const contacto = await seedContacto();
    await store.softDelete(contacto.id);

    await expect(service.getById(contacto.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const { data } = await service.list({ page: 1, limit: 100 });
    expect(data.map((f) => f.id)).not.toContain(contacto.id);
  });
});

describe('filtro por estado de entrega', () => {
  test('filtra solo las filas del estado pedido', async () => {
    const pendiente = await seedContacto(MENSAJE, 'PENDIENTE');
    const procesado = await seedContacto(MENSAJE, 'PROCESADO');

    const { data } = await service.list({
      page: 1,
      limit: 100,
      delivery_status: 'PENDIENTE',
    });

    expect(data.map((f) => f.id)).toContain(pendiente.id);
    expect(data.map((f) => f.id)).not.toContain(procesado.id);
  });

  test('sin filtro devuelve ambos estados', async () => {
    await seedContacto(MENSAJE, 'PENDIENTE');
    await seedContacto(MENSAJE, 'PROCESADO');

    const { data } = await service.list({ page: 1, limit: 100 });
    const estados = new Set(data.map((f) => f.delivery_status));
    expect(estados.has('PENDIENTE')).toBe(true);
    expect(estados.has('PROCESADO')).toBe(true);
  });

  test('respeta la paginación', async () => {
    for (let i = 0; i < 3; i++) await seedContacto();
    const { data, meta } = await service.list({ page: 1, limit: 2 });
    expect(data.length).toBeLessThanOrEqual(2);
    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(2);
  });
});

describe('marcar como atendido', () => {
  test('lleva PENDIENTE a PROCESADO', async () => {
    const fila = await seedContacto(MENSAJE, 'PENDIENTE');

    const dto = await service.markHandled(fila.id);

    expect(dto.delivery_status).toBe('PROCESADO');
    expect((await store.findById(fila.id))?.delivery_status).toBe('PROCESADO');
  });

  test('es idempotente: marcar dos veces no falla', async () => {
    const fila = await seedContacto(MENSAJE, 'PENDIENTE');
    await service.markHandled(fila.id);
    const segunda = await service.markHandled(fila.id);
    expect(segunda.delivery_status).toBe('PROCESADO');
  });

  test('no toca el value del mensaje al cambiar el estado', async () => {
    const fila = await seedContacto(MENSAJE, 'PENDIENTE');
    await service.markHandled(fila.id);
    expect((await store.findById(fila.id))?.value).toMatchObject({
      email: 'ana@example.com',
    });
  });

  test('un id inexistente es 404', async () => {
    await expect(
      service.markHandled('00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('una fila con value corrupto no tumba el listado', () => {
  test('sale en la lista marcada como no legible y el resto sigue', async () => {
    const sana = await seedContacto(MENSAJE);
    const rota = await seedContacto({ basura: true });

    const { data } = await service.list({ page: 1, limit: 100 });
    const porId = new Map(data.map((f) => [f.id, f]));

    expect(porId.get(rota.id)?.readable).toBe(false);
    expect(porId.get(rota.id)?.email).toBeNull();
    expect(porId.get(sana.id)?.readable).toBe(true);
    expect(porId.get(sana.id)?.email).toBe('ana@example.com');
  });

  test('el detalle de la fila corrupta responde igual, no 500', async () => {
    const rota = await seedContacto('esto no es un objeto');
    const dto = await service.getById(rota.id);
    expect(dto.readable).toBe(false);
    expect(dto.message).toBeNull();
  });
});
