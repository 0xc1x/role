import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { AuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { DRIZZLE } from '../../database/database.tokens';
import { reviews } from '../../database/schema';
import type { Env } from '../../config/env.schema';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import { ReviewsModerationController } from './reviews-moderation.controller';
import { ReviewsModerationService } from './reviews-moderation.service';
import { ReviewsRepository } from './reviews.repository';

/**
 * Frontera de la moderación de reseñas probada sobre el stack HTTP real
 * (AuthGuard + RolesGuard, controlador real, servicio real sobre la DB real) y
 * no con una aserción de metadatos: un decorador mal puesto pasa un test de
 * metadata y deja la superficie de reseñas ocultas abierta igual.
 *
 *  - sin token         → 401
 *  - token corrupto    → 401
 *  - token de user     → 403
 *  - token de business → 403
 *  - token de admin    → 200, y las reseñas ocultas ESTÁN en la lista
 *
 * Y, en el mismo archivo, las tres cosas que la moderación tiene que cumplir y
 * que una aserción de estado no probaría: ocultar deja rastro de QUIÉN y POR
 * QUÉ, desocultar no borra ese rastro, y un 403 no escribe nada.
 *
 * LO QUE ESTE ARCHIVO NO PUEDE PROBAR: que la reseña oculta deje de salir en el
 * móvil. Eso lo decide la política de SELECT de `public.reviews` en Supabase, y
 * el espejo de test descarta las policies a propósito (`test/db.ts`). El filtro
 * que se prueba acá es el del API; el del PostgREST se prueba contra la base real.
 *
 * TAMPOCO PUEDE PROBAR LOS `check` DE LA MIGRACIÓN: el espejo de test se arma con
 * el DDL generado por `drizzle-kit`, que no modela constraints de CHECK. Que
 * `moderation_reason` sea obligatorio en la base es una afirmación sobre
 * `20260927021015_reviews_moderation_soft_hide.sql`. Ese archivo ya se aplicó
 * (ledger `20260927021015`) y los `check` están en la base, pero eso se verificó
 * una vez contra Supabase y no en cada corrida: este spec sigue sin ejecutarlos.
 * Lo que sí se prueba acá es el borde HTTP: la API rechaza un ocultamiento sin
 * razón antes de tocar la fila, y con eso el `check` de la base es la segunda
 * barrera, no la única.
 */

const SUPABASE_URL = 'http://127.0.0.1:9';
const JWT_SECRET = 'reviews-moderation-security-secret';

let ctx: TestDbContext;
let app: INestApplication;
let service: ReviewsModerationService;
let userId: string;
let businessId: string;
let offerId: string;
let orderId: string;
let adminId: string;

const tokens: Record<'user' | 'business' | 'admin', string> = {
  user: '',
  business: '',
  admin: '',
};

const MOTIVO = 'Lenguaje abusivo hacia el personal del local';
const RAZON = 'insults_or_hate_speech';
const CUERPO = { moderation_reason: RAZON, hidden_reason: MOTIVO } as const;

async function tokenFor(role: 'user' | 'business' | 'admin', id: string) {
  return new SignJWT({ email: `${role}-${id}@t.cl` })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function seedRole(
  role: 'user' | 'business' | 'admin',
  fullName?: string,
): Promise<string> {
  const id = await seedProfile(ctx.db, `${role}-${randomUUID()}@t.cl`);
  const nombre = (fullName ?? `${role} de prueba`).replaceAll("'", "''");
  await ctx.db.execute(
    `update profiles set role = '${role}', full_name = '${nombre}' where id = '${id}'`,
  );
  return id;
}

async function seedReview(overrides: Record<string, unknown> = {}) {
  const [row] = await ctx.db
    .insert(reviews)
    .values({
      user_id: userId,
      business_id: businessId,
      order_id: orderId,
      product_rating: 1,
      business_rating: 1,
      comment: 'Pésimo, no volvamos',
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('seedReview falló');
  return row;
}

const readRow = async (id: string) => {
  const [row] = await ctx.db.select().from(reviews).where(eq(reviews.id, id));
  return row;
};

beforeAll(async () => {
  ctx = await createTestDb();

  const config = {
    get: (key: string) =>
      ({
        SUPABASE_URL,
        SUPABASE_JWT_SECRET: JWT_SECRET,
      })[key],
  } as unknown as ConfigService<Env, true>;

  const moduleRef = await Test.createTestingModule({
    controllers: [ReviewsModerationController],
    providers: [
      ReviewsModerationService,
      // Repositorio real: acá se prueba que la fila queda escrita, no que un
      // doble devolvería lo que se le pida.
      ReviewsRepository,
      { provide: DRIZZLE, useValue: ctx.db },
      { provide: ConfigService, useValue: config },
      AuthGuard,
      RolesGuard,
      { provide: 'APP_GUARD', useExisting: AuthGuard },
      { provide: 'APP_GUARD', useExisting: RolesGuard },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.init();
  service = app.get(ReviewsModerationService);

  for (const role of ['user', 'business', 'admin'] as const) {
    const id = await seedRole(role);
    if (role === 'admin') adminId = id;
    tokens[role] = await tokenFor(role, id);
  }

  userId = await seedProfile(ctx.db);
  const owner = await seedProfile(ctx.db);
  const biz = await seedBusiness(ctx.db, owner);
  businessId = biz.id;
  const loc = await seedLocation(ctx.db, businessId);
  offerId = (await seedOffer(ctx.db, businessId, loc.id)).id;
  orderId = (
    await seedOrder(ctx.db, userId, offerId, businessId, {
      status: 'completed',
    })
  ).id;
}, 120000);

afterAll(async () => {
  await app?.close();
  await ctx?.stop();
});

const api = () => request(app.getHttpServer());
const comoAdmin = <T>(r: request.Test) =>
  r.set('Authorization', `Bearer ${tokens.admin}`);

describe('GET /reviews/moderation (frontera de seguridad)', () => {
  test('sin token → 401', async () => {
    await api().get('/reviews/moderation').expect(401);
  });

  test('con token corrupto → 401', async () => {
    await api()
      .get('/reviews/moderation')
      .set('Authorization', 'Bearer no-es-un-jwt')
      .expect(401);
  });

  test('usuario autenticado sin rol admin → 403', async () => {
    await api()
      .get('/reviews/moderation')
      .set('Authorization', `Bearer ${tokens.user}`)
      .expect(403);
  });

  test('negocio autenticado sin rol admin → 403', async () => {
    await api()
      .get('/reviews/moderation')
      .set('Authorization', `Bearer ${tokens.business}`)
      .expect(403);
  });

  test('admin → 200, y las reseñas ocultas también salen', async () => {
    const visible = await seedReview({
      order_id: null,
      product_rating: 5,
      business_rating: 5,
      comment: 'Excelente',
    });
    // Una fila realmente oculta y CON motivo: `hidden_reason: 'x'` sin
    // `is_hidden` era una visible con un texto, y la prueba pasaba por el motivo
    // equivocado. Con `moderation_reason` la fila oculta sin motivo ya no es
    // representable, así que el seed tiene que decir la verdad.
    const oculta = await seedReview({
      order_id: null,
      is_hidden: true,
      moderation_reason: RAZON,
      hidden_reason: MOTIVO,
    });

    const res = await comoAdmin(
      api().get('/reviews/moderation?limit=100'),
    ).expect(200);
    const ids = res.body.data.map((f: { id: string }) => f.id);
    expect(ids).toContain(visible.id);
    expect(ids).toContain(oculta.id);
  });
});

describe('PATCH /reviews/moderation/:id/hide (frontera de seguridad)', () => {
  test('sin token → 401', async () => {
    const fila = await seedReview({ order_id: null });
    await api()
      .patch(`/reviews/moderation/${fila.id}/hide`)
      .send({ ...CUERPO })
      .expect(401);
    expect((await readRow(fila.id))?.is_hidden).toBe(false);
  });

  test('usuario autenticado sin rol admin → 403 y no escribe', async () => {
    const fila = await seedReview({ order_id: null });
    await api()
      .patch(`/reviews/moderation/${fila.id}/hide`)
      .set('Authorization', `Bearer ${tokens.user}`)
      .send({ ...CUERPO })
      .expect(403);

    const row = await readRow(fila.id);
    expect(row?.is_hidden).toBe(false);
    expect(row?.hidden_reason).toBeNull();
    expect(row?.moderated_by).toBeNull();
  });

  test('negocio autenticado sin rol admin → 403 y no escribe', async () => {
    const fila = await seedReview({ order_id: null });
    await api()
      .patch(`/reviews/moderation/${fila.id}/hide`)
      .set('Authorization', `Bearer ${tokens.business}`)
      .send({ ...CUERPO })
      .expect(403);
    expect((await readRow(fila.id))?.is_hidden).toBe(false);
  });

  test('sin motivo de la taxonomía → 400 y no escribe: el motivo es el registro de apelación', async () => {
    const fila = await seedReview({ order_id: null });

    // Ninguno de estos cuerpos nombra un motivo, y todos tienen que rechazarse
    // ANTES de tocar la fila: un ocultamiento sin motivo declarado es un
    // registro de apelación vacío.
    for (const body of [
      {},
      { hidden_reason: MOTIVO },
      { hidden_reason: '' },
      { moderation_reason: 'me_gustó_poco' },
      { moderation_reason: '' },
    ]) {
      await comoAdmin(
        api().patch(`/reviews/moderation/${fila.id}/hide`).send(body),
      ).expect(400);
    }

    const row = await readRow(fila.id);
    expect(row?.is_hidden).toBe(false);
    expect(row?.moderated_by).toBeNull();
    expect(row?.moderation_reason).toBeNull();
  });

  test('«other» sin detalle → 400: es el único token que no se explica solo', async () => {
    const fila = await seedReview({ order_id: null });

    for (const hidden_reason of ['', '   ']) {
      await comoAdmin(
        api()
          .patch(`/reviews/moderation/${fila.id}/hide`)
          .send({ moderation_reason: 'other', hidden_reason }),
      ).expect(400);
    }
    // Sin cuerpo `hidden_reason`: `undefined` tampoco es un detalle.
    await comoAdmin(
      api()
        .patch(`/reviews/moderation/${fila.id}/hide`)
        .send({ moderation_reason: 'other' }),
    ).expect(400);

    const row = await readRow(fila.id);
    expect(row?.is_hidden).toBe(false);
    expect(row?.moderation_reason).toBeNull();
  });

  test('«other» con detalle → 200 y queda el token con su descripción', async () => {
    const fila = await seedReview({ order_id: null });
    const detalle = 'El comentario habla de un producto que el local no vende';

    const res = await comoAdmin(
      api()
        .patch(`/reviews/moderation/${fila.id}/hide`)
        .send({ moderation_reason: 'other', hidden_reason: detalle }),
    ).expect(200);

    expect(res.body.moderation_reason).toBe('other');
    expect(res.body.hidden_reason).toBe(detalle);
    expect((await readRow(fila.id))?.moderation_reason).toBe('other');
  });

  test('un motivo nombrado SIN detalle → 200, y el detalle queda en null', async () => {
    const fila = await seedReview({ order_id: null });

    // El token ya dice por qué: obligar a escribir un párrafo solo haría que el
    // operador parafraseara la etiqueta.
    const res = await comoAdmin(
      api()
        .patch(`/reviews/moderation/${fila.id}/hide`)
        .send({ moderation_reason: RAZON }),
    ).expect(200);

    expect(res.body.moderation_reason).toBe(RAZON);
    expect(res.body.hidden_reason).toBeNull();
    const row = await readRow(fila.id);
    expect(row?.moderation_reason).toBe(RAZON);
    expect(row?.hidden_reason).toBeNull();
  });

  test('re-ocultar con otro motivo BORRA el detalle anterior', async () => {
    const fila = await seedReview({ order_id: null });

    await comoAdmin(
      api()
        .patch(`/reviews/moderation/${fila.id}/hide`)
        .send({ moderation_reason: RAZON, hidden_reason: MOTIVO }),
    ).expect(200);
    await comoAdmin(
      api().patch(`/reviews/moderation/${fila.id}/unhide`),
    ).expect(200);
    await comoAdmin(
      api()
        .patch(`/reviews/moderation/${fila.id}/hide`)
        .send({ moderation_reason: 'sexual_content_or_violence' }),
    ).expect(200);

    // Si el detalle viejo sobreviviera, la fila affirmaría «lenguaje abusivo
    // hacia el personal» bajo un token de contenido sexual, que es exactamente
    // la contradicción que el token vino a evitar.
    const row = await readRow(fila.id);
    expect(row?.moderation_reason).toBe('sexual_content_or_violence');
    expect(row?.hidden_reason).toBeNull();
  });

  test('admin → 200 y queda QUIÉN y POR QUÉ', async () => {
    const fila = await seedReview({ order_id: null });

    const res = await comoAdmin(
      api()
        .patch(`/reviews/moderation/${fila.id}/hide`)
        .send({ ...CUERPO }),
    ).expect(200);

    expect(res.body.is_hidden).toBe(true);
    expect(res.body.moderation_reason).toBe(RAZON);
    expect(res.body.hidden_reason).toBe(MOTIVO);
    expect(res.body.moderated_by).toBe(adminId);
    expect(res.body.moderated_by_name).toBe('admin de prueba');
    expect(res.body.moderated_at).not.toBeNull();

    const row = await readRow(fila.id);
    expect(row?.is_hidden).toBe(true);
    expect(row?.moderation_reason).toBe(RAZON);
    expect(row?.hidden_reason).toBe(MOTIVO);
    expect(row?.moderated_by).toBe(adminId);
  });

  test('la fila NO se borra: la restricción unique sigue underminedora', async () => {
    const fila = await seedReview();
    await comoAdmin(
      api()
        .patch(`/reviews/moderation/${fila.id}/hide`)
        .send({ ...CUERPO }),
    ).expect(200);

    // La fila sigue ahí, con su (user_id, order_id) ocupado. Ese es el punto del
    // soft-hide: si desapareciera, el autor podría re-publicar la misma reseña.
    expect(await readRow(fila.id)).toBeDefined();
  });

  test('id inexistente → 404', async () => {
    await comoAdmin(
      api()
        .patch(`/reviews/moderation/${randomUUID()}/hide`)
        .send({ ...CUERPO }),
    ).expect(404);
  });
});

describe('PATCH /reviews/moderation/:id/unhide', () => {
  test('usuario sin rol admin → 403 y la reseña sigue oculta', async () => {
    const fila = await seedReview({
      order_id: null,
      is_hidden: true,
      moderation_reason: RAZON,
    });

    await api()
      .patch(`/reviews/moderation/${fila.id}/unhide`)
      .set('Authorization', `Bearer ${tokens.user}`)
      .expect(403);

    expect((await readRow(fila.id))?.is_hidden).toBe(true);
  });

  test('admin → 200 y la vuelve visible, CONSERVANDO el motivo', async () => {
    const fila = await seedReview({ order_id: null });
    await comoAdmin(
      api()
        .patch(`/reviews/moderation/${fila.id}/hide`)
        .send({ ...CUERPO }),
    ).expect(200);

    const res = await comoAdmin(
      api().patch(`/reviews/moderation/${fila.id}/unhide`),
    ).expect(200);

    expect(res.body.is_hidden).toBe(false);
    // El motivo NO se borra: es el registro de por qué se ocultó, y borrarlo al
    // desocultar dejaría la decisión de restauración sin explicación. El token
    // tampoco, y por la misma razón: el negocio apela preguntando bajo qué
    // política se retiró, no solo qué dijo el operador.
    expect(res.body.moderation_reason).toBe(RAZON);
    expect(res.body.hidden_reason).toBe(MOTIVO);
    expect(res.body.moderated_by).not.toBeNull();
    const row = await readRow(fila.id);
    expect(row?.is_hidden).toBe(false);
    expect(row?.moderation_reason).toBe(RAZON);
  });

  test('es idempotente: desocultar dos veces no es un error', async () => {
    const fila = await seedReview({ order_id: null });
    await comoAdmin(
      api()
        .patch(`/reviews/moderation/${fila.id}/hide`)
        .send({ ...CUERPO }),
    ).expect(200);

    await comoAdmin(
      api().patch(`/reviews/moderation/${fila.id}/unhide`),
    ).expect(200);
    await comoAdmin(
      api().patch(`/reviews/moderation/${fila.id}/unhide`),
    ).expect(200);

    expect((await readRow(fila.id))?.is_hidden).toBe(false);
  });
});

describe('el filtro de la bandeja', () => {
  test('visibility=hidden deja fuera las visibles, y "all" las trae todas', async () => {
    const visible = await seedReview({ order_id: null, product_rating: 4 });
    const oculta = await seedReview({
      order_id: null,
      is_hidden: true,
      moderation_reason: RAZON,
    });

    const soloOcultas = await comoAdmin(
      api().get('/reviews/moderation?visibility=hidden&limit=100'),
    ).expect(200);
    const idsOcultas = soloOcultas.body.data.map((f: { id: string }) => f.id);
    expect(idsOcultas).toContain(oculta.id);
    expect(idsOcultas).not.toContain(visible.id);

    const todas = await comoAdmin(
      api().get('/reviews/moderation?visibility=all&limit=100'),
    ).expect(200);
    const idsTodas = todas.body.data.map((f: { id: string }) => f.id);
    expect(idsTodas).toContain(oculta.id);
    expect(idsTodas).toContain(visible.id);
  });

  test('meta.total cuenta lo mismo que la lista devuelve', async () => {
    const res = await comoAdmin(
      api().get('/reviews/moderation?limit=100'),
    ).expect(200);
    expect(res.body.meta.total).toBe(res.body.data.length);
  });

  test('rating busca en product_rating y business_rating, no en la columna legacy', async () => {
    const deUna = await seedReview({
      order_id: null,
      product_rating: null,
      business_rating: 1,
    });

    const res = await comoAdmin(
      api().get('/reviews/moderation?rating=1&limit=100'),
    ).expect(200);

    const fila = res.body.data.find((f: { id: string }) => f.id === deUna.id);
    // `reviews.rating` está en NULL en toda fila moderna, así que un filtro por
    // esa columna devolvería una bandeja vacía y el operador concluiría que no
    // hay reseñas de 1 estrella.
    expect(fila).toBeDefined();
    expect(fila.business_rating).toBe(1);
  });

  test('filtra por negocio', async () => {
    const res = await comoAdmin(
      api().get(`/reviews/moderation?business_id=${businessId}&limit=100`),
    ).expect(200);
    for (const fila of res.body.data as { business_id: string }[]) {
      expect(fila.business_id).toBe(businessId);
    }
  });

  test('filtra por motivo, y el filtro se combina con visibility', async () => {
    // El token de la fila tiene que volver tal cual y ser filtrable: es el
    // contrato entre lo que el panel grabó y lo que el operador puede pedir.
    const ocultada = await seedReview({
      order_id: null,
      is_hidden: true,
      moderation_reason: 'identity_discrimination',
    });
    await comoAdmin(
      api().patch(`/reviews/moderation/${ocultada.id}/hide`).send({
        moderation_reason: 'identity_discrimination',
        hidden_reason: 'Menciona la etnia del personal',
      }),
    ).expect(200);

    const res = await comoAdmin(
      api().get(
        '/reviews/moderation?moderation_reason=identity_discrimination&limit=100',
      ),
    ).expect(200);

    const ids = res.body.data.map((f: { id: string }) => f.id);
    expect(ids).toContain(ocultada.id);
    for (const fila of res.body.data as { moderation_reason: string }[]) {
      expect(fila.moderation_reason).toBe('identity_discrimination');
    }

    // Y combinado con el otro filtro, que es como lo usa el panel.
    const combinado = await comoAdmin(
      api().get(
        '/reviews/moderation?visibility=hidden&moderation_reason=identity_discrimination&limit=100',
      ),
    ).expect(200);
    expect(combinado.body.data.map((f: { id: string }) => f.id)).toContain(
      ocultada.id,
    );
  });

  test('un motivo que no está en la taxonomía → 400, no se filtra a lo bruto', async () => {
    // Un token desconocido en la URL devolvería una bandeja que el operador
    // creyó filtrada y no lo está. Peor que un error.
    await comoAdmin(
      api().get('/reviews/moderation?moderation_reason=me_gustó_poco'),
    ).expect(400);
    await comoAdmin(api().get('/reviews/moderation?moderation_reason=')).expect(
      400,
    );
  });

  test('meta.total del filtro por motivo cuenta lo mismo que la lista', async () => {
    const res = await comoAdmin(
      api().get(
        '/reviews/moderation?moderation_reason=identity_discrimination&limit=100',
      ),
    ).expect(200);
    // Si el `count` no compartiera el filtro, la cabecera prometería más filas de
    // las que hay y el operador paginaría páginas vacías creyendo que hay más.
    expect(res.body.meta.total).toBe(res.body.data.length);
  });

  test('un rating fuera de 1..5 → 400, no se filtra a lo bruto', async () => {
    await comoAdmin(api().get('/reviews/moderation?rating=9')).expect(400);
  });
});

describe('una reseña oculta sale del promedio público', () => {
  /**
   * El valor que `recalcBusinessRating` tiene que escribir, calculado aparte.
   * Comparar contra la fila de `businesses` no sirve: el trigger y el API
   * recalculan sobre TODAS las reseñas del negocio, así que el salto no es un
   * delta de uno sino la diferencia con el resto de la bandeja del test.
   */
  const expected = async () => {
    const rows = await ctx.db.execute(
      `select coalesce(round(avg(business_rating)::numeric, 2), 0)::float as r,
              count(*) as c
         from reviews
        where business_id = '${businessId}' and is_hidden is not true`,
    );
    return { rating: Number(rows[0].r), count: Number(rows[0].c) };
  };

  const stored = async () => {
    const rows = await ctx.db.execute(
      `select rating::float as r, review_count as c from businesses where id = '${businessId}'`,
    );
    return { rating: Number(rows[0].r), count: Number(rows[0].c) };
  };

  test('ocultarla recalcula businesses.rating y review_count', async () => {
    await seedReview({
      order_id: null,
      product_rating: 5,
      business_rating: 5,
    });
    const mala = await seedReview({
      order_id: null,
      product_rating: 1,
      business_rating: 1,
    });

    const antes = await expected();
    await comoAdmin(
      api()
        .patch(`/reviews/moderation/${mala.id}/hide`)
        .send({ ...CUERPO }),
    ).expect(200);
    const despues = await expected();

    // La fila sale del conjunto visible: el conteo baja en uno y el promedio sube
    // porque la reseña de 1 estrella dejó de contar.
    expect(despues.count).toBe(antes.count - 1);
    expect(despues.rating).toBeGreaterThan(antes.rating);
    expect(await stored()).toEqual(despues);
  });

  test('desocultarla recalcula otra vez y el motivo sobrevive', async () => {
    const mala = await seedReview({
      order_id: null,
      product_rating: 1,
      business_rating: 1,
    });
    const antes = await expected();

    await service.hide(mala.id, { ...CUERPO }, adminId);
    const oculta = await expected();
    expect(oculta.count).toBe(antes.count - 1);
    expect(await stored()).toEqual(oculta);

    await service.unhide(mala.id, adminId);
    // Visible otra vez, con el mismo promedio de antes de ocultarla: el motivo
    // sigue en la fila y solo la visibilidad cambió.
    expect(await expected()).toEqual(antes);
    expect((await readRow(mala.id))?.hidden_reason).toBe(MOTIVO);
  });
});
