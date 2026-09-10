/** Tipos de consentimiento en `user_consents.consent_type` (columna sin CHECK en DB). */
export const CONSENT_TYPES = ['analytics', 'marketing', 'notifications'] as const;

export type ConsentType = (typeof CONSENT_TYPES)[number];
