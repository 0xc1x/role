# ADR-0003: Bundle ID / applicationId — com.xcix.role

- **Estado**: Aceptado (con ventana de renombrado)
- **Fecha**: 2026-08-11

## Contexto

El app Flutter actual usa `com.xcix.fudi` (org xcix). Un bundle ID publicado no se puede cambiar sin crear una listing nueva en App Store / app nueva en Play. El lanzamiento aún no ocurre.

## Decisión

El app Expo nace con **`com.xcix.role`** (en `app.json`: `android.package` / `ios.bundleIdentifier`). El segmento `xcix` se renombrará al nombre de la empresa **ANTES del primer release a stores** — es un cambio de una línea en un solo lugar, pero se congela con la primera subida.

## Consecuencias

- La listing de stores se crea con el ID final (el de la empresa), no con `com.xcix.role`.
- No se renombra el app Flutter internamente (va a morir en el strangler) — solo los artefactos nuevos nacen como Rolé.
- Aviso en `apps/mobile/README.md` como recordatorio pre-release.
