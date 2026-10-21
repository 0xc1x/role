import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { OwnershipController } from './ownership.controller';
import { StaffController } from './staff.controller';
import {
  ADMIN_USER,
  BIZ,
  CONSUMER_USER,
  LOC_A,
  MANAGER_USER,
  MEMBER_OWNER,
  MEMBER_STAFF,
  NEW_AUTH_USER,
  OWNER_USER,
  PROFILES,
  STAFF_USER,
  as,
  authAdmin,
  bearerFor,
  bootstrapStaffHttp,
  closeStaffHttp,
  ownerRow,
  repository,
  resetDoubles,
  sessionState,
  staffHttp,
} from '../../../test/staff-http-harness';

/**
 * Las nueve rutas de `businesses/:businessId/staff` sobre el stack HTTP real: los
 * controladores de verdad, los pipes de verdad, los dos guards de
 * `SecurityModule` de verdad y el `StaffService` de verdad.
 *
 * ─── POR QUÉ EL SERVICIO NO ESTÁ STUBBEADO ──────────────────────────────────────
 *
 * Porque lo que esta tarea tiene que demostrar no es que el controlador llama a
 * un método: es que la PUERTA que se decide en el controlador es la del §5.2.
 * Con el servicio stubbeado, un `GET /businesses/:id/staff` devolvería 200 a
 * cualquiera y el test pasaría igual —incluido un controlador con
 * `@Roles('business')`, que es exactamente el defecto que el §8 manda reemplazar.
 *
 * Lo que se stubea es TODO lo que hay debajo del servicio: el repositorio y el
 * admin de Auth. El harness vive en `test/staff-http-harness.ts` y lo comparten
 * los dos specs de estas rutas.
 *
 * ─── LO QUE ESTOS TESTS NO AFIRMAN ─────────────────────────────────────────────
 *
 * Que `requireActor` pregunte lo correcto ya lo prueban los tests del servicio.
 * Lo que este archivo afirma es de otra capa y es la razón de existir: que la
 * ruta NO tiene una puerta propia que la adelante. Por eso hay tests de metadata
 * (`ROLES_KEY` ausente) y de status sobre el stack real, y no una copia de la
 * lógica de negocio.
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

// ───────────────────────────── la puerta ─────────────────────────────

describe('la puerta de las nueve rutas es la del §5.2', () => {
  /**
   * El test que decide esta tarea, y el que un stub pasaría: con el servicio
   * reemplazado por `jest.fn()`, estas dos llamadas darían 200 las dos.
   *
   * La diferencia entre ellas NO es el rol —los dos son dueños—, es la sesión.
   * Y es la diferencia que el §5.2 promete: `business_member_session_valid` es
   * el único helper que puede DENEGAR por sesión, y `can_manage_location` lo
   * consulta para no autorizar. Autorizando por rol, la segunda respuesta sería
   * un 200 igual que la primera, y el panel y la base discreparían sobre quién
   * está presente.
   */
  it('un dueño con la sesión vencida recibe 403 aunque su rol lo permitiría', async () => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({
        role: 'owner',
        location_ids: [],
        reason: 'session_expired',
        expires_at: '2026-10-16T03:00:00.000000+00:00',
      }),
    );

    const res = await (await as(OWNER_USER)).get(`/businesses/${BIZ}/staff`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.message).toContain('sesión venció');
    // Y la denegación ocurre ANTES de leer la lista: filtrarla y tirarla después
    // habría emitido las sucursales y los alias del negocio por el log.
    expect(repository.listMembersWithScope).not.toHaveBeenCalled();
  });

  it('el mismo dueño con `reason: ok` entra: lo que decide es la respuesta de la función', async () => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'owner', location_ids: [] }),
    );

    const res = await (await as(OWNER_USER)).get(`/businesses/${BIZ}/staff`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(repository.listMembersWithScope).toHaveBeenCalled();
    expect(repository.sessionStateAsCaller).toHaveBeenCalledWith(
      BIZ,
      OWNER_USER,
    );
  });

  it('`session_never_stamped` también deniega: una membresía sin sello es una sesión vencida', async () => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({
        role: 'owner',
        location_ids: [],
        reason: 'session_never_stamped',
      }),
    );

    const res = await (
      await as(OWNER_USER)
    ).post(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/rotate`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it('una razón que esta API no conoce también deniega', async () => {
    // Una palabra nueva en la base no puede abrir la puerta por inadvertencia: el
    // predicado es `reason === 'ok'`, no `reason !== 'session_expired'`.
    repository.sessionStateAsCaller.mockResolvedValue({
      ...sessionState({ role: 'owner' }),
      reason: 'banned_for_being_rude',
    } as never);

    const res = await (await as(OWNER_USER)).get(`/businesses/${BIZ}/staff`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(repository.listMembersWithScope).not.toHaveBeenCalled();
  });

  it('un empleado no administra, aunque su sesión esté viva', async () => {
    const res = await (await as(STAFF_USER)).get(`/businesses/${BIZ}/staff`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.message).toContain('empleado');
    // El `role` de la sesión dice `staff` y el `reason` dice `ok`: los dos los
    // concede la base, y ninguno de los dos abre la puerta. Lo que escribe el 403
    // es `requireActor`, no el estado.
    expect(repository.sessionStateAsCaller).not.toHaveBeenCalled();
  });

  it('un consumidor no es miembro: 403, no una lista vacía', async () => {
    const res = await (await as(CONSUMER_USER)).get(`/businesses/${BIZ}/staff`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(repository.listMembersWithScope).not.toHaveBeenCalled();
  });

  it('un id que no es uuid es 400 antes de tocar la base', async () => {
    const res = await (
      await as(OWNER_USER)
    ).patch(`/businesses/${BIZ}/staff/no-es-un-uuid`);

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.findMemberById).not.toHaveBeenCalled();
  });
});

// ─────────────────── el admin de plataforma, por el stack real ───────────────────

/**
 * El `app_role: 'admin'` no es miembro de ningún negocio, y eso lo dice la
 * puerta —por HTTP, no sólo en el servicio.
 *
 * ─── POR QUÉ ESTE BLOQUE NO ESTÁ EN EL SPEC DEL SERVICIO ──────────────────────
 *
 * Porque el de allí ya existe y pasa, y no alcanza. `requireActor` es una línea
 * dentro de `StaffService`, y un controlador que se olvidara de enganchar la
 * puerta —o una ruta nueva que no pasara por ella— dejaría todos los tests del
 * servicio en verde: ellos no pasan por HTTP. Estos pasan por el stack completo,
 * así que si el `admin` llegara al servicio por una ruta que no lo engancha, el
 * `403` se vería acá y en ningún otro lugar.
 *
 * ─── Y POR QUÉ SE ASERTA EL MENSAJE Y NO EL STATUS ───────────────────────────
 *
 * Porque el status solo no distingue la regresión. El harness responde `null` a
 * `findMemberByUser` para este `sub` a propósito: si una regresión reordenara
 * las comprobaciones, el `admin` caería en «no perteneces a este negocio», que
 * sigue siendo un 403. El MENSAJE sí lo dice —administrar es del dueño del
 * negocio— y es la aserción que de verdad distingue las dos causas.
 */
describe('un admin de plataforma administra de a leer, y sólo de a leer', () => {
  /**
   * Las siete escrituras del §8, con su verbo y su camino.
   *
   * La lista está escrita completa a propósito: agregar una octava ruta sin
   * agregar su fila acá es el modo de fallo que este bloque previene, y se
   * preventa por lectura —una fila que falta es visible en el diff de la tabla.
   *
   * Y la sexta columna es el mensaje que se espera, porque el ALTA tiene otro:
   * un admin de plataforma puede crear un acceso en un negocio que se quedó
   * SIN dueño, y en un negocio CON dueño lo que se le niega es eso —no la
   * administración entera, que sigue siendo del dueño—.
   */
  const writes: Array<
    [
      string,
      'post' | 'patch' | 'delete',
      string,
      Record<string, unknown>,
      string?,
    ]
  > = [
    [
      'alta',
      'post',
      `/businesses/${BIZ}/staff`,
      { label: 'Carla', role: 'staff', business_location_ids: [] },
      'Un negocio con dueño no se administra desde la plataforma: ese dueño lo administra.',
    ],
    [
      'editar',
      'patch',
      `/businesses/${BIZ}/staff/${MEMBER_STAFF}`,
      { role: 'manager' },
    ],
    [
      'alias',
      'patch',
      `/businesses/${BIZ}/staff/${MEMBER_STAFF}/alias`,
      { alias: 'otro@panaderia.role.ec' },
    ],
    ['rotate', 'post', `/businesses/${BIZ}/staff/${MEMBER_STAFF}/rotate`, {}],
    ['disable', 'post', `/businesses/${BIZ}/staff/${MEMBER_STAFF}/disable`, {}],
    ['enable', 'post', `/businesses/${BIZ}/staff/${MEMBER_STAFF}/enable`, {}],
    ['dar de baja', 'delete', `/businesses/${BIZ}/staff/${MEMBER_STAFF}`, {}],
  ];

  it('el harness le da `app_role: admin`, que es de donde sale el rol', () => {
    // Sin esto, los siete 403 de abajo serían la respuesta a «no eres miembro» y
    // no a «supervisas la plataforma pero no administras». Es el ancla del bloque.
    expect(PROFILES[ADMIN_USER]?.role).toBe('admin');
    expect(PROFILES[ADMIN_USER]?.id).toBe(ADMIN_USER);
  });

  for (const [label, verb, url, body, expectedMessage] of writes) {
    it(`${label} recibe 403, y el mensaje dice que administrar es del dueño`, async () => {
      // El cuerpo es VÁLIDO a propósito: el pipe corre antes que el servicio, así
      // que un body incompleto sería un 400 del schema y el 403 de la puerta ni
      // llegaría a medirse. Lo que se afirma acá es que la puerta nega, no que el
      // body esté bien.
      const res = await (await as(ADMIN_USER))[verb](url).send(body);

      expect(res.status).toBe(HttpStatus.FORBIDDEN);
      expect(res.body.message).toBe(
        expectedMessage ??
          'Administrar los accesos del equipo es del dueño del negocio.',
      );
    });
  }

  it('ninguna de las siete alcanzó a escribir algo', async () => {
    const token = await bearerFor(ADMIN_USER);
    for (const [, verb, url, body] of writes) {
      await staffHttp()[verb](url).set('Authorization', token).send(body);
    }

    expect(repository.insertMember).not.toHaveBeenCalled();
    expect(repository.updateMember).not.toHaveBeenCalled();
    expect(repository.softDeleteMember).not.toHaveBeenCalled();
    expect(repository.setScope).not.toHaveBeenCalled();
    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
    // Y ni siquiera se buscó una membresía: un `admin` no tiene fila que buscar, y
    // la negación es anterior a cualquier lectura.
    expect(repository.findMemberByUser).not.toHaveBeenCalled();
  });

  /**
   * LA EXCEPCIÓN, DICHA EN VOZ ALTA.
   *
   * `GET /businesses/:id/staff` sí le responde a un `admin`, y es deliberado:
   * `app_role: 'admin'` es el rol de quien SUPERVISA la plataforma (§10), y la
   * supervisión necesita poder ver a quién de un negocio se le revocó el acceso
   * para poder responder por un cobro. Devolverle una lista vacía sería
   * mentirle sobre el estado del negocio —y una lista vacía es indistinguible de
   * «aquí no hay nadie»—, que es la misma mentira que el 403 de las otras ocho
   * evita.
   *
   * El precio de la excepción es que el `admin` ve `alias`, que espeja
   * `auth.users.email`. Es consciente y está en el §10; lo que este test evita
   * es que la excepción CREZCA sin que nadie lo decida: si mañana una lectura más
   * se le abre por el mismo camino, este archivo es donde se nota.
   */
  it('LA EXCEPCIÓN: la lista sí le responde, y es deliberado', async () => {
    const res = await (await as(ADMIN_USER)).get(`/businesses/${BIZ}/staff`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body).toHaveLength(2);
    // Sin alcance, no por falta de sesión: un `admin` no tiene membresía que
    // pueda vencer, y preguntarle por su sesión sería preguntar sobre una fila
    // que no existe. `list` tiene su rama propia justamente por eso.
    expect(repository.sessionStateAsCaller).not.toHaveBeenCalled();
  });
});

describe('la puerta NO es un @Roles: la metadata lo dice', () => {
  const handlers = () => {
    const controller = new StaffController(
      null as unknown as ConstructorParameters<typeof StaffController>[0],
    );
    return [
      controller.list,
      controller.create,
      controller.revokeAll,
      controller.update,
      controller.updateAlias,
      controller.rotatePin,
      controller.disableAccess,
      controller.enableAccess,
      controller.remove,
    ];
  };

  /**
   * La aserción negativa del §8, escrita como test.
   *
   * `RolesGuard` es global y lee `ROLES_KEY`: si estas rutas lo tuvieran, el
   * chequeo sería `profiles.role ∈ […]`, que es `app_role` y NO lleva TTL. El
   * §5.2 sería entonces una promesa que nadie cumple en esta API, que escribe con
   * `service_role`.
   *
   * La ausencia es lo que hay que proteger, y es un test que no se rompe solo: un
   * `@Roles` puesto «por uniformidad con los otros controladores» deja verdes
   * todos los tests de status —`requireActor` deniega igual— y reinstala la
   * frontera equivocada DELANTE de la buena.
   *
   * ─── Y LA PREGUNTA ES LA DEL GUARD, NO UNA MÁS ────────────────────────────────
   *
   * El guard lee `getAllAndOverride(ROLES_KEY, [handler, class])`: la clase es la
   * SEGUNDA mitad de la pregunta, y un `@Roles('business')` en la clase alcanzaría
   * a las nueve rutas sin tocar ninguna. Un test que mirara sólo el handler no lo
   * vería —y por eso esta aserción usa la misma forma que el guard, y no una
   * más laxa.
   */
  it('ninguna de las nueve pide un rol de Nest, ni en la clase', () => {
    const reflector = new Reflector();

    for (const handler of handlers()) {
      expect(
        reflector.getAllAndOverride(ROLES_KEY, [handler, StaffController]),
      ).toBeUndefined();
    }

    // Y la clase sola, para que el caso se lea también como lo que es: un
    // `@Roles` de clase es la forma que efectivamente tomaría efecto.
    expect(reflector.get(ROLES_KEY, StaffController)).toBeUndefined();
  });

  it('ninguna de las nueve es pública: el AuthGuard global es default-deny', () => {
    const reflector = new Reflector();

    // La misma forma que el guard (`auth.guard.ts:53`): un `@Public` de clase
    // abriría las nueve de una, y el guard lo leería.
    for (const handler of handlers()) {
      expect(
        reflector.getAllAndOverride(IS_PUBLIC_KEY, [handler, StaffController]),
      ).toBeUndefined();
    }

    expect(reflector.get(IS_PUBLIC_KEY, StaffController)).toBeUndefined();
  });

  it('sin token es 401 en las nueve', async () => {
    await staffHttp().get(`/businesses/${BIZ}/staff`).expect(401);
    await staffHttp()
      .post(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/rotate`)
      .expect(401);
    await staffHttp().post(`/businesses/${BIZ}/staff/revoke-all`).expect(401);
    await staffHttp()
      .delete(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`)
      .expect(401);
  });

  it('un token forjado es 401, y lo nega el verificador real', async () => {
    await staffHttp()
      .get(`/businesses/${BIZ}/staff`)
      .set('Authorization', 'Bearer no-es-un-jwt')
      .expect(401);
  });

  it('el prefijo es el del §8', () => {
    expect(Reflect.getMetadata('path', StaffController)).toBe(
      'businesses/:businessId/staff',
    );
  });
});

// ─────────────────────────── el alta no crea dueños ───────────────────────────

describe('POST /businesses/:id/staff', () => {
  beforeEach(() => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'owner', location_ids: [] }),
    );
  });

  /**
   * El 422 y no el 400, y la diferencia no es cosmética.
   *
   * `CreateBusinessMemberSchema` acepta el vocabulario entero A PROPÓSITO
   * (`CREATABLE_BUSINESS_MEMBER_ROLES` es lo que el formulario ofrece, no lo que
   * el schema admite), así que el `owner` pasa la validación de forma y lo
   * rechaza la regla de producto con su motivo. Si el schema lo rechazara, el
   * cliente recibiría un 400 —una respuesta sobre la FORMA del cuerpo— por una
   * regla sobre qué se puede dar de alta, y el servicio se quedaría sin el caso
   * que probar.
   */
  it('un `owner` en el cuerpo es 422, y no crea nada', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff`)
      .send({
        label: 'Otro dueño',
        role: 'owner',
        business_location_ids: [],
      });

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.message).toContain('dueño es quien creó el negocio');
    // Lo que hace que no sea un 400 disfrazado: NADA se escribió. Ni el
    // `auth.users` —que dejaría huérfano, con el alias quemado para siempre— ni
    // la membresía, ni se abrió una transacción.
    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(repository.insertMember).not.toHaveBeenCalled();
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it('un `staff` y un `manager` sí se dan de alta, y el PIN se entrega una vez', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff`)
      .send({ label: 'Carla', role: 'staff', business_location_ids: [LOC_A] });

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.pin).toMatch(/^\d{6}$/);
    expect(res.body.alias).toBe('carla@panaderia-familia.role.ec');
    expect(authAdmin.createUser).toHaveBeenCalled();
    expect(repository.insertMember).toHaveBeenCalled();
  });

  it('un campo de más en el cuerpo es 400 y no llega al servicio', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff`)
      .send({
        label: 'Carla',
        role: 'staff',
        business_location_ids: [],
        status: 'disabled',
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(authAdmin.createUser).not.toHaveBeenCalled();
  });

  it('`business_id` en el cuerpo es 400: el negocio lo trae la ruta', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff`)
      .send({
        label: 'Carla',
        role: 'staff',
        business_location_ids: [],
        business_id: BIZ,
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(authAdmin.createUser).not.toHaveBeenCalled();
  });
});

// ────────────────────────────── dar de baja ──────────────────────────────

describe('DELETE /businesses/:id/staff/:memberId', () => {
  it('un gerente recibe 403 y no se da de baja a nadie', async () => {
    const res = await (
      await as(MANAGER_USER)
    ).delete(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.message).toContain('dueño del negocio');
    expect(repository.softDeleteMember).not.toHaveBeenCalled();
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it('el dueño sí puede, y es un 204 sin cuerpo', async () => {
    const res = await (
      await as(OWNER_USER)
    ).delete(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`);

    expect(res.status).toBe(HttpStatus.NO_CONTENT);
    expect(res.body).toEqual({});
    expect(repository.softDeleteMember).toHaveBeenCalled();
    // El ban del `auth.users` es parte de la operación, no un efecto colateral:
    // una fila dada de baja no concede nada por ningún path, pero su login
    // seguiría entrando.
    expect(authAdmin.updateUserById).toHaveBeenCalledWith(
      STAFF_USER,
      expect.objectContaining({ ban_duration: expect.any(String) }),
    );
  });

  /**
   * El 403 del gerente, INCLUYENDO con un id que no existe.
   *
   * El orden importa: `remove` pregunta por el rol ANTES de `requireMember`, así
   * que un gerente recibe 403 para cualquier id —existente o no—. Al revés, el
   * 404 le diría a un gerente qué ids existen en un negocio que sólo administra
   * a medias: la ruta se vuelve un oráculo de existencia.
   *
   * El test usa un id que NO existe, y por eso puede ver la diferencia: con un id
   * vivo, un 403 y un 404 se distinguen igual, y un cambio de orden dejaría la
   * suite verde.
   */
  it('un gerente recibe 403 también con un id que no existe: la ruta no es un oráculo', async () => {
    repository.findMemberById.mockResolvedValue(null);

    const res = await (
      await as(MANAGER_USER)
    ).delete(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.message).toContain('dueño del negocio');
    expect(repository.softDeleteMember).not.toHaveBeenCalled();
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it('un id que no es de este negocio es 404, y no se toca nada', async () => {
    repository.findMemberById.mockResolvedValue(null);

    const res = await (
      await as(OWNER_USER)
    ).delete(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`);

    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    expect(repository.softDeleteMember).not.toHaveBeenCalled();
  });
});

// ───────────────────── los códigos que el panel distingue ─────────────────────

describe('la traducción de Postgres llega al cliente con su código', () => {
  beforeEach(() => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'owner', location_ids: [] }),
    );
  });

  /**
   * `409` para el alias repetido y `422` para el tope del plan.
   *
   * Los tres los traduce el servicio desde los códigos de Postgres —`23505`,
   * `R0001`, `R0002`— y esta capa tiene que dejarlos pasar SIN reescribirlos: un
   * filtro de excepciones que los tradujera otra vez sería el segundo sitio
   * donde vive la misma regla.
   */
  it('un alias repetido es 409 con el mensaje del negocio, no el código de Postgres', async () => {
    repository.insertMember.mockImplementation(async () => {
      throw Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint_name: 'business_members_alias_key',
      });
    });

    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff`)
      .send({ label: 'Carla', role: 'staff', business_location_ids: [] });

    expect(res.status).toBe(HttpStatus.CONFLICT);
    expect(res.body.message).toBe('Ese alias ya está en uso en este negocio.');
    expect(JSON.stringify(res.body)).not.toContain('23505');
    // Y el `auth.users` que esta llamada creó se borró: sin compensación, un
    // reintento del mismo formulario encuentra el alias tomado por una cuenta que
    // nadie alcanza.
    expect(authAdmin.deleteUser).toHaveBeenCalledWith(NEW_AUTH_USER);
  });

  it('el tope del plan es 422 y el mensaje nombra el plan y el número', async () => {
    repository.insertMember.mockImplementation(async () => {
      throw Object.assign(new Error('plan limit'), {
        code: 'R0001',
        message: 'El plan no admite otro acceso.',
        detail: 'business=… plan=free limit=2 current=3',
      });
    });

    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff`)
      .send({ label: 'Carla', role: 'staff', business_location_ids: [] });

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.message).toContain('free');
    expect(res.body.message).toContain('2');
  });

  it('intentar tocar al dueño es 422 y el mensaje dice que se lo degrade', async () => {
    repository.findMemberById.mockResolvedValue(ownerRow());
    repository.updateMember.mockImplementation(async () => {
      throw Object.assign(new Error('owner untouchable'), {
        code: 'R0002',
        message: 'Degradalo a manager antes de tocar al dueño.',
      });
    });

    const res = await (
      await as(OWNER_USER)
    ).post(`/businesses/${BIZ}/staff/${MEMBER_OWNER}/disable`);

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.message).toContain('Degradalo a manager');
    // El ban NO se mandó: el write de la base va primero a propósito, y un ban que
    // llegara antes de este `R0002` le habría dejado el negocio sin su dueño.
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it('un login que ya existe en GoTrue es 409, en el idioma del dueño', async () => {
    authAdmin.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff`)
      .send({ label: 'Carla', role: 'staff', business_location_ids: [] });

    expect(res.status).toBe(HttpStatus.CONFLICT);
    expect(res.body.message).toBe('Ese alias ya está en uso.');
    expect(JSON.stringify(res.body)).not.toContain('already registered');
  });
});

