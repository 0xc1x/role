import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Env } from '../../config/env.schema';
import type { Database } from '../../database/database.module';
import { AnnouncementsRepository } from './announcements.repository';

/**
 * POR QUÉ UN SPEC UNITARIO Y NO UN `*.db.spec.ts`
 *
 * Los specs de repositorio de `tips` y `slides` corren contra la base real, y
 * ese camino no puede llegar acá: `listEligible` no lee por drizzle sino por
 * PostgREST, justamente para que la policy decida qué filas vuelven. Contra la
 * base real, la conexión de la API es `service_role` —BYPASSRLS— y la prueba
 * estaría midiendo la identidad equivocada.
 *
 * POR QUÉ ESTA CAPA NECESITABA UN TEST
 *
 * Es la capa que más importa del feature y era la única sin cubrir: el spec del
 * service mockea el repositorio y el del controller mockea el service. La
 * consecuencia concreta de dejarla sin tests era que agregar `.eq('active', true)`
 * a `listEligible`, o cambiar la selección de columnas a `'*'`, dejaba los 50
 * tests en verde — y esa es exactamente la regla duplicada que toda la
 * arquitectura prohíbe.
 */

const URL = 'https://proyecto.supabase.co';
const ANON_KEY = 'anon-key-de-prueba';
const TOKEN = 'Bearer jwt-del-usuario';

/**
 * La selección de columnas, escrita como LITERAL y no como la constante del
 * módulo. Si el test comparara contra la constante, un cambio de la constante
 * cambiaría la expectativa con él y no mediría nada; comparando contra el texto,
 * un `'*'` —o una `user_ids` de más— no puede colarse sin romper el test.
 */
const COLUMNAS_ESPERADAS =
  'id, title, body, severity, audience_kind, priority, active, start_at, end_at, created_at, updated_at';

/**
 * Los builders de filtro de PostgREST. Es una lista, no una regla: la aserción
 * dice que ninguno aparece en la cadena de la consulta, así que agregar un
 * `.eq(...)` —el filtro duplicado— la rompe.
 */
const METODOS_DE_FILTRO = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'is',
  'in',
  'contains',
  'overlaps',
  'filter',
  'not',
  'or',
  'match',
  'textSearch',
  'range',
];

/** Un método registrado en la cadena de la consulta. */
type Llamada = { metodo: string; argumentos: readonly unknown[] };

let llamadas: Llamada[];
let respuesta: { data: unknown; error: { message: string } | null };
let opciones: { url: string; key: string; global: unknown }[];

/**
 * El builder de PostgREST es un Proxy encadenable donde todos los métodos
 * devuelven `this` y el objeto es thenable. Este proxy reproduce las dos
 * cosas: registra cualquier método —incluido uno que todavía no existe— y
 * resuelve con la respuesta canned en el `then`, que es lo que dispara el
 * `await` de `listEligible`.
 */
function encadenable() {
  const objetivo: Record<string, unknown> = {};
  const proxy = new Proxy(objetivo, {
    get(_objetivo, propiedad: string | symbol) {
      // Un símbolo que no sea `then` no es parte de la API encadenable.
      if (typeof propiedad === 'symbol') return undefined;
      if (propiedad === 'then') {
        return (
          resolver: (valor: { data: unknown; error: unknown }) => unknown,
        ) => resolver(respuesta);
      }
      return (...argumentos: unknown[]) => {
        llamadas.push({ metodo: propiedad, argumentos });
        return proxy;
      };
    },
  });
  return proxy;
}

function instalarSupabaseFalso() {
  mock.module('@supabase/supabase-js', () => ({
    createClient: (
      url: string,
      key: string,
      opcionesDeCreateClient: { global: unknown },
    ) => {
      opciones.push({ url, key, global: opcionesDeCreateClient.global });
      return {
        from: (tabla: string) => {
          llamadas.push({ metodo: 'from', argumentos: [tabla] });
          return encadenable();
        },
      };
    },
  }));
}

/**
 * El `db` es un cliente lazy que nunca conecta: `listEligible` no lo toca, y
 * existe para poder construir el repositorio sin castear `{}` a `Database`.
 */
const dbQueNoSeUsa: Database = drizzle({
  client: postgres('postgres://localhost:1/nada', { max: 1 }),
});

const configDePrueba = new ConfigService<Env, true>({
  SUPABASE_URL: URL,
  SUPABASE_ANON_KEY: ANON_KEY,
});

