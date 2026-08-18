# 06 — Design tokens y tema persistente

**Estado: aplicado en mobile y landing.**

## Problema en el original

- Colores mezclados: theme (`FudiColors`) + literales `Color(0xFF…)` inline en
  widgets, duplicados y fuera de sync con el theme.
- Sin tema oscuro real: solo un `ThemeMode` declarativo sin persistencia.
- Fuentes cargadas ad-hoc en cada pantalla (cuando lo estaban).

## Solución aplicada

1. **`src/core/theme/`** (mobile): tokens planos por semántica, no por valor de color:
   - `colors.ts`: `primary #BF1C19`, `secondary #96BF85`, `accent #435D38`,
     `background`, `card`, `muted`, `foreground`, `mutedForeground`, `border`,
     `inputBackground`, `destructive`, `success`, `warning`, `info` — con variantes
     light y dark completas.
   - `typography.ts`: escala tipográfica (Outfit headings / DM Sans body).
   - `spacing.ts`: escala de espaciado (4/8/12/16/24/32).
2. **`ThemeProvider`** (`src/core/theme/index.tsx`): modo `light | dark | system`
   resuelto, persistido en AsyncStorage, expuesto via `useTheme()` con `colors` ya
   resueltos para el modo activo.
3. **UI kit** (`src/core/ui/index.tsx`): `AppText`, `Button`, `Card`, `Screen`,
   `TextField`, `StatusBadge`, `EmptyState`, `ErrorState` — consumen tokens, cero
   `#hex` inline en pantallas.
4. **Landing web**: tokens Rolé en `@theme` de Tailwind (`--color-role-*`).

## Por qué es una mejora

- Cambiar la identidad visual = editar un archivo de tokens.
- El dark mode funciona de verdad (tokens completos por modo).
- Las pantallas nuevas no pueden "escaparse" del theme con literales.

## Pendiente de decisión

- **Sistema de modo del sistema en landing**: la web hoy es clara; evaluar
  `prefers-color-scheme` cuando haya dark mode web.
