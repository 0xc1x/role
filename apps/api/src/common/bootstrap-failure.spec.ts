import { EnvironmentConfigError, validateEnv } from '../config/env.schema';
import { buildBootstrapFailureLog } from './bootstrap-failure';

// Este spec es el mecanismo de enforcing del contrato de logging del arranque:
// si alguien reintroduce `err.message` / `String(err)` en el payload, falla acá.
// Y en la otra dirección: si `validateEnv` deja de exponer los NOMBRES de las
// variables, también falla, porque un arranque que dice "Error" sin nombrar la
// variable culpable es exactamente el bucle de reinicios que el evento evita.
describe('buildBootstrapFailureLog', () => {
  it('no filtra el mensaje crudo de un error con un secreto', () => {
    const payload = buildBootstrapFailureLog(
      new Error('Falta la variable RESEND_API_KEY=re_abc123'),
    );

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('RESEND_API_KEY');
    expect(serialized).not.toContain('re_abc123');
    expect(serialized).not.toContain('Falta la variable');
  });

  it('no inventa una lista de variables a partir del mensaje de un error normal', () => {
    // Un `Error` corriente que menciona una variable en su mensaje no puede
    // inyectar texto en `envVariables`: ese canal existe solo para `validateEnv`.
    const payload = buildBootstrapFailureLog(
      new Error('Invalid environment variables: RESEND_API_KEY: required'),
    );

    expect(payload).toEqual({
      event: 'api_bootstrap_failed',
      errorType: 'Error',
    });
    expect(payload.envVariables).toBeUndefined();
  });

  it('lleva el evento y un errorType acotado, con el código cuando existe', () => {
    const payload = buildBootstrapFailureLog(
      Object.assign(new Error('password=hunter2'), {
        name: 'DatabaseError',
        code: '08006',
      }),
    );

    expect(payload).toEqual({
      event: 'api_bootstrap_failed',
      errorType: 'DatabaseError',
      errorCode: '08006',
    });
    expect(payload.errorType.length).toBeLessThanOrEqual(64);
  });

  it('degrada a un errorType seguro ante valores que no son Error', () => {
    expect(buildBootstrapFailureLog('boom')).toEqual({
      event: 'api_bootstrap_failed',
      errorType: 'string',
    });

    const secret = { token: 'do-not-log' };
    const payload = buildBootstrapFailureLog(secret);
    expect(payload).toEqual({
      event: 'api_bootstrap_failed',
      errorType: 'object',
    });
    expect(JSON.stringify(payload)).not.toContain('do-not-log');
  });

  it('descarta un nombre fuera de la gramática de campo publicable', () => {
    const payload = buildBootstrapFailureLog(
      new EnvironmentConfigError(
        ['SUPABASE_JWT_SECRET', 'valor real = re_abc123', ''],
        'Invalid environment variables',
      ),
    );

    expect(payload.envVariables).toEqual(['SUPABASE_JWT_SECRET']);
  });
});

/**
 * Un `validateEnv` real, no un `EnvironmentConfigError` fabricado: lo que el
 * operador tiene que recibir son los nombres que el schema rechazó de verdad,
 * así que el fixture pasa por la misma validación que corre en el arranque.
 */
function logFromEnvFailure(config: Record<string, unknown>) {
  try {
    validateEnv(config);
  } catch (error) {
    return buildBootstrapFailureLog(error);
  }
  throw new Error('validateEnv no falló: el fixture de este test no es válido');
}

const MINIMAL_ENV = {
  NODE_ENV: 'development' as const,
  DATABASE_URL: 'postgres://localhost:5432/role',
  SUPABASE_URL: 'https://role.supabase.co',
  SUPABASE_JWT_SECRET: 'dev-jwt-secret',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
};

const PRODUCTION_ENV = {
  ...MINIMAL_ENV,
  NODE_ENV: 'production' as const,
  // Fuerte a propósito: `validateEnv` corre los checks de producción en orden,
  // así que un secreto débil haría fallar el fixture en el primer check y los
  // casos siguientes nunca llegarían al que quieren probar.
  SUPABASE_JWT_SECRET: 'role-prod-jwt-7Qm9!Kx2#Vz4@Lp8!Rk6',
  CORS_ORIGINS: 'https://admin.role.app',
  DOCS_USER: 'docs',
  DOCS_PASSWORD: 'docs-pass',
  RESEND_WEBHOOK_SECRET: 'whsec_valid',
  UNSUBSCRIBE_SECRET: 'unsubscribe-secret',
  REDIS_URL: 'redis://localhost:6379',
  ENABLE_JOBS_ORDERS_EXPIRATION: 'true',
};

describe('arranque fallido por variables de entorno', () => {
  it('nombra la variable ausente sin loguear su valor', () => {
    const { SUPABASE_JWT_SECRET: _omitted, ...withoutSecret } = MINIMAL_ENV;
    const payload = logFromEnvFailure(withoutSecret);

    expect(payload.event).toBe('api_bootstrap_failed');
    expect(payload.errorType).toBe('EnvironmentConfigError');
    expect(payload.envVariables).toEqual(['SUPABASE_JWT_SECRET']);
  });

  it('nombra todas las variables que el schema rechaza a la vez', () => {
    const payload = logFromEnvFailure({});

    expect(payload.envVariables).toEqual(
      expect.arrayContaining([
        'DATABASE_URL',
        'SUPABASE_URL',
        'SUPABASE_JWT_SECRET',
        'SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
      ]),
    );
  });

  it('nombra las variables de un rechazo fail-closed de producción', () => {
    const payload = logFromEnvFailure({ ...PRODUCTION_ENV, REDIS_URL: '' });
    expect(payload.envVariables).toEqual(['REDIS_URL']);

    const jwtPayload = logFromEnvFailure({
      ...PRODUCTION_ENV,
      SUPABASE_JWT_SECRET: 'change-me',
    });
    expect(jwtPayload.envVariables).toEqual(['SUPABASE_JWT_SECRET']);
  });

  it('no filtra los valores presentes en el entorno cuando nombra la variable', () => {
    const resendKey = 're_9fJ2_secretValue';
    // El entorno lleva un secreto real y aun así el arranque falla: la prueba
    // es que el log trae el NOMBRE de la culpable y ninguno de los valores.
    const payload = logFromEnvFailure({
      ...PRODUCTION_ENV,
      RESEND_API_KEY: resendKey,
      UNSUBSCRIBE_SECRET: '',
    });

    expect(payload.envVariables).toEqual(['UNSUBSCRIBE_SECRET']);
    expect(JSON.stringify(payload)).not.toContain(resendKey);
    expect(JSON.stringify(payload)).not.toContain('whsec_valid');
    expect(JSON.stringify(payload)).not.toContain('docs-pass');
  });
});