const metodosDe = (cadena: Llamada[]) => cadena.map((c) => c.metodo);

const llamadaDe = (cadena: Llamada[], metodo: string): Llamada | undefined =>
  cadena.find((c) => c.metodo === metodo);

let repository: AnnouncementsRepository;

beforeEach(async () => {
  llamadas = [];
  opciones = [];
  respuesta = { data: [], error: null };
  instalarSupabaseFalso();
  // El import va DESPUÉS del mock.module: con un import estático el módulo ya
  // estaría cargado con el cliente real.
  const { AnnouncementsRepository: Repo } =
    await import('./announcements.repository');
  repository = new Repo(dbQueNoSeUsa, configDePrueba);
});

afterEach(() => {
  mock.restore();
});

describe('listEligible · la sesión con la que se lee', () => {
  test('manda el Authorization crudo al cliente, para que la policy decida', async () => {
    await repository.listEligible(TOKEN);

    expect(opciones).toHaveLength(1);
    expect(opciones[0]?.url).toBe(URL);
    // La clave es la ANON, y el token viaja en el header: es lo que convierte
    // la request en `authenticated` para PostgREST. Al revés —token en la key—
    // no se podría sostener.
    expect(opciones[0]?.key).toBe(ANON_KEY);
    expect(opciones[0]?.global).toEqual({ headers: { Authorization: TOKEN } });
  });

  test('sin token no manda header ninguno: la lectura cae a anon', async () => {
    // Es el caso del landing, que no tiene sesión. Un `{}` vacío es lo que
    // deja que supabase-js ponga su fallback; mandarle un header vacío o la
    // key en el header cambiaría el comportamiento sin que se viera.
    await repository.listEligible(null);

    expect(opciones[0]?.global).toEqual({});
  });

  test('el cliente se arma por llamada, no se comparte entre requests', async () => {
    // Un cliente compartido con la sesión del primero que preguntó sería la
    // peor de las dos formas de equivocarse acá.
    await repository.listEligible(TOKEN);
    await repository.listEligible('Bearer jwt-del-otro');

    expect(opciones).toHaveLength(2);
    expect(opciones[0]?.global).toEqual({ headers: { Authorization: TOKEN } });
    expect(opciones[1]?.global).toEqual({
      headers: { Authorization: 'Bearer jwt-del-otro' },
    });
  });
});

describe('listEligible · las columnas que salen', () => {
  test('el select pide exactamente las once columnas del read path', async () => {
    await repository.listEligible(TOKEN);

    const select = llamadaDe(llamadas, 'select');
    expect(select?.argumentos).toEqual([COLUMNAS_ESPERADAS]);
  });

  test('la selección no lleva user_ids ni business_ids', async () => {
    await repository.listEligible(TOKEN);

    const pedidas = String(llamadaDe(llamadas, 'select')?.argumentos[0]);
    // La razón es la fuga que el contrato cerró: el mismo aviso lo pueden leer
    // muchísimos dispositivos, así que mandarlas le regalaría a cada uno la
    // lista de todos los demás a los que el operador apuntó.
    expect(pedidas).not.toContain('user_ids');
    expect(pedidas).not.toContain('business_ids');
  });

  test('la consulta no lleva NINGÚN filtro de elegibilidad', async () => {
    // El corazón de este spec. La elegibilidad entera —`active`, la ventana y
    // la audiencia— vive en `Anyone reads the announcements they are eligible
    // for`. Si uno de estos métodos aparece, la regla quedó escrita dos veces y
    // solo se va a corregir la de acá.
    await repository.listEligible(TOKEN);

    const filtros = llamadas.filter((c) =>
      METODOS_DE_FILTRO.includes(c.metodo),
    );
    expect(filtros).toEqual([]);
  });

  test('ninguna columna de la ventana aparece en un argumento de filtro', async () => {
    // Red de contención para el caso de que el filtro se escriba con otro
    // builder: el nombre de la columna no puede aparecer en la cadena.
    await repository.listEligible(TOKEN);

    const conFiltro = llamadas.filter(
      (c) => c.metodo !== 'from' && c.metodo !== 'select',
    );
    const texto = JSON.stringify(conFiltro.map((c) => c.metodo));
    expect(texto).not.toContain('active');
    expect(texto).not.toContain('start_at');
    expect(texto).not.toContain('end_at');
    expect(texto).not.toContain('audience');
  });

  test('ordena por priority y created_at, que es presentación y no elegibilidad', async () => {
    // El orden sí es de la API: la policy filtra, el cliente ordena. Sin esto,
    // el móvil no tendría el `required` arriba del lote de `info`.
    await repository.listEligible(TOKEN);

    const ordenes = llamadas.filter((c) => c.metodo === 'order');
    expect(ordenes.map((c) => c.metodo)).toHaveLength(2);
    expect(ordenes[0]?.argumentos).toEqual(['priority', { ascending: false }]);
    expect(ordenes[1]?.argumentos).toEqual([
      'created_at',
      { ascending: false },
    ]);
  });

  test('consulta la tabla de anuncios', async () => {
    await repository.listEligible(TOKEN);

    expect(llamadaDe(llamadas, 'from')?.argumentos).toEqual(['announcements']);
  });
});

