export const CONTACT_ROLES = ['negocio', 'persona'] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const CONTACT_CITIES_FALLBACK = [
  'Quito',
  'Guayaquil',
  'Cuenca',
  'Manta',
  'Otra',
] as const;
