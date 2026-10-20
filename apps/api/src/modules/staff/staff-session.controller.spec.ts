import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { StaffController } from './staff.controller';
import { StaffSessionController } from './staff-session.controller';
import {
  BIZ,
  CONSUMER_USER,
  MANAGER_USER,
  OTHER_BIZ,
  OWNER_USER,
  STAFF_USER,
  as,
  bootstrapStaffHttp,
  closeStaffHttp,
  memberRow,
  repository,
  resetDoubles,
  sessionState,
  staffHttp,
} from '../../../test/staff-http-harness';

/**
 * `POST /staff/session` — la novena ruta del §8, sobre el stack HTTP real.
 *
 * Comparte el app y los dobles con `staff.controller.spec.ts` a través de
 * `test/staff-http-harness.ts`, y no repite el arranque: dos juegos de fixtures
 * que se apartan son dos suites que pasan por razones distintas.
 *
 * ─── LO QUE ESTA RUTA TIENE QUE DEMOSTRAR, Y ES MÁS QUE LO DE LAS OCHO ───────
 *
 * Que la respuesta es siempre la que computa
 * `business_member_session_state`, y que la resolución de «en qué negocio» la
 * hace la BASE y no este archivo. Las dos cosas se rompen de la misma manera: con
 * una aritmética de TTL en TypeScript, o con un `business_ids[0]` en el
 * controlador, la respuesta pasa a ser una segunda opinión sobre la sesión.
 */

beforeAll(async () => {
  await bootstrapStaffHttp();
});

afterAll(async () => {
  await closeStaffHttp();
});

beforeEach(() => {
  resetDoubles();
});

describe('POST /staff/session con `business_id` nombrado', () => {
  /**
   * La respuesta viene de la base y no de una cuenta en TypeScript.
   *
   * La fecha que se le pide al doble es una que NINGUNA aritmética de TTL puede
   * producir: la fila de la que saldría tiene `last_authenticated_at` de hace una
   * hora y `session_ttl_hours = 24`, así que un `sello + ttl` no puede dar 2031.
   * Si alguien reintrodujera el cálculo —en el servicio o en el repositorio, que
   * es donde Plan 1 lo borró— este test se pone rojo; y si sólo cambia el SQL, la
   * respuesta se mueve con él.
   */
  it('el `expires_at` de la respuesta es el que dijo la función', async () => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({
        role: 'manager',
        location_ids: [],
        expires_at: '2031-04-05T06:07:08.910000+00:00',
        reason: 'ok',
        business_ids: [BIZ],
      }),
    );

    const res = await (
      await as(MANAGER_USER)
    )
      .post('/staff/session')
      .send({ business_id: BIZ });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.expires_at).toBe('2031-04-05T06:07:08.910000+00:00');
    expect(res.body.role).toBe('manager');
    expect(res.body.reason).toBe('ok');
    // El sello nombra el negocio que el cliente dijo, y la lectura también: la
    // llamada sin argumento es OTRA ruta y no se coló.
    expect(repository.stampSession).toHaveBeenCalledWith(
      BIZ,
      MANAGER_USER,
      expect.any(Date),
    );
    expect(repository.sessionStateAsCaller).toHaveBeenLastCalledWith(
      BIZ,
      MANAGER_USER,
    );
  });

  it('sella primero y pregunta después: por eso una vencida vuelve como `ok`', async () => {
    // El doble cambia de respuesta según haya pasado el sello, que es lo que
    // hace la base. Leído al revés, el panel le diría a un gerente que acaba de
    // entrar que su sesión venció — y sería verdad en un idioma y falsa en el
    // otro. El ORDEN de las llamadas es la promesa, no el resultado.
    let sealed = false;
    repository.stampSession.mockImplementation(async () => {
      sealed = true;
      return null;
    });
    repository.sessionStateAsCaller.mockImplementation(async () =>
      sealed
        ? sessionState({ expires_at: '2031-04-05T06:07:08.910000+00:00' })
        : sessionState({ reason: 'session_expired' }),
    );

    const res = await (
      await as(MANAGER_USER)
    )
      .post('/staff/session')
      .send({ business_id: BIZ });

    expect(res.body.reason).toBe('ok');
    expect(
      repository.sessionStateAsCaller.mock.invocationCallOrder[0],
    ).toBeGreaterThan(repository.stampSession.mock.invocationCallOrder[0]);
  });

  it('un empleado la puede llamar, y una membresía pausada se explica en vez de negarse', async () => {
    repository.findMemberByUser.mockResolvedValue(
      memberRow({ status: 'disabled' }),
    );
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({
        role: null,
        location_ids: [],
        expires_at: null,
        reason: 'disabled',
        business_ids: [],
      }),
    );

    const res = await (
      await as(STAFF_USER)
    )
      .post('/staff/session')
      .send({ business_id: BIZ });

    // Un 403 sería un error genérico en la pantalla cuyo trabajo es explicar la
    // salida. Y además este empleado NO pasa la puerta de las otras ocho: esta es
    // la única de las nueve que puede llamar cualquier miembro.
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.reason).toBe('disabled');
    expect(res.body.role).toBeNull();
    // Y a un acceso pausado no se le renueva la sesión: el sello es lo que revive
    // una sesión, y una fila que no concede nada no tiene sesión que revivir.
    expect(repository.stampSession).not.toHaveBeenCalled();
  });

  it('quien no es miembro recibe `no_membership`, no un 403', async () => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({
        role: null,
        location_ids: [],
        expires_at: null,
        reason: 'no_membership',
        business_ids: [],
      }),
    );

    const res = await (
      await as(CONSUMER_USER)
    )
      .post('/staff/session')
      .send({ business_id: BIZ });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.reason).toBe('no_membership');
    expect(repository.stampSession).not.toHaveBeenCalled();
  });
});