describe('listEligible · lo que devuelve y lo que lanza', () => {
  const fila = {
    id: '3f1b1a4e-2c6d-4a5f-9c2e-1f0d2b3c4d5e',
    title: 'Mantenimiento del sábado',
    body: 'No hay ofertas nuevas entre las 3 y las 5 de la tarde.',
    severity: 'info',
    audience_kind: 'all',
    priority: 0,
    active: true,
    start_at: null,
    end_at: null,
    created_at: '2026-10-03T12:00:00+00:00',
    updated_at: '2026-10-03T12:00:00+00:00',
  };

  test('devuelve las filas tal como llegaron de PostgREST', async () => {
    respuesta = { data: [fila], error: null };

    await expect(repository.listEligible(TOKEN)).resolves.toEqual([fila]);
  });

  test('una lista vacía es una lista vacía, no un error', async () => {
    respuesta = { data: [], error: null };

    await expect(repository.listEligible(null)).resolves.toEqual([]);
  });

  test('un error de PostgREST lanza en vez de devolver []', async () => {
    // Devolver `[]` en silencio convierte una caída de la base en "no tenés
    // avisos": el banner del landing se queda vacío y el operador no ve nada.
    respuesta = { data: null, error: { message: 'PGRST301: sin permiso' } };

    await expect(repository.listEligible(TOKEN)).rejects.toThrow(
      'No se pudieron leer los anuncios',
    );
  });

  test('el mensaje del error dice qué pasó, sin volcar el token', async () => {
    respuesta = { data: null, error: { message: 'PGRST301: sin permiso' } };

    const fallo = await repository.listEligible(TOKEN).catch((e: unknown) => e);

    expect(String(fallo)).toContain('PGRST301');
    expect(String(fallo)).not.toContain(TOKEN);
  });
});

/**
 * POR QUÉ ESTA RESOLUCIÓN VA POR POSTGREST Y NO POR DRIZZLE
 *
 * Es la consulta que convierte `business_ids` en `user_ids` al publicar, y tiene
 * la misma exigencia que `listEligible`: si fuera por la conexión de la API —
 * `service_role`, BYPASSRLS— resolvería los dueños sin que ninguna policy
 * opinara, y la lectura no quedaría registrada como lo que el operador puede ver.
 * `authenticated` tiene SELECT sobre `business_ownership` y
 * `Admins can view all business ownership` la deja pasar, así que la sesión del
 * operador alcanza.
 */
