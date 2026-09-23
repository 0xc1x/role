# Brand — single source of truth

Centraliza el logo, el wordmark y los colores de Rolé.

## Cambiar el logo o el wordmark (un solo lugar)

1. **Logo:** reemplaza `assets/icon.svg` (cuadrado, con `viewBox`).
   Puede venir con fondo o ya transparente: el sync deriva la variante
   **transparente** (quita el rect de fondo crema si existe) para UI,
   favicons y PNGs de mobile; el `apple-touch-icon.png` se aplana sobre
   crema en el render (iOS exige opaco).
   **Wordmark:** reemplaza `assets/wordmark.svg` (mantén el `viewBox`).
   Limpia el `<metadata>` C2PA que exportan los editores antes de commitear
   (`brand:sync` falla si lo detecta).
   **Colores:** edita `tokens.ts` y sube `BRAND_ASSET_VERSION`.
2. Corre `bun run brand:sync` desde `packages/commons`.
   Genera `icon.ts`/`wordmark.ts` (strings que importan admin, landing y
   mobile — la UI se actualiza al recompilar), copia los SVG a cada app y
   sube el `?v=N` de los favicons para romper caché.
   Con `bun run brand:sync -- --png` (necesita `sharp`) regenera además los
   PNG: icono/splash/favicon de mobile y `apple-touch-icon.png` de landing.
3. Reconstruye: `bun run build --filter=role-commons...` y luego cada app.
   El icono del launcher nativo requiere nuevo build EAS; el splash web/PWA
   se actualiza con el deploy.

## Si el dev server dice que falta un export (Vite)

Vite pre-empaqueta `@0xc1x/role-commons` en `node_modules/.vite` y no lo
invalida cuando reconstruyes commons. Si ves
`does not provide an export named 'X'` después de un sync:

1. `bun run build --filter=role-commons` (o `clean` + `build` si borraste un módulo).
2. `rm -rf node_modules/.vite` en la app afectada.
3. Reinicia el dev server.

En mobile pasa lo mismo con Metro: usa `expo start -c` para limpiar su
caché después de regenerar PNGs, y recuerda que el icono del launcher y el
splash nativo solo cambian con un nuevo build EAS/instalación.

## Pendiente (requiere trabajo de diseño, no de este flujo)

- `android-icon-monochrome.png` monocromático (necesita un glifo a un color).
- `favicon.ico` legacy y tarjetas `og.png` (los navegadores modernos ya usan
  `icon.svg`; el `.ico` queda como fallback).
- `admin` `logo192/512.png` (iconos CRA obsoletos, sin uso real).
