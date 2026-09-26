export const CONTACT_ROLES = ["negocio", "persona"] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

// La geografía de lanzamiento NO vive en el contrato: es `app_config`
// (`contact.cities`). Un fallback hardcodeado en commons convertía la lista en
// un segundo SSOT que nadie actualiza al abrir una ciudad nueva.
