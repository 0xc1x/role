import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_JWT_SECRET: z
    .string()
    .min(1, 'SUPABASE_JWT_SECRET is required'),
  SUPABASE_ANON_KEY: z
    .string()
    .min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  /** Supabase Storage bucket name for image uploads */
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default('images'),
  /** Comma-separated allowed buckets (allowlist). Default: the default bucket */
  SUPABASE_ALLOWED_BUCKETS: z.string().default('images'),
  /** Comma-separated allowed folders (allowlist). Default: categories */
  SUPABASE_ALLOWED_FOLDERS: z.string().default('categories'),
  /** Comma-separated origins for CORS. Required in production (no '*') */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  /** Basic auth username for /docs in production */
  DOCS_USER: z.string().optional(),
  /** Basic auth password for /docs in production */
  DOCS_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables: ${details}`);
  }
  const env = parsed.data;

  if (env.NODE_ENV === 'production' && env.CORS_ORIGINS === '*') {
    throw new Error(
      'CORS_ORIGINS must be explicitly set in production (cannot be "*")',
    );
  }

  if (env.NODE_ENV === 'production' && (!env.DOCS_USER || !env.DOCS_PASSWORD)) {
    throw new Error(
      'DOCS_USER and DOCS_PASSWORD must be set in production to protect /docs',
    );
  }

  return env;
}

export function parseCorsOrigins(value: string): boolean | string[] {
  if (value === '*') return true;
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
