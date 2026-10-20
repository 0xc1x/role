import { getTableName } from 'drizzle-orm';
import type { Database } from '../../database/database.module';
import { StaffRepository, type StaffDbExecutor } from './staff.repository';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL SQL QUE EMITE EL REPOSITORIO, Y POR QUÉ SE LEE ACÁ
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * El §8 dice que el borrado de un acceso es LÓGICO: la fila se queda, con su
 * `deleted_at`, para que "quién estuvo aquí" siga contestable y el alias no
 * vuelva a la bolsa. Esa es una afirmación sobre el SQL, y el SQL lo emite
 * `StaffRepository` —una capa por debajo del servicio, que en los tests de
 * arriba está MOCKEADA.
 *
 * Por eso este archivo existe: un test del servicio con el repositorio mockeado
 * no puede ver un `delete from business_members` escrito dentro de
 * `softDeleteMember`, y un test que dice "no borra físicamente nada" sin ver el
 * SQL no afirma nada. Acá el executor es un DOBLE QUE REGISTRA, no una base de
 * datos: no se necesita ninguna, y por eso el test corre en milisegundos.
 *
 * ─── EL DOBLE REGISTRA LA OPERACIÓN, NO LA EJECUTA ────────────────────────────
 *
 * Un doble que ejecutara de verdad exigiría una base; uno que registra no
 * necesita ninguna y además ve MÁS: una implementación que escribiera el borrado
 * como SQL crudo —`delete from business_members`— también queda registrada, y
 * una que usara `db.delete(...)` también. Las dos formas de borrar se ven.
 */

/** Una operación pedida al executor, tal como el repositorio la pidió. */
type Recorded = {
  op: 'update' | 'insert' | 'delete' | 'execute';
  table?: string;
  values?: unknown;
  sql?: string;
};

const BIZ = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MEMBER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOCATION_ID = '11111111-1111-4111-8111-111111111111';

/**
 * El texto de un `sql` de Drizzle, con los parámetros fuera.
 *
 * No es el SQL exacto —eso exigiría el dialecto— sino lo suficiente para ver si
 * la operación dice `delete`. Los chunks de tipo `StringChunk` llevan el texto y
 * los de tipo `Param` llevan el valor; estos últimos no se imprimen, y para
 * detectar un borrado no hacen falta.
 */
function sqlText(query: unknown): string {
  const chunks =
    (query as { queryChunks?: Array<{ value?: unknown }> }).queryChunks ?? [];
  return chunks
    .map((chunk) => (typeof chunk.value === 'string' ? chunk.value : ''))
    .join(' ');
}

/**
 * Un executor que registra lo que se le pide y no toca ninguna base.
 *
 * La cadena devuelve el mismo objeto en cada paso (`set` → `where` →
 * `returning`) porque el repositorio los encadena, y el `then` hace que `await`
 * sobre la cadena resuelva: sin él, `await executor.update(...).set(...).where(...)`
 * se quedaría esperando una promesa que nunca llega.
 */
function recordingExecutor(calls: Recorded[]): StaffDbExecutor {
  const chain = (call: Recorded) => {
    const self = {
      set(values: unknown) {
        call.values = values;
        return self;
      },
      values(values: unknown) {
        call.values = values;
        return self;
      },
      where() {
        return self;
      },
      onConflictDoUpdate() {
        return self;
      },
      returning: async () => [{}],
      then(
        resolve: (value: unknown) => unknown,
        _reject?: (reason: unknown) => unknown,
      ) {
        resolve(undefined);
        return Promise.resolve();
      },
    };
    return self;
  };

  const executor = {
    update(table: unknown) {
      const call: Recorded = {
        op: 'update',
        table: getTableName(table as never),
      };
      calls.push(call);
      return chain(call);
    },
    insert(table: unknown) {
      const call: Recorded = {
        op: 'insert',
        table: getTableName(table as never),
      };
      calls.push(call);
      return chain(call);
    },
    delete(table: unknown) {
      const call: Recorded = {
        op: 'delete',
        table: getTableName(table as never),
      };
      calls.push(call);
      return chain(call);
    },
    execute(query: unknown) {
      const call: Recorded = { op: 'execute', sql: sqlText(query) };
      calls.push(call);
      return chain(call);
    },
  };

  return executor as unknown as StaffDbExecutor;
}

function repositoryWith(calls: Recorded[]): {
  repository: StaffRepository;
  executor: StaffDbExecutor;
} {
  const executor = recordingExecutor(calls);
  return {
    repository: new StaffRepository(executor as unknown as Database),
    executor,
  };
}

describe('la baja de un acceso es un UPDATE, no un DELETE', () => {
  it('softDeleteMember archiva la fila y no borra nada', async () => {
    const calls: Recorded[] = [];
    const { repository, executor } = repositoryWith(calls);

    await repository.softDeleteMember(executor, BIZ, MEMBER_ID);

    // UNA operación, y es un `update`. Un `delete` —de drizzle o escrito a mano—
    // queda registrado como lo que es, y el assertion lo nombra.
    expect(calls.map((call) => call.op)).toEqual(['update']);
    expect(calls[0]?.table).toBe('business_members');
    // Y lo que escribe es el archivo: `deleted_at`, no la desaparición de la fila.
    expect(calls[0]?.values).toMatchObject({ deleted_at: expect.any(Date) });
  });

  it('setScope archiva el alcance viejo y no borra ninguna fila', async () => {
    const calls: Recorded[] = [];
    const { repository, executor } = repositoryWith(calls);

    await repository.setScope(executor, MEMBER_ID, [LOCATION_ID]);

    expect(calls.every((call) => call.op !== 'delete')).toBe(true);
    expect(calls.every((call) => call.op !== 'execute')).toBe(true);
    // El alcance viejo se archiva con un `update`…
    expect(calls[0]?.op).toBe('update');
    expect(calls[0]?.table).toBe('business_member_locations');
    expect(calls[0]?.values).toMatchObject({ deleted_at: expect.any(Date) });
    // …y el nuevo entra con un `insert` que hace `upsert`, porque una fila que
    // estuvo en el alcance y volvió es una resurrección y no un duplicado.
    expect(calls[1]?.op).toBe('insert');
    expect(calls[1]?.table).toBe('business_member_locations');
  });

  it('un alcance que queda vacío no borra: sólo archiva', async () => {
    const calls: Recorded[] = [];
    const { repository, executor } = repositoryWith(calls);

    await repository.setScope(executor, MEMBER_ID, []);

    expect(calls.map((call) => call.op)).toEqual(['update']);
    expect(calls[0]?.values).toMatchObject({ deleted_at: expect.any(Date) });
  });
});