describe('POST /staff/session SIN `business_id`: lo resuelve la base', () => {
  /**
   * El caso que el brief y el §5.2 prometen: un panel recién autenticado sella
   * su sesión sin saber todavía en qué negocio está.
   *
   * El cuerpo va VACÍO —ni `{}` con un `undefined`, ni `business_id: null`— para
   * que el test sea sobre lo que un cliente manda de verdad.
   */
  it('con una sola membresía, sella la que la función resolvió y la explica', async () => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'manager', location_ids: [], business_ids: [BIZ] }),
    );

    const res = await (await as(MANAGER_USER)).post('/staff/session').send({});

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.reason).toBe('ok');
    // Y lo que se selló es el `business_ids` que devolvió la BASE, no un
    // `business_ids[0]` elegido acá: el `toHaveBeenNthCalledWith(1, …)` con `null`
    // es lo que dice que la primera pregunta fue sin argumento.
    expect(repository.sessionStateAsCaller).toHaveBeenNthCalledWith(
      1,
      null,
      MANAGER_USER,
    );
    expect(repository.stampSession).toHaveBeenCalledWith(
      BIZ,
      MANAGER_USER,
      expect.any(Date),
    );
  });

  it('un cuerpo totalmente ausente es lo mismo que uno vacío', async () => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'manager', location_ids: [], business_ids: [BIZ] }),
    );

    const res = await (await as(MANAGER_USER)).post('/staff/session');

    expect(res.status).toBe(HttpStatus.OK);
    expect(repository.sessionStateAsCaller).toHaveBeenNthCalledWith(
      1,
      null,
      MANAGER_USER,
    );
  });

  /**
   * La parte que hace que esto no sea «elegir el primero que aparezca».
   *
   * Con varias membresías la función devuelve `multiple_businesses` con la lista,
   * y la ruta contesta ESO y no sella nada. Sellar sería escribir
   * `last_authenticated_at` en una fila elegida a ciegas: renovar la sesión de un
   * negocio en el que la persona quizá no está trabajando, que es peor que no
   * renovar ninguna.
   */
  it('con varias membresías dice `multiple_businesses` y NO sella nada', async () => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({
        role: null,
        location_ids: [],
        expires_at: null,
        reason: 'multiple_businesses',
        business_ids: [BIZ, OTHER_BIZ],
      }),
    );

    const res = await (await as(OWNER_USER)).post('/staff/session').send({});

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.reason).toBe('multiple_businesses');
    expect(res.body.role).toBeNull();
    // La lista es lo que hace la respuesta accionable: el panel pregunta cuál y
    // vuelve con el argumento.
    expect(res.body.business_ids).toEqual([BIZ, OTHER_BIZ]);
    // Y una sola llamada a la función: no hay segunda lectura porque no hubo sello.
    expect(repository.sessionStateAsCaller).toHaveBeenCalledTimes(1);
    expect(repository.stampSession).not.toHaveBeenCalled();
  });

  it('sin membresías contesta `no_membership` y no sella', async () => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({
        role: null,
        location_ids: [],
        expires_at: null,
        reason: 'no_membership',
        business_ids: [],
      }),
    );

    const res = await (await as(CONSUMER_USER)).post('/staff/session').send({});

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.reason).toBe('no_membership');
    expect(repository.stampSession).not.toHaveBeenCalled();
  });

  it('una sesión vencida con una sola membresía se revive: sella y vuelve `ok`', async () => {
    // El orden también importa acá, y es el mismo: la lectura sin argumento es la
    // que RESUELVE, y la que se devuelve es la que va después del sello.
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'manager', business_ids: [BIZ] }),
    );

    const res = await (await as(MANAGER_USER)).post('/staff/session').send({});

    expect(res.body.reason).toBe('ok');
    expect(repository.stampSession).toHaveBeenCalled();
    // Dos llamadas: la que resuelve con `null` y la que explica con el id ya
    // conocido. La segunda nunca va con `null`, porque después del sello la
    // respuesta tiene que ser sobre la fila que se selló.
    expect(repository.sessionStateAsCaller).toHaveBeenNthCalledWith(
      1,
      null,
      MANAGER_USER,
    );
    expect(repository.sessionStateAsCaller).toHaveBeenNthCalledWith(
      2,
      BIZ,
      MANAGER_USER,
    );
  });
});

