import { envSchema, validateEnv } from './env.schema';

const strongJwtSecret = 'role-prod-jwt-7Qm9!Kx2#Vz4@Lp8!Rk6';

const baseEnv = {
  NODE_ENV: 'development' as const,
  DATABASE_URL: 'postgres://localhost:5432/role',
  SUPABASE_URL: 'https://role.supabase.co',
  SUPABASE_JWT_SECRET: strongJwtSecret,
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
};

const productionEnv = {
  ...baseEnv,
  NODE_ENV: 'production' as const,
  CORS_ORIGINS: 'https://admin.role.app',
  DOCS_USER: 'docs',
  DOCS_PASSWORD: 'docs-pass',
  RESEND_WEBHOOK_SECRET: 'whsec_valid',
  UNSUBSCRIBE_SECRET: 'unsubscribe-secret',
  REDIS_URL: 'redis://localhost:6379',
  ENABLE_JOBS_ORDERS_EXPIRATION: 'true',
};

describe('envSchema defaults', () => {
  it('permite secrets vacíos en desarrollo (envío deshabilitado)', () => {
    const env = envSchema.parse(baseEnv);
    expect(env.RESEND_WEBHOOK_SECRET).toBe('');
    expect(env.UNSUBSCRIBE_SECRET).toBe('');
    expect(env.ENABLE_JOBS_ORDERS_EXPIRATION).toBe(false);
  });
});

describe('validateEnv fail-closed en producción', () => {
  it('acepta producción con todos los secrets configurados', () => {
    expect(() => validateEnv(productionEnv)).not.toThrow();
  });

  it('rechaza producción sin RESEND_WEBHOOK_SECRET (webhook forjable)', () => {
    expect(() =>
      validateEnv({ ...productionEnv, RESEND_WEBHOOK_SECRET: '' }),
    ).toThrow(/RESEND_WEBHOOK_SECRET/);
  });

  it('rechaza producción sin UNSUBSCRIBE_SECRET (token computable)', () => {
    expect(() =>
      validateEnv({ ...productionEnv, UNSUBSCRIBE_SECRET: '' }),
    ).toThrow(/UNSUBSCRIBE_SECRET/);
  });

  it('exige Redis durable y el expirador de órdenes en producción', () => {
    expect(() => validateEnv({ ...productionEnv, REDIS_URL: '' })).toThrow(
      /REDIS_URL/,
    );
    expect(() =>
      validateEnv({
        ...productionEnv,
        ENABLE_JOBS_ORDERS_EXPIRATION: 'false',
      }),
    ).toThrow(/ENABLE_JOBS_ORDERS_EXPIRATION/);
  });

  it('sigue exigiendo CORS y credenciales de docs en producción', () => {
    expect(() => validateEnv({ ...productionEnv, CORS_ORIGINS: '*' })).toThrow(
      /CORS_ORIGINS/,
    );
    expect(() => validateEnv({ ...productionEnv, DOCS_PASSWORD: '' })).toThrow(
      /DOCS_USER/,
    );
  });

  it('rechaza placeholders conocidos de JWT en producción', () => {
    for (const secret of [
      'your-supabase-jwt-secret',
      'change-me',
      'test-secret',
      'jwt-secret',
    ]) {
      expect(() =>
        validateEnv({ ...productionEnv, SUPABASE_JWT_SECRET: secret }),
      ).toThrow(/SUPABASE_JWT_SECRET/);
    }
  });

  it('rechaza secretos JWT cortos o con poca variación en producción', () => {
    expect(() =>
      validateEnv({ ...productionEnv, SUPABASE_JWT_SECRET: 'A9!'.repeat(10) }),
    ).toThrow(/SUPABASE_JWT_SECRET/);
    expect(() =>
      validateEnv({ ...productionEnv, SUPABASE_JWT_SECRET: 'A'.repeat(32) }),
    ).toThrow(/SUPABASE_JWT_SECRET/);
  });

  it('mantiene fixtures débiles utilizables fuera de producción', () => {
    expect(() =>
      validateEnv({ ...baseEnv, SUPABASE_JWT_SECRET: 'jwt-secret' }),
    ).not.toThrow();
  });

  it('nunca incluye el secreto rechazado en el error', () => {
    const secret = 'A'.repeat(32);
    let message = '';

    try {
      validateEnv({ ...productionEnv, SUPABASE_JWT_SECRET: secret });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/SUPABASE_JWT_SECRET/);
    expect(message).not.toContain(secret);
  });
});
