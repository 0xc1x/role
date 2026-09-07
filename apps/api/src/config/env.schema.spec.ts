import { envSchema, validateEnv } from './env.schema';

const baseEnv = {
  NODE_ENV: 'development' as const,
  DATABASE_URL: 'postgres://localhost:5432/role',
  SUPABASE_URL: 'https://role.supabase.co',
  SUPABASE_JWT_SECRET: 'jwt-secret',
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
};

describe('envSchema defaults', () => {
  it('permite secrets vacíos en desarrollo (envío deshabilitado)', () => {
    const env = envSchema.parse(baseEnv);
    expect(env.RESEND_WEBHOOK_SECRET).toBe('');
    expect(env.UNSUBSCRIBE_SECRET).toBe('');
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

  it('sigue exigiendo CORS y credenciales de docs en producción', () => {
    expect(() =>
      validateEnv({ ...productionEnv, CORS_ORIGINS: '*' }),
    ).toThrow(/CORS_ORIGINS/);
    expect(() =>
      validateEnv({ ...productionEnv, DOCS_PASSWORD: '' }),
    ).toThrow(/DOCS_USER/);
  });
});