describe('rotar y desactivar son operaciones distintas', () => {
  beforeEach(() => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'owner', location_ids: [] }),
    );
  });

  it('rotar devuelve un PIN nuevo, responde 200 y NO manda ban', async () => {
    const res = await (
      await as(OWNER_USER)
    ).post(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/rotate`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.pin).toMatch(/^\d{6}$/);
    expect(authAdmin.updateUserById).toHaveBeenCalledWith(
      STAFF_USER,
      expect.objectContaining({ password: expect.any(String) }),
    );
    // El §8 lo llama «el peor resultado posible de esta pantalla»: un dueño que
    // rota creyendo que cortó acceso deja al empleado con la sesión abierta, y no
    // se da cuenta. Por eso los dos métodos no se parecen ni en el nombre.
    expect(authAdmin.updateUserById).not.toHaveBeenCalledWith(
      STAFF_USER,
      expect.objectContaining({ ban_duration: expect.anything() }),
    );
  });

  it('desactivar sí manda el ban, y responde 200 con la membresía', async () => {
    const res = await (
      await as(OWNER_USER)
    ).post(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/disable`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.status).toBe('disabled');
    expect(authAdmin.updateUserById).toHaveBeenCalledWith(
      STAFF_USER,
      expect.objectContaining({ ban_duration: expect.any(String) }),
    );
  });

  it('reactivar levanta el ban', async () => {
    const res = await (
      await as(OWNER_USER)
    ).post(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/enable`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.status).toBe('active');
    expect(authAdmin.updateUserById).toHaveBeenCalledWith(STAFF_USER, {
      ban_duration: 'none',
    });
  });

  it('un `pin` en el cuerpo del rotate es 400: el PIN lo elige el servidor', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/rotate`)
      .send({ pin: '000000' });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });
});

