import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createTestDb, type TestDbContext } from '../../../test/db';
import type { Env } from '../../config/env.schema';
import { AppStoreRepository } from '../store/app-store.repository';
import { BugReportInboxService } from './bug-report-inbox.service';

let ctx: TestDbContext;
let store: AppStoreRepository;
let service: BugReportInboxService;

const REPORTER = '22222222-2222-4222-8222-222222222222';

/** Lo que escribe el móvil, con el `reporter_id` que sella el trigger. */
const REPORTE = {
  summary: 'No me deja pagar con la tarjeta que usé ayer',
  description: 'Sale un error 500 al confirmar.',
  images: [`${REPORTER}/captura-1.png`],
  reporter_id: REPORTER,
  at: '2026-09-20T10:00:00.000Z',
};

/** Fila de reporte con un `value` válido, como la deja la policy de insert. */
const seedReporte = (
  value: unknown = REPORTE,
  extra: { state?: string; origin?: 'ios' | 'android' | 'pwa' | 'web' } = {},
) =>
  store.insert({
    namespace: 'bug_report',
    value,
    ...(extra.state ? { state: extra.state } : {}),
    ...(extra.origin ? { origin: extra.origin } : {}),
  });

/**
 * `ConfigService` mínimo, con la allowlist de ESCRITURA real (sin
 * `bug_report_images`, que no pertenece ahí). El bucket del buzón sale de
 * `BUG_REPORT_IMAGES_BUCKET`, no de esta lista, así que este archivo depende de
 * Supabase solo en las filas con capturas —y la firma se prueba con el cliente
 * falso en `bug-report-inbox.images.spec.ts`.
 */
const config = {
  get: (key: string) =>
    ({
      SUPABASE_URL: 'https://proyecto.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-de-test',
      SUPABASE_ALLOWED_BUCKETS:
        'images,business_images,categories_images,product_images',
    })[key],
} as unknown as ConfigService<Env, true>;

beforeAll(async () => {
  ctx = await createTestDb();
  store = new AppStoreRepository(ctx.db);
  service = new BugReportInboxService(store, config);
});

afterAll(async () => {
  await ctx?.stop();
});

