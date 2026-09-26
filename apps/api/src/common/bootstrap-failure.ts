import { EnvironmentConfigError } from '../config/env.schema';
import { safeErrorFields, type SafeErrorFields } from '@0xc1x/role-commons';

/**
 * Payload del log de arranque fallido.
 *
 * Vive en su propio módulo (y no inline en `main.ts`) por dos razones: `main.ts`
 * ejecuta `bootstrap()` en el import, así que no se puede testear sin arrancar
 * la app; y el contrato de no filtrar el mensaje crudo necesita un test que lo
 * falle si alguien reintroduce `err.message`.
 */
export const BOOTSTRAP_FAILURE_EVENT = 'api_bootstrap_failed';

export type BootstrapFailureLog = {
  event: string;
  /**
   * Nombres de las variables de entorno que tumban el arranque. Solo aparece en
   * fallos de `validateEnv`: sin ellos, un contenedor reiniciando por un
   * `SUPABASE_JWT_SECRET` ausente decía únicamente `"errorType":"Error"`.
   */
  envVariables?: string[];
} & SafeErrorFields;

/**
 * Nombres de env publicables, o `[]` si el fallo no viene de `validateEnv`.
 *
 * POR QUÉ `instanceof` y no un regex sobre `message`: el mensaje crudo es el
 * canal que `docs/operations.md` prohíbe por completo, y no se depende de que
 * hoy su texto no cargue un valor. El nombre de la variable no es un secreto, así
 * que SÍ se loguea — que es justamente lo que este canal separa del `message`.
 *
 * Que la lista solo pueda salir de un `EnvironmentConfigError` es la propiedad
 * que hace seguro este campo: ningún otro error del proceso, ni uno cuyo
 * mensaje mencione una variable, puede inyectar texto en el log.
 */
function envVariableNames(err: unknown): string[] {
  return err instanceof EnvironmentConfigError ? [...err.variables] : [];
}

/**
 * Construye el evento estructurado de arranque fallido.
 *
 * El contrato documentado en `docs/operations.md` prohíbe registrar mensajes,
 * stacks y causes crudos: aquí viajan `errorType` y `errorCode`, acotados por el
 * patrón de `safe-error`, más los NOMBRES de las variables de entorno
 * implicadas. Los nombres no son un secreto —son la clave que el operador
 * necesita para arreglar el despliegue—, mientras que los valores sí lo son y
 * por eso nunca viajan: ningún mensaje, stack ni causa.
 */
export function buildBootstrapFailureLog(err: unknown): BootstrapFailureLog {
  const envVariables = envVariableNames(err);
  return {
    event: BOOTSTRAP_FAILURE_EVENT,
    ...safeErrorFields(err),
    ...(envVariables.length > 0 ? { envVariables } : {}),
  };
}