describe('editar el alias son dos columnas en dos sistemas', () => {
  beforeEach(() => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'owner', location_ids: [] }),
    );
  });

  it('mueve las dos y devuelve el aviso del §9.4, sin tocar el PIN', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/alias`)
      .send({ alias: 'caja@panaderialafamilia.ec' });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.alias_warnings).toEqual(['alias_domain_can_receive_mail']);
    expect(repository.updateMember).toHaveBeenCalledWith(BIZ, MEMBER_STAFF, {
      alias: 'caja@panaderialafamilia.ec',
    });
    expect(authAdmin.updateUserById).toHaveBeenCalledWith(
      STAFF_USER,
      expect.objectContaining({ email: 'caja@panaderialafamilia.ec' }),
    );
    // El alias es cómo se identifica y el PIN es el secreto: son dos hechos
    // independientes, y el dueño puede rotar el PIN aparte si quiere.
    expect(authAdmin.updateUserById).not.toHaveBeenCalledWith(
      STAFF_USER,
      expect.objectContaining({ password: expect.anything() }),
    );
  });

  it('un alias bajo `.role.ec` no trae aviso: la lista vacía también es una decisión', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/alias`)
      .send({ alias: 'karla@panaderia.role.ec' });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.alias_warnings).toEqual([]);
  });

  it('si Auth rechaza el correo, el alias vuelve al que estaba', async () => {
    authAdmin.updateUserById.mockResolvedValue({ error: { message: 'boom' } });

    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/alias`)
      .send({ alias: 'otro@panaderia.role.ec' });

    expect(res.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(repository.updateMember).toHaveBeenLastCalledWith(
      BIZ,
      MEMBER_STAFF,
      { alias: 'carla@panaderia.role.ec' },
    );
  });

  it('un alias que no es correo es 400 y no se toca nada', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/alias`)
      .send({ alias: 'no-es-un-correo' });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.updateMember).not.toHaveBeenCalled();
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });
});

