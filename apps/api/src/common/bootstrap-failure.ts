import { safeErrorFields, type SafeErrorFields } from './utils/safe-error';

/**
 * Payload del log de arranque fallido.
 *
 * Vive en su propio módulo (y no inline en `main.ts`) por dos razones: `main.ts`
 * ejecuta `bootstrap()` en el import, así que no se puede testear sin arrancar
 * la app; y el contrato de no filtrar el mensaje crudo necesita un test que lo
 * falle si alguien reintroduce `err.message`.
 */
export const BOOTSTRAP_FAILURE_EVENT = 'api_bootstrap_failed';

export type BootstrapFailureLog = { event: string } & SafeErrorFields;

/**
 * Construye el evento estructurado de arranque fallido.
 *
 * El contrato documentado en `docs/operations.md` prohíbe registrar mensajes,
 * stacks y causes crudos: aquí solo viajan `errorType` y `errorCode`, acotados
 * por el patrón de `safe-error`. El nombre de la variable de entorno culpable lo
 * reporta el propio `validateEnv` en su mensaje, así que el operador no pierde
 * la información que realmente necesita sin exponerla en los logs.
 */
export function buildBootstrapFailureLog(err: unknown): BootstrapFailureLog {
  return { event: BOOTSTRAP_FAILURE_EVENT, ...safeErrorFields(err) };
}
