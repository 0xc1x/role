import { z } from 'zod';

import { SAFE_ERROR_FIELD } from '@0xc1x/role-commons';

/**
 * Fallo de validación de entorno que separa lo público de lo sensible.
 *
 * POR QUÉ EXISTE: `docs/operations.md` prohíbe registrar mensajes crudos, y el
 * `message` de este error es exactamente eso — una concatenación de mensajes de
 * issues de zod. No se depende de que hoy ese texto no cargue un valor: la
 * dependencia correcta es que el canal prohibido no se toque nunca. El nombre
 * de la variable, en cambio, no es un secreto y es justo lo que el operador
 * necesita para arreglar un contenedor reiniciando en bucle. Separar los dos
 * canales en campos distintos es lo que permite loguear el segundo sin abrir el
 * primero.
 *
 * `variables` se filtra aquí y no al construir el log: una lista filtrada en el
 * punto de consumo sigue pudiendo recibir cualquier texto de cualquier llamador,
 * mientras que este constructor no deja entrar un nombre fuera de la gramática.
 */
export class EnvironmentConfigError extends Error {
  /** Nombres de las variables rechazadas. Nunca valores. */
  readonly variables: readonly string[];

  constructor(variables: readonly string[], message: string) {
    super(message);
    this.name = 'EnvironmentConfigError';
    this.variables = [
      ...new Set(
        variables.filter(
          (name): name is string =>
            typeof name === 'string' && SAFE_ERROR_FIELD.test(name),
        ),
      ),
    ];
  }
}

/** Lanza el rechazo fail-closed nombrando las variables implicadas. */
function invalidEnv(variables: string[], message: string): never {
  throw new EnvironmentConfigError(variables, message);
}

/**
 * Flag booleano de env ("true"/"false") para los espejos del ADR-0008.
 * Default false: el SQL de Supabase sigue siendo el emisor activo hasta el cutover.
 */
const mirrorFlag = (def: 'true' | 'false' = 'false') =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true');

const insecureJwtSecretValues = new Set([
  'admin',
  'changeme',
  'change-me',
  'default',
  'example',
  'example-secret',
  'jwt-secret',
  'password',
  'replaceme',
  'replace-me',
  'secret',
  'secret-key',
  'supersecret',
  'test',
  'test-secret',
  'test-secret-key',
  'your-jwt-secret',
  'your-secret',
  'your-secret-here',
  'your-supabase-jwt-secret',
]);

const normalizeSecret = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