describe('PATCH /businesses/:id/staff/:memberId', () => {
  beforeEach(() => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'owner', location_ids: [] }),
    );
  });

  it('cambia el rol y las sucursales, y devuelve la membresía nueva', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`)
      .send({ role: 'manager', business_location_ids: [LOC_A] });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.role).toBe('manager');
    expect(repository.setScope).toHaveBeenCalledWith(
      expect.anything(),
      MEMBER_STAFF,
      [LOC_A],
    );
  });

  it('promover a `owner` es 422, no una silent UPDATE', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`)
      .send({ role: 'owner' });

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(repository.updateMember).not.toHaveBeenCalled();
  });

  it('`status` en el cuerpo es 400: desactivar es su propia ruta', async () => {
    // Un `PATCH` que aceptara `status` devolvería un 200 que aparenta haber
    // pausado a alguien — sin ban, sin cerrar sesiones — y no lo hizo.
    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`)
      .send({ status: 'disabled' });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.updateMember).not.toHaveBeenCalled();
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it('una sucursal de otro negocio es 422, y no se escribe', async () => {
    repository.findLocationIdsInBusiness.mockResolvedValue([]);

    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`)
      .send({ business_location_ids: [LOC_A] });

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(repository.updateMember).not.toHaveBeenCalled();
  });
});