describe('el buzón está atado al namespace bug_report', () => {
  test('la lista ignora filas que no son bug_report', async () => {
    const reporte = await seedReporte();
    const contacto = await store.insert({
      namespace: 'contact',
      value: { email: 'ana@example.com', name: 'Ana' },
    });
    const otro = await store.insert({ namespace: 'jobs', value: { a: 1 } });

    const { data, meta } = await service.list({ page: 1, limit: 100 });
    const ids = data.map((f) => f.id);

    expect(ids).toContain(reporte.id);
    expect(ids).not.toContain(contacto.id);
    expect(ids).not.toContain(otro.id);
    expect(meta.total).toBeGreaterThan(0);
  });

  test('el detalle de una fila de otro namespace es 404', async () => {
    const contacto = await store.insert({
      namespace: 'contact',
      value: { email: 'ana@example.com' },
    });

    await expect(service.getById(contacto.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test('triar una fila de otro namespace es 404 y no la toca', async () => {
    // La fila de contactos tiene `state` en NULL: si el 404 llegara DESPUÉS de
    // escribir, el triaje de este endpoint se leería encima de la bandeja de
    // contactos y el 404 no arreglaría nada.
    const contacto = await store.insert({
      namespace: 'contact',
      value: { email: 'ana@example.com' },
    });

    await expect(
      service.setState(contacto.id, 'CORREGIDO'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect((await store.findById(contacto.id))?.state).toBeNull();
  });

  test('una fila borrada (soft delete) tampoco se ve', async () => {
    const reporte = await seedReporte();
    await store.softDelete(reporte.id);

    await expect(service.getById(reporte.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.setState(reporte.id, 'CORREGIDO'),
    ).rejects.toBeInstanceOf(NotFoundException);

    const { data } = await service.list({ page: 1, limit: 100 });
    expect(data.map((f) => f.id)).not.toContain(reporte.id);
  });

  test('un id inexistente es 404', async () => {
    await expect(
      service.getById('00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('triaje: escribe state y solo state', () => {
  test('deja el estado escrito en la columna state', async () => {
    const reporte = await seedReporte();

    const dto = await service.setState(reporte.id, 'EN_REPRODUCCION');

    expect(dto.state).toBe('EN_REPRODUCCION');
    expect((await store.findById(reporte.id))?.state).toBe('EN_REPRODUCCION');
  });

  test('setState escribe en state, no en delivery_status', async () => {
    // Los dos ejes son ORTOGONALES: `state` contesta "¿qué hizo el equipo con
    // el reporte?" y `delivery_status` "¿llegó el aviso?". Un reporte de error no
    // tiene camino de correo (D8), así que nada lo mueve: si el triaje lo
    // tocara, el panel mostraría un badge de "notificado" que nadie mandó.
    const reporte = await seedReporte();
    expect((await store.findById(reporte.id))?.delivery_status).toBe(
      'PENDIENTE',
    );

    await service.setState(reporte.id, 'CORREGIDO');

    const fila = await store.findById(reporte.id);
    expect(fila?.state).toBe('CORREGIDO');
    expect(fila?.delivery_status).toBe('PENDIENTE');
  });

  test('el triaje no reescribe el value del reporte', async () => {
    // `updateState` no acepta `extraValue`: el merge de jsonb existe para el
    // `error` del proveedor de correo, y el triaje no tiene nada que añadir.
    // Perder el texto que el usuario escribió sería el fallo más caro posible
    // en una bandeja de reportes.
    const reporte = await seedReporte();

    await service.setState(reporte.id, 'DUPLICADO');

    expect((await store.findById(reporte.id))?.value).toMatchObject({
      summary: 'No me deja pagar con la tarjeta que usé ayer',
      reporter_id: REPORTER,
    });
  });

  test('setState es idempotente: triar dos veces no falla', async () => {
    const reporte = await seedReporte();

    await service.setState(reporte.id, 'CORREGIDO');
    const segunda = await service.setState(reporte.id, 'CORREGIDO');

    expect(segunda.state).toBe('CORREGIDO');
  });

  test('setState devuelve el detalle completo, no solo el estado', async () => {
    const reporte = await seedReporte();

    const dto = await service.setState(reporte.id, 'ABIERTO');

    expect(dto.id).toBe(reporte.id);
    expect(dto.readable).toBe(true);
    expect(dto.summary).toBe('No me deja pagar con la tarjeta que usé ayer');
    expect(dto.reporter_id).toBe(REPORTER);
    // La fila tiene capturas, así que acá se intentó firmar. Este spec no
    // inyecta cliente de Supabase, así que la firma no llega a completarse y la
    // captura se OMITE. Lo que importa en este archivo es que la ruta cruda no
    // se coló en su lugar —una firma que falla no puede volverse "te devuelvo el
    // path"— y que el detalle llegue igual. La firma que sí funciona se prueba
    // en `bug-report-inbox.images.spec.ts`, con el cliente falso.
    expect(dto.image_urls).toEqual([]);
    expect(JSON.stringify(dto)).not.toContain('captura-1.png');
  });

  test('acepta cada estado del vocabulario', async () => {
    for (const estado of [
      'ABIERTO',
      'EN_REPRODUCCION',
      'CORREGIDO',
      'DUPLICADO',
      'DESCARTADO',
    ] as const) {
      const reporte = await seedReporte();
      const dto = await service.setState(reporte.id, estado);
      expect(dto.state).toBe(estado);
    }
  });

  test('setState valida el estado contra el vocabulario', async () => {
    // La validación vive en el SERVICIO y no solo en el pipe del body: el pipe
    // cubre la ruta HTTP, y el service es la frontera que cualquier otro
    // llamador (un job, un script, el futuro importador) tiene que atravesar.
    // Sin esto, `state` es `text` sin CHECK y un string cualquiera llegaría a la
    // base como triaje.
    const reporte = await seedReporte();

    for (const raro of ['REABIERTO', 'abierto', '', 'CORREGIDO ']) {
      await expect(service.setState(reporte.id, raro)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }

    // Rechazado es también NO escrito: el 400 tiene que ocurrir antes de tocar
    // la fila, o el rechazo dejaría un estado basura detrás.
    expect((await store.findById(reporte.id))?.state).toBeNull();
  });
});

describe('filtros del listado', () => {
  test('filtra por state', async () => {
    const abierto = await seedReporte(REPORTE, { state: 'ABIERTO' });
    const corregido = await seedReporte(REPORTE, { state: 'CORREGIDO' });

    const { data } = await service.list({
      page: 1,
      limit: 100,
      state: 'ABIERTO',
    });
    const ids = data.map((f) => f.id);

    expect(ids).toContain(abierto.id);
    expect(ids).not.toContain(corregido.id);
  });

  test('filtra por origin', async () => {
    const ios = await seedReporte(REPORTE, { origin: 'ios' });
    const android = await seedReporte(REPORTE, { origin: 'android' });

    const { data } = await service.list({
      page: 1,
      limit: 100,
      origin: 'android',
    });
    const ids = data.map((f) => f.id);

    expect(ids).toContain(android.id);
    expect(ids).not.toContain(ios.id);
  });

  test('sin filtro devuelve las filas sin triage y con origin null', async () => {
    // El insert de la policy no nombra `origin` ni `state` cuando no aplican: la
    // fila tiene que salir, no desaparecer por un filtro implícito.
    const sinNada = await seedReporte(REPORTE, {});

    const { data } = await service.list({ page: 1, limit: 100 });
    const fila = data.find((f) => f.id === sinNada.id);

    expect(fila).toBeDefined();
    expect(fila?.state).toBeNull();
    expect(fila?.origin).toBeNull();
  });

  test('respeta la paginación', async () => {
    for (let i = 0; i < 3; i++) await seedReporte();
    const { data, meta } = await service.list({ page: 1, limit: 2 });

    expect(data.length).toBeLessThanOrEqual(2);
    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(2);
  });
});

describe('el listado no publica el reporter_id', () => {
  test('el DTO del listado no lo trae, el detalle sí', async () => {
    // La comprobación fuerte es la del mapper spec (sin DB); esta fija que el
    // servicio no lo agrega por su cuenta al mapear la lista.
    const reporte = await seedReporte();

    const { data } = await service.list({ page: 1, limit: 100 });
    const fila = data.find((f) => f.id === reporte.id);

    expect(fila).toBeDefined();
    expect('reporter_id' in (fila as object)).toBe(false);
    expect(JSON.stringify(fila)).not.toContain(REPORTER);

    const detalle = await service.getById(reporte.id);
    expect(detalle.reporter_id).toBe(REPORTER);
  });
});

describe('un value con demasiadas capturas sale ilegible, no se firma de a mil', () => {
  /**
   * La fila se LISTA —la escribió un usuario autenticado y la policy de insert
   * no inspecciona `value`— pero su `value` no pasa el schema: sale
   * `readable: false` y con `image_urls` vacío. Ese es el corte: el `.max(5)` en
   * commons hace que la fila no sea legible, y una fila ilegible no tiene rutas
   * que firmar. Sin el `.max`, este `GET` habría abierto seis llamadas a Storage
   * con el service role.
   */
  test('6 capturas: el detalle responde sin firmar ninguna', async () => {
    const reporte = await seedReporte({
      summary: 'Se me froze la app',
      images: Array.from(
        { length: 6 },
        (_, i) => `${REPORTER}/captura-${i}.png`,
      ),
    });

    const dto = await service.getById(reporte.id);

    expect(dto.readable).toBe(false);
    expect(dto.image_urls).toEqual([]);
    expect(JSON.stringify(dto)).not.toContain('captura-0.png');
  });

  test('400 capturas: tampoco se firman, y la fila sigue sin tumbar la bandeja', async () => {
    const reporte = await seedReporte({
      summary: 'Se me froze la app',
      images: Array.from(
        { length: 400 },
        (_, i) => `${REPORTER}/captura-${i}.png`,
      ),
    });

    const dto = await service.getById(reporte.id);

    expect(dto.readable).toBe(false);
    expect(dto.image_urls).toEqual([]);
  });

  test('5 capturas sí es un reporte legible', async () => {
    const reporte = await seedReporte({
      summary: 'Se me froze la app',
      images: Array.from(
        { length: 5 },
        (_, i) => `${REPORTER}/captura-${i}.png`,
      ),
    });

    const dto = await service.getById(reporte.id);

    expect(dto.readable).toBe(true);
    expect(dto.summary).toBe('Se me froze la app');
  });
});

describe('un value sin ancla no tira el buzón', () => {
  test('sale en la lista marcada como no legible y el resto sigue', async () => {
    const sana = await seedReporte();
    const rota = await seedReporte({ lo_que_sea: true });

    const { data } = await service.list({ page: 1, limit: 100 });
    const porId = new Map(data.map((f) => [f.id, f]));

    expect(porId.get(rota.id)?.readable).toBe(false);
    expect(porId.get(rota.id)?.summary).toBeNull();
    expect(porId.get(sana.id)?.readable).toBe(true);
  });

  test('el detalle de la fila ilegible responde con el flag, no 500', async () => {
    const rota = await seedReporte('esto no es un objeto');
    const dto = await service.getById(rota.id);

    expect(dto.readable).toBe(false);
    expect(dto.summary).toBeNull();
    expect(dto.image_urls).toEqual([]);
  });

  test('una fila ilegible igual se puede triar', async () => {
    // El triaje es un eixo aparte de la legibilidad del `value`: un reporte que
    // se descarta por corrupto tiene que poder marcarse `DESCARTADO`, o queda
    // en la bandeja para siempre sin salida.
    const rota = await seedReporte({ basura: true });

    const dto = await service.setState(rota.id, 'DESCARTADO');

    expect(dto.state).toBe('DESCARTADO');
    expect(dto.readable).toBe(false);
  });
});

describe('un state fuera del vocabulario que ya está en la base', () => {
  test('sale null en el listado y en el detalle, sin lanzar', async () => {
    // `state` es `text` sin CHECK: nada en la base impide que exista un
    // `'REABIERTO'` escrito a mano. Sale `null` —indistinguible de "sin
    // triage"— y no como un triaje que el panel no sabe pintar.
    const reporte = await seedReporte(REPORTE, { state: 'REABIERTO' });

    const { data } = await service.list({ page: 1, limit: 100 });
    const fila = data.find((f) => f.id === reporte.id);

    expect(fila?.readable).toBe(true);
    expect(fila?.state).toBeNull();

    const detalle = await service.getById(reporte.id);
    expect(detalle.state).toBeNull();
  });

  test('y se puede corregir desde el panel', async () => {
    const reporte = await seedReporte(REPORTE, { state: 'REABIERTO' });

    const dto = await service.setState(reporte.id, 'ABIERTO');

    expect(dto.state).toBe('ABIERTO');
  });
});
