/**
 * Escapa `%`, `_` y `\` para patrones LIKE/ILIKE. Postgres usa `\` como
 * escape por defecto, y drizzle bindea el valor (sin inyección); esto evita
 * que un `%` del usuario ensanche la búsqueda.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
