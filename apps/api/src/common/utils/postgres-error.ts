/**
 * EL ERROR DE POSTGRES, SEA CUAL SEA EL NIVEL EN EL QUE ESTÁ.
 *
 * ─── POR QUÉ HAY QUE BUSCAR EN DOS NIVELES ─────────────────────────────────────
 *
 * Porque Drizzle envuelve TODO error de consulta en un `DrizzleQueryError` que
 * copia SÓLO el `cause`: el `code`, el `constraint_name`, el `message` y el
 * `detail` viven un nivel más abajo, en el error de Postgres que Drizzle se
 * quedó como causa. Una búsqueda sobre el error de arriba NO encuentra nada— y
 * todas las escrituras de esta API pasan por el query builder—, así que las
 * traducciones que leen el `code` se quedan mudas y el usuario recibe un 500
 * genérico en vez de la negativa que la base escribió.
 *
 * Es la trampa que `businesses.service.ts` documenta en su propio mapa —su
 * `mapBusinessWriteError` busca el `errcode` en el error Y en su `cause`— y la
 * que este helper existe para que no se vuelva a escribir tres veces.
 *
 * ─── Y POR QUÉ DEVUELVE EL NIVEL QUE TRAE EL CÓDIGO ───────────────────────────
 *
 * Porque el `message` y el `detail` tienen que salir del MISMO error que el
 * `code`: leídos del otro nivel, la traducción hablaría del error equivocado —
 * el `DrizzleQueryError` lleva un `message` que es la consulta que falló, y
 * ese texto no es el que el motor escribió.
 */

/** The SQL shape of a raise that carries machine-readable detail. */
export type PostgresError = {
  code?: string;
  constraint_name?: string;
  message?: string;
  detail?: string;
  hint?: string;
};

/**
 * UN SQLSTATE SON CINCO CARACTERES: una clase de dos y una subclase de tres.
 *
 * Postgres sólo escribe `23505`, `R0001`, `P0001`, `42P01`… y todos tienen
 * cinco. Es lo que distingue un código de la base de cualquier otra cosa que
 * también se llame `code`.
 */
const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * LOS CÓDIGOS DE NODE NO SON SQLSTATEs.
 *
 * `ENOENT`, `EACCES`, `EBADF`… son de Node: una letra `E` y cuatro letras
 * mayúsculas. Postgres no escribe ninguna clase que empiece por `E`, así que
 * un código con esa forma es de otro sistema y no se puede traducir como si
 * fuera de la base.
 */
const NODE_ERRNO = /^E[A-Z]{4}$/;

/** ¿Este código es un SQLSTATE de Postgres? */
function isSqlState(code: string): boolean {
  return SQLSTATE.test(code) && !NODE_ERRNO.test(code);
}

/**
 * The Postgres error, or `null` when this error is not a Postgres one.
 *
 * Devuelve el error ITSELF cuando es él el que trae el `code`, y su `cause`
 * cuando el `code` está un nivel más abajo —que es el caso de Drizzle—. Del
 * nivel que devuelve salen también el `message`, el `detail` y el
 * `constraint_name`, para que la traducción hable siempre del mismo error.
 */
export function findPostgresError(error: unknown): PostgresError | null {
  const candidates = [
    error,
    (error as { cause?: unknown } | null)?.cause,
  ] as unknown[];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const postgresError = candidate as PostgresError;
    if (typeof postgresError.code !== 'string') continue;
    if (!isSqlState(postgresError.code)) continue;
    return postgresError;
  }
  return null;
}
