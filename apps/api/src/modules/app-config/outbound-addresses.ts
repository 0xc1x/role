import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import type { AppConfigRepository } from './app-config.repository';

/**
 * Single source of truth for the addresses the API sends mail from and to.
 *
 * `app_config` is the de-facto configuration surface (admin-editable, and the
 * place where the product domain lives), so every caller resolves here instead
 * of reading `EMAIL_FROM` on its own. Three tiers, in order:
 *
 * 1. `app_config` row, when it is active and holds a plausible address;
 * 2. the `EMAIL_FROM` env var (sender only), when it holds one;
 * 3. a hardcoded last resort on the real product domain.
 *
 * These are plain functions taking their dependencies as arguments on purpose:
 * no module, no cache, no service to register — callers already hold the
 * repository and the `ConfigService`.
 */

/** What the resolution needs from the repository. */
type ConfigLookup = Pick<AppConfigRepository, 'findByKey'>;

type EnvLookup = ConfigService<Env, true>;

/** Last-resort sender, used only when neither `app_config` nor the env has one. */
const FALLBACK_FROM = 'Rolé <notificaciones@role.ec>';

/** Last-resort business support inbox (`contact.negocios_email`). */
const FALLBACK_BUSINESS_SUPPORT_EMAIL = 'negocios@role.ec';

/** A value only counts as an address if it at least looks like one. */
function isAddress(value: unknown): value is string {
  return typeof value === 'string' && value.includes('@');
}

/**
 * Reads an address from `app_config`. A missing row, an inactive row, a
 * non-string value or a value without `@` all mean "not configured", so the
 * caller falls through to the next tier.
 */
export async function readConfigEmail(
  repo: ConfigLookup,
  key: string,
): Promise<string | null> {
  const row = await repo.findByKey(key);
  if (!row?.active) return null;
  return isAddress(row.value) ? row.value : null;
}

/** `EMAIL_FROM`, only when it holds something that looks like an address. */
function readEnvEmail(config: EnvLookup): string | null {
  const envFrom = config.get('EMAIL_FROM', { infer: true });
  return isAddress(envFrom) ? envFrom : null;
}

/** `nombre@role.ec` → `Rolé <nombre@role.ec>`; a value with a display name is kept. */
function withDisplayName(value: string): string {
  return value.includes('<') ? value : `Rolé <${value}>`;
}

/**
 * The `From` header for every outbound email: `app_config['email.from']`, then
 * the `EMAIL_FROM` env var, then a hardcoded last resort.
 */
export async function resolveOutboundFrom(
  repo: ConfigLookup,
  config: EnvLookup,
): Promise<string> {
  const configured = await readConfigEmail(repo, 'email.from');
  if (configured) return withDisplayName(configured);
  return readEnvEmail(config) ?? FALLBACK_FROM;
}

/**
 * The business-facing support inbox shown to business owners:
 * `app_config['contact.negocios_email']`, then a hardcoded last resort.
 */
export async function resolveBusinessSupportEmail(
  repo: ConfigLookup,
): Promise<string> {
  const configured = await readConfigEmail(repo, 'contact.negocios_email');
  return configured ?? FALLBACK_BUSINESS_SUPPORT_EMAIL;
}