describe('ownerIdsForBusinesses · la sesión con la que se resuelve', () => {
  const NEGOCIO = '9a8b7c6d-5e4f-4a3b-b2c1-d0e9f8a7b6c5';
  const OTRO = '8e7d6c5b-4a3f-4291-8877-665544332211';
  const DUENO = '2b8c1d0e-7a3f-4b6c-8d5e-1a2b3c4d5e6f';

  test('manda el Authorization crudo al cliente, para que sea la policy la que decida', async () => {
    await repository.ownerIdsForBusinesses(TOKEN, [NEGOCIO]);

    expect(opciones).toHaveLength(1);
    expect(opciones[0]?.key).toBe(ANON_KEY);
    expect(opciones[0]?.global).toEqual({ headers: { Authorization: TOKEN } });
  });

  test('consulta business_ownership, no businesses', async () => {
    // `businesses` no tiene columna de dueño: la relación vive en su tabla
    // companion, y por eso esta consulta existe.
    await repository.ownerIdsForBusinesses(TOKEN, [NEGOCIO]);

    expect(llamadaDe(llamadas, 'from')?.argumentos).toEqual([
      'business_ownership',
    ]);
  });

  test('pide solo los dos ids, y escribe el filtro por los negocios elegidos', async () => {
    await repository.ownerIdsForBusinesses(TOKEN, [NEGOCIO, OTRO]);

    expect(llamadaDe(llamadas, 'select')?.argumentos).toEqual([
      'business_id, owner_id',
    ]);
    expect(llamadaDe(llamadas, 'in')?.argumentos).toEqual([
      'business_id',
      [NEGOCIO, OTRO],
    ]);
  });

  test('no pide created_at ni updated_at, ni ninguna otra cosa', async () => {
    await repository.ownerIdsForBusinesses(TOKEN, [NEGOCIO]);

    const pedidas = String(llamadaDe(llamadas, 'select')?.argumentos[0]);
    expect(pedidas).not.toContain('created_at');
    expect(pedidas).not.toContain('updated_at');
  });

  test('devuelve las filas tal como llegaron, con el negocio y el dueño', async () => {
    respuesta = {
      data: [{ business_id: NEGOCIO, owner_id: DUENO }],
      error: null,
    };

    await expect(
      repository.ownerIdsForBusinesses(TOKEN, [NEGOCIO]),
    ).resolves.toEqual([{ business_id: NEGOCIO, owner_id: DUENO }]);
  });

  test('devuelve una fila por dueño, sin reindexar ni quedarse con la última', async () => {
    // La resolución suma lo que volvió; acá está la mitad de eso. Hoy
    // `business_ownership_pkey` es PRIMARY KEY (business_id) y no puede haber dos
    // filas del mismo negocio, pero la consulta no proyecta esa cardinalidad y el
    // repositorio no la impone: la co-propiedad no tendría que pasar por acá.
    respuesta = {
      data: [
        { business_id: NEGOCIO, owner_id: DUENO },
        { business_id: NEGOCIO, owner_id: OTRO },
      ],
      error: null,
    };

    const filas = await repository.ownerIdsForBusinesses(TOKEN, [NEGOCIO]);

    expect(filas).toEqual([
      { business_id: NEGOCIO, owner_id: DUENO },
      { business_id: NEGOCIO, owner_id: OTRO },
    ]);
  });

  test('descarta la fila a la que le falta un id', async () => {
    // El cliente de Supabase va sin tipo genérico, así que la respuesta es `any`.
    // Creerse un id inexistente mete a una persona en la audiencia de un aviso, y
    // una audiencia con un id de más es una fuga: lo que no tiene los dos ids no
    // es una fila de `business_ownership`, y el negocio se ve sin dueño —que es
    // exactamente lo que es— para que el service lo rechace nombrándolo.
    respuesta = {
      data: [
        { business_id: NEGOCIO, owner_id: DUENO },
        { business_id: OTRO },
        { business_id: OTRO, owner_id: null },
        null,
      ],
      error: null,
    };

    await expect(
      repository.ownerIdsForBusinesses(TOKEN, [NEGOCIO, OTRO]),
    ).resolves.toEqual([{ business_id: NEGOCIO, owner_id: DUENO }]);
  });

  test('una lista vacía es una lista vacía, no un error', async () => {
    respuesta = { data: [], error: null };

    await expect(
      repository.ownerIdsForBusinesses(TOKEN, [NEGOCIO]),
    ).resolves.toEqual([]);
  });

  test('un error de PostgREST lanza en vez de devolver []', async () => {
    // Devolver `[]` haría que TODO negocio pareciera sin dueño: el service
    // rechazaría publicaciones con un motivo falso, sobre negocios que sí tienen
    // dueño.
    respuesta = { data: null, error: { message: 'PGRST301: sin permiso' } };

    await expect(
      repository.ownerIdsForBusinesses(TOKEN, [NEGOCIO]),
    ).rejects.toThrow('No se pudieron leer los dueños de los negocios');
  });

  test('el mensaje del error dice qué pasó, sin volcar el token', async () => {
    respuesta = { data: null, error: { message: 'PGRST301: sin permiso' } };

    const fallo = await repository
      .ownerIdsForBusinesses(TOKEN, [NEGOCIO])
      .catch((e: unknown) => e);

    expect(String(fallo)).toContain('PGRST301');
    expect(String(fallo)).not.toContain(TOKEN);
  });
});
