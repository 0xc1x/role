import { DrizzleQueryError } from 'drizzle-orm';
import { findPostgresError } from './postgres-error';

describe('findPostgresError', () => {
  it('encuentra el código en el error mismo', () => {
    const error = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });

    expect(findPostgresError(error)?.code).toBe('23505');
  });

  /**
   * LA FORMA REAL: el error de Postgres vive en el `cause`, porque Drizzle
   * copia sólo el `cause` y nunca el `code`.
   */
  it('y en el cause, que es donde lo deja Drizzle', () => {
    const postgresError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint_name: 'subscriptions_live_business_key',
      message: 'duplicate key value violates unique constraint',
      detail: 'Key (business_id)=(x) already exists.',
    });
    const drizzleError = new DrizzleQueryError(
      'insert into "subscriptions" ("business_id") values ($1)',
      [],
      postgresError,
    );

    const found = findPostgresError(drizzleError);

    expect(found?.code).toBe('23505');
    // Y el resto sale del MISMO error que el código: el `message` del
    // `DrizzleQueryError` es la consulta que falló, no lo que escribió el
    // motor.
    expect(found?.constraint_name).toBe('subscriptions_live_business_key');
    expect(found?.message).toBe(
      'duplicate key value violates unique constraint',
    );
    expect(found?.detail).toBe('Key (business_id)=(x) already exists.');
  });

  it('devuelve null cuando ningún nivel trae un código', () => {
    expect(findPostgresError(new Error('boom'))).toBeNull();
    expect(findPostgresError(null)).toBeNull();
    expect(findPostgresError(undefined)).toBeNull();
    expect(findPostgresError('un texto')).toBeNull();
    expect(findPostgresError({ message: 'sin código' })).toBeNull();
  });

  /**
   * UN CÓDIGO DE NODE NO ES UN SQLSTATE.
   *
   * `ENOENT` es el código de «no such file or directory» de Node: no es un
   * error de la base, y traducirlo como si lo fuera sería inventar una regla
   * sobre un error que la base nunca escribió.
   */
  it('un código de Node no se confunde con un SQLSTATE', () => {
    const error = Object.assign(new Error('no such file or directory'), {
      code: 'ENOENT',
    });

    expect(findPostgresError(error)).toBeNull();
  });

  it('ni un errno de cinco letras, que tiene la forma de un SQLSTATE', () => {
    const error = Object.assign(new Error('bad file descriptor'), {
      code: 'EBADF',
    });

    expect(findPostgresError(error)).toBeNull();
  });

  it('y un SQLSTATE de la base sí se reconoce, aunque no sea de una constraint', () => {
    const error = Object.assign(new Error('el plan no está en el catálogo'), {
      code: 'P0001',
    });

    expect(findPostgresError(error)?.code).toBe('P0001');
  });
});