// ─────────────────────── el corte de emergencia ───────────────────────

/**
 * `POST /businesses/:id/staff/revoke-all` sobre el stack HTTP real.
 *
 * Lo que este bloque afirma es de la CAPA DE LA RUTA: que la ruta existe bajo el
 * prefijo del equipo, que NO lleva `@Roles` —la puerta es la del servicio, que
 * tiene dos— y que un empleado recibe el mismo 403 que en las otras ocho.
 */
describe('POST /businesses/:id/staff/revoke-all', () => {
  beforeEach(() => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'owner', location_ids: [] }),
    );
  });

  it('un empleado recibe 403 y no se corta nada', async () => {
    const res = await (
      await as(STAFF_USER)
    ).post(`/businesses/${BIZ}/staff/revoke-all`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.message).toContain('empleado');
    expect(repository.updateMember).not.toHaveBeenCalled();
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it('el dueño entra y recibe el sobre con lo que se cortó', async () => {
    const res = await (
      await as(OWNER_USER)
    ).post(`/businesses/${BIZ}/staff/revoke-all`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.owner_skipped).toBe(true);
    // El roster del harness tiene al dueño y a un acceso: el corte baja al
    // acceso y deja al dueño afuera.
    expect(res.body.disabled).toHaveLength(1);
    expect(res.body.disabled[0].id).toBe(MEMBER_STAFF);
    expect(res.body.disabled[0].status).toBe('disabled');
    // Y el corte cierra la sesión abierta: es un `disable`, no una etiqueta.
    expect(authAdmin.updateUserById).toHaveBeenCalledWith(
      STAFF_USER,
      expect.objectContaining({ ban_duration: expect.any(String) }),
    );
  });

  it('la fila del dueño no se escribe y su login no se banea', async () => {
    const res = await (
      await as(OWNER_USER)
    ).post(`/businesses/${BIZ}/staff/revoke-all`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(
      res.body.disabled.map((member: { id: string }) => member.id),
    ).not.toContain(MEMBER_OWNER);
    expect(repository.updateMember).not.toHaveBeenCalledWith(
      BIZ,
      MEMBER_OWNER,
      expect.anything(),
    );
    expect(authAdmin.updateUserById).not.toHaveBeenCalledWith(
      OWNER_USER,
      expect.anything(),
    );
  });

  it('un cuerpo con algo adentro es 400 antes de tocar la base', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff/revoke-all`)
      .send({ member_ids: [MEMBER_STAFF] });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.updateMember).not.toHaveBeenCalled();
  });
});

// ─────────────────────── la transferencia de propiedad ──────────────────────

/**
 * `POST /businesses/:businessId/ownership/transfer` sobre el stack HTTP real.
 *
 * Lo que este bloque afirma es de la CAPA DE LA RUTA, y no del negocio: que la
 * ruta existe bajo el prefijo de la propiedad —y no del equipo—, que no lleva
 * `@Roles` (la puerta es la membresía, como en las otras ocho), que el dueño
 * entra y un gerente no, y que un `R0004` de la base sale como un 422 con el
 * motivo y no como un 500.
 */
describe('POST /businesses/:id/ownership/transfer', () => {
  beforeEach(() => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'owner', location_ids: [] }),
    );
  });

  it('el dueño entra y la respuesta son las dos membresías en su rol nuevo', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/ownership/transfer`)
      .send({ new_owner_member_id: MEMBER_STAFF });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.previous_owner.id).toBe(MEMBER_OWNER);
    expect(res.body.previous_owner.role).toBe('manager');
    expect(res.body.new_owner.id).toBe(MEMBER_STAFF);
    expect(res.body.new_owner.role).toBe('owner');
    expect(repository.transferOwnership).toHaveBeenCalledWith(
      BIZ,
      MEMBER_STAFF,
      OWNER_USER,
    );
  });

  it('la respuesta NO lleva el PIN de nadie', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/ownership/transfer`)
      .send({ new_owner_member_id: MEMBER_STAFF });

    expect(res.status).toBe(HttpStatus.OK);
    expect(JSON.stringify(res.body)).not.toContain('pin');
    expect(res.body.pin).toBeUndefined();
  });

  it('un gerente recibe 403 y la base no se toca', async () => {
    const res = await (
      await as(MANAGER_USER)
    )
      .post(`/businesses/${BIZ}/ownership/transfer`)
      .send({ new_owner_member_id: MEMBER_STAFF });

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(repository.transferOwnership).not.toHaveBeenCalled();
  });

  it('un R0004 de la base sale como 422 con el motivo, no como un 500', async () => {
    repository.transferOwnership.mockRejectedValue(
      Object.assign(
        new Error('el receptor tiene que ser un acceso vivo de este negocio'),
        {
          code: 'R0004',
          message: 'el receptor tiene que ser un acceso vivo de este negocio',
        },
      ),
    );

    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/ownership/transfer`)
      .send({ new_owner_member_id: MEMBER_STAFF });

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.message).toContain('acceso vivo de este negocio');
    expect(res.body.message).not.toContain('R0004');
  });

  it('un cuerpo sin `new_owner_member_id` es 400 antes de tocar la base', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/ownership/transfer`)
      .send({});

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.transferOwnership).not.toHaveBeenCalled();
  });

  it('un id que no es uuid es 400 antes de tocar la base', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/ownership/transfer`)
      .send({ new_owner_member_id: 'no-es-un-uuid' });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.transferOwnership).not.toHaveBeenCalled();
  });

  it('la ruta NO tiene `@Roles`: la puerta es la membresía', async () => {
    // Un `@Roles` mide `profiles.role`, que es el `app_role` de la cuenta y no
    // lleva TTL. Si esta ruta lo tuviera, un dueño con la sesión vencida
    // entraría igual —las dos filas dicen `role = 'business'`— y la promesa del
    // §5.2 quedaría rota en la puerta que la cumple.
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      OwnershipController.prototype.transfer,
    );
    expect(roles).toBeUndefined();
  });
});