const hasStrongJwtSecretVariation = (value: string) =>
  [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ].filter(Boolean).length >= 3;

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Deployment version exposed by the health endpoint. */
  APP_VERSION: z.string().default(''),
  /** Render injects the immutable deployed commit SHA. */
  RENDER_GIT_COMMIT: z.string().default(''),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_JWT_SECRET: z.string().min(1, 'SUPABASE_JWT_SECRET is required'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  /**
   * The bucket an upload lands in when the caller does not name one. Distinct
   * from the allowlist below: this is where a file goes, that is where it may go.
   */
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default('images'),
  /**
   * Comma-separated allowlist of buckets the API may write to.
   *
   * Every non-empty bucket that exists in the project's storage, minus
   * `buisness_images` — a misspelling of `business_images` that holds zero
   * objects. Listing it would make the typo a supported destination, and the
   * next person to trust the allowlist as documentation would write to an empty
   * bucket and wonder where the images went. Delete it in the dashboard instead.
   *
   * The default was `images` alone, which is a production trap rather than a
   * conservative default: this variable was absent from `render.yaml` entirely,
   * so the deployed API fell back to the code default and could not write to
   * `product_images` — the bucket the mobile business panel actually uploads to,
   * and the one holding the most objects by a wide margin. A default that
   * silently disagrees with the app's real storage layout fails closed on
   * business features and looks like a permissions problem.
   *
   * DELIBERADAMENTE NO LLEVA `bug_report_images`, y es una decisión, no un
   * olvido. Esa allowlist es de ESCRITURA: la usa `POST /upload/image`, que sube
   * un archivo y devuelve un `getPublicUrl`. En un bucket `public = false` esa
   * URL no resuelve, así que listar `bug_report_images` abriría de más un
   * endpoint de escritura a cambio de nada: el buzón de reportes no sube nada
   * ahí —el móvil lo sube con su propia sesión— y para FIRMAR las capturas usa
   * la constante `BUG_REPORT_IMAGES_BUCKET`, que es del servidor y no necesita
   * permiso de escritura. Agregarla también haría que `.env.example` narrara un
   * bucket que el endpoint de upload no puede usar.
   */
  SUPABASE_ALLOWED_BUCKETS: z
    .string()
    .default('images,business_images,categories_images,product_images'),
  /** Comma-separated allowed folders (allowlist). Default: categories */
  SUPABASE_ALLOWED_FOLDERS: z.string().default('categories'),
  /**
   * Public site URL Supabase appends to the confirmation link generated for
   * business onboarding (a site URL, not the API). Must be listed in
   * Supabase → Authentication → URL Configuration → Redirect URLs.
   */
  AUTH_REDIRECT_TO: z.string().default('http://localhost:3001/'),
  /** Comma-separated origins for CORS. Required in production (no '*') */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  /** Basic auth username for /docs in production */
  DOCS_USER: z.string().optional(),
  /** Basic auth password for /docs in production */
  DOCS_PASSWORD: z.string().optional(),
  /** Resend API key — vacío deshabilita el envío real de emails de marketing */
  RESEND_API_KEY: z.string().default(''),
  /**
   * Remitente por defecto para emails de marketing. Último recurso: la
   * resolución real es `app_config['email.from']` → `EMAIL_FROM` → este valor
   * (ver `resolveOutboundFrom`), y debe caer en el dominio real del producto.
   */
  EMAIL_FROM: z.string().default('Rolé <notificaciones@role.ec>'),
  /** Secreto de firma del webhook de Resend — vacío deshabilita la verificación */
  RESEND_WEBHOOK_SECRET: z.string().default(''),
  /** Secreto HMAC para tokens de desuscripción */
  UNSUBSCRIBE_SECRET: z.string().default(''),
  /** Base absoluta del endpoint de desuscripción (enlace del footer) */
  UNSUBSCRIBE_URL_BASE: z
    .string()
    .default('http://localhost:4001/api/v1/email-marketing/unsubscribe'),
  /** ADR-0008: acumulación de earnings en el API (trigger SQL sigue activo) */
  ENABLE_API_MIRROR_ORDERS: mirrorFlag(),
  /** ADR-0008: generación de payouts por job del API (cron SQL sigue activo) */
  ENABLE_API_MIRROR_PAYOUTS: mirrorFlag(),
  /** ADR-0008: expiración de ofertas por job del API */
  ENABLE_API_MIRROR_OFFERS: mirrorFlag(),
  /** Fase 2: notificaciones push espejo (Supabase edges siguen activas por defecto) */
  ENABLE_API_MIRROR_NOTIFICATIONS: mirrorFlag(),
  /**
   * Expiración de órdenes + restock (cada minuto). Excepción documentada en
   * ADR-0008: Supabase no tiene expirador de órdenes propio (verificado:
   * sin trigger ni cron SQL), así que este job es el único expirador mientras
   * el móvil consuma Supabase directo. Default false como el resto de espejos.
   */
  ENABLE_JOBS_ORDERS_EXPIRATION: mirrorFlag(),
  /** BullMQ: URL de Redis para colas de notificaciones (vacío = ejecución directa sin cola) */
  REDIS_URL: z.string().default(''),
  /** Optional Cloudflare Turnstile settings reserved for a future verifier. */
  TURNSTILE_SITE_KEY: z.string().default(''),
  TURNSTILE_SECRET_KEY: z.string().default(''),
  /** FCM HTTP v1: JSON del service account de Firebase (vacío deshabilita envío web) */
  FCM_SERVICE_ACCOUNT: z.string().default(''),
  /** FCM: project_id (opcional si ya está en el JSON) */
  FCM_PROJECT_ID: z.string().default(''),
  /** Expo: access token para push nativo (opcional) */
  EXPO_ACCESS_TOKEN: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    const details = issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    // Los `path` de zod son las claves del schema, o sea los nombres de las
    // variables: es el único dato del fallo que el operador necesita y el
    // único que este error garantiza poder exponer sin abrir el `message`.
    throw new EnvironmentConfigError(
      issues.map((issue) => issue.path.join('.')),
      `Invalid environment variables: ${details}`,
    );
  }
  const env = parsed.data;

  if (env.NODE_ENV === 'production') {
    const normalizedSecret = normalizeSecret(env.SUPABASE_JWT_SECRET);
    if (insecureJwtSecretValues.has(normalizedSecret)) {
      invalidEnv(
        ['SUPABASE_JWT_SECRET'],
        'SUPABASE_JWT_SECRET must not use a placeholder, test, or change-me value in production',
      );
    }
    if (
      env.SUPABASE_JWT_SECRET.length < 32 ||
      !hasStrongJwtSecretVariation(env.SUPABASE_JWT_SECRET)
    ) {
      invalidEnv(
        ['SUPABASE_JWT_SECRET'],
        'SUPABASE_JWT_SECRET must be at least 32 characters and use at least 3 character types in production',
      );
    }
  }

  if (env.NODE_ENV === 'production' && env.CORS_ORIGINS === '*') {
    invalidEnv(
      ['CORS_ORIGINS'],
      'CORS_ORIGINS must be explicitly set in production (cannot be "*")',
    );
  }

  if (env.NODE_ENV === 'production' && (!env.DOCS_USER || !env.DOCS_PASSWORD)) {
    invalidEnv(
      ['DOCS_USER', 'DOCS_PASSWORD'],
      'DOCS_USER and DOCS_PASSWORD must be set in production to protect /docs',
    );
  }

  if (env.NODE_ENV === 'production' && !env.REDIS_URL) {
    invalidEnv(
      ['REDIS_URL'],
      'REDIS_URL must be set in production for durable throttling and queues',
    );
  }

  if (env.NODE_ENV === 'production' && !env.ENABLE_JOBS_ORDERS_EXPIRATION) {
    invalidEnv(
      ['ENABLE_JOBS_ORDERS_EXPIRATION'],
      'ENABLE_JOBS_ORDERS_EXPIRATION must be enabled in production',
    );
  }

  // Fail-closed: sin estos secrets el webhook de Resend acepta eventos
  // forjados y el token de desuscripción es computable para cualquier userId
  // (HMAC con key vacía). En producción deben existir, aunque el envío esté
  // deshabilitado (RESEND_API_KEY vacío).
  if (env.NODE_ENV === 'production' && !env.RESEND_WEBHOOK_SECRET) {
    invalidEnv(
      ['RESEND_WEBHOOK_SECRET'],
      'RESEND_WEBHOOK_SECRET must be set in production to verify Resend webhooks',
    );
  }

  if (env.NODE_ENV === 'production' && !env.UNSUBSCRIBE_SECRET) {
    invalidEnv(
      ['UNSUBSCRIBE_SECRET'],
      'UNSUBSCRIBE_SECRET must be set in production to sign unsubscribe tokens',
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