describe('POST /staff/session — la frontera del cuerpo', () => {
  it('un `expires_at` es 400, no un 200 que finge haber sellado', async () => {
    const res = await (await as(MANAGER_USER)).post('/staff/session').send({
      business_id: BIZ,
      expires_at: '2031-01-01T00:00:00.000000+00:00',
    });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.stampSession).not.toHaveBeenCalled();
    expect(repository.sessionStateAsCaller).not.toHaveBeenCalled();
  });

  it('un `member_id` es 400: el sello es de una membresía, no de una fila', async () => {
    const res = await (
      await as(MANAGER_USER)
    )
      .post('/staff/session')
      .send({ member_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.stampSession).not.toHaveBeenCalled();
  });

  it('`business_id: null` es 400, no un «no sé» explícito', async () => {
    // Aceptar el `null` haría que un cliente que arma el cuerpo con un valor por
    // defecto pidiera la resolución automática sin saber que la pidió, y el
    // camino que nadie exercise es el que nadie prueba.
    const res = await (
      await as(MANAGER_USER)
    )
      .post('/staff/session')
      .send({ business_id: null });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.sessionStateAsCaller).not.toHaveBeenCalled();
  });

  it('un `business_id` que no es uuid es 400', async () => {
    const res = await (
      await as(MANAGER_USER)
    )
      .post('/staff/session')
      .send({ business_id: 'no-es-un-uuid' });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.stampSession).not.toHaveBeenCalled();
  });
});

describe('POST /staff/session — la puerta y el prefijo', () => {
  const handler = () => {
    const controller = new StaffSessionController(
      null as unknown as ConstructorParameters<
        typeof StaffSessionController
      >[0],
    );
    return controller.stampSession;
  };

  it('no pide un rol de Nest: la sella hasta un `staff`', () => {
    // Un `@Roles('business')` acá no rompería los tests de arriba —`stampSession`
    // no pasa por `requireActor`— y dejaría al único empleado que puede entrar a
    // esta pantalla sin poder renovarse la sesión. El mismo defecto que en las
    // otras ocho, y por el mismo motivo no se nota en el status.
    expect(new Reflector().get(ROLES_KEY, handler())).toBeUndefined();
  });

  it('no es pública: sin token no hay a quién sellarle la sesión', async () => {
    expect(new Reflector().get(IS_PUBLIC_KEY, handler())).toBeUndefined();
    await staffHttp()
      .post('/staff/session')
      .send({ business_id: BIZ })
      .expect(401);
  });

  it('no lleva `:businessId` en el prefijo: no pertenece a un negocio', () => {
    expect(Reflect.getMetadata('path', StaffSessionController)).toBe('staff');
  });

  it('comparte el tag de las otras ocho: en /docs son una sola pantalla', () => {
    // Dividirlas en dos tags según el prefijo haría que el que busca «equipo» no
    // encontrara la ruta que sella la sesión.
    expect(Reflect.getMetadata('tags', StaffSessionController)).toEqual(
      Reflect.getMetadata('tags', StaffController),
    );
  });
});