/**
 * `POST /businesses/:id/ownership/restore` sobre el stack HTTP real.
 *
 * Lo que este bloque afirma es de la CAPA DE LA RUTA: que la puerta es de la
 * PLATAFORMA —el `app_role = 'admin'`— y no de la membresía, que el cuerpo se
 * valida antes de tocar la base, y que un `R0004` de la base sale como un 422
 * con el motivo y no como un 500.
 */
describe('POST /businesses/:id/ownership/restore', () => {
  it('el admin entra y la respuesta es la membresía que quedó como dueña', async () => {
    const res = await (
      await as(ADMIN_USER)
    )
      .post(`/businesses/${BIZ}/ownership/restore`)
      .send({ member_id: MEMBER_STAFF });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.owner.id).toBe(MEMBER_STAFF);
    expect(res.body.owner.role).toBe('owner');
    expect(repository.assignOwnership).toHaveBeenCalledWith(
      BIZ,
      MEMBER_STAFF,
      ADMIN_USER,
    );
  });

  it('un dueño recibe 403 y la base no se toca', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/ownership/restore`)
      .send({ member_id: MEMBER_STAFF });

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(repository.assignOwnership).not.toHaveBeenCalled();
  });

  it('un R0004 de la base sale como 422 con el motivo, no como un 500', async () => {
    repository.assignOwnership.mockRejectedValue(
      Object.assign(
        new Error('este negocio ya tiene un dueño: usá la transferencia'),
        {
          code: 'R0004',
          message: 'este negocio ya tiene un dueño: usá la transferencia',
        },
      ),
    );

    const res = await (
      await as(ADMIN_USER)
    )
      .post(`/businesses/${BIZ}/ownership/restore`)
      .send({ member_id: MEMBER_STAFF });

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.message).toContain('ya tiene un dueño');
    expect(res.body.message).not.toContain('R0004');
  });

  it('un cuerpo sin `member_id` es 400 antes de tocar la base', async () => {
    const res = await (
      await as(ADMIN_USER)
    )
      .post(`/businesses/${BIZ}/ownership/restore`)
      .send({});

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.assignOwnership).not.toHaveBeenCalled();
  });

  it('un id que no es uuid es 400 antes de tocar la base', async () => {
    const res = await (
      await as(ADMIN_USER)
    )
      .post(`/businesses/${BIZ}/ownership/restore`)
      .send({ member_id: 'no-es-un-uuid' });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.assignOwnership).not.toHaveBeenCalled();
  });

  it('la respuesta NO lleva el PIN de nadie', async () => {
    const res = await (
      await as(ADMIN_USER)
    )
      .post(`/businesses/${BIZ}/ownership/restore`)
      .send({ member_id: MEMBER_STAFF });

    expect(res.status).toBe(HttpStatus.OK);
    expect(JSON.stringify(res.body)).not.toContain('pin');
  });
});
