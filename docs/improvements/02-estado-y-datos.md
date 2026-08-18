# 02 — Estado y datos (TanStack Query + Zustand)

**Estado: aplicado en mobile.**

## Problema en el original

- Estado de UI mezclado entre `setState`, streams de Supabase y variables sueltas.
- Sin caché: cada visita a una pantalla re-consulta la DB.
- Sin manejo de carga/error consistente: cada pantalla implementaba su propio spinner
  y su propio try/catch.

## Solución aplicada

1. **TanStack Query para estado de servidor** (`@tanstack/react-query`):
   - hooks por feature (`useOffers`, `useBusinessOffers`, `useSavedAddresses`…).
   - caché con `staleTime`, invalidation automática tras mutaciones
     (`invalidateQueries` tras reservar, crear oferta, etc.).
   - estados `isLoading / isError / refetch` consumidos por componentes UI comunes
     (`LoadingView`, `ErrorState`, `EmptyState`).
2. **Zustand SOLO para estado de cliente/sesión**:
   - `useAuthStore`: `status` (loading/authenticated/guest), `session`, `user`,
     `signOut` — alimentado por `watchAuthState` de Supabase.
   - Regla: lo que viene del servidor → Query; lo que es de la sesión/UI → Zustand.
3. **Hooks por feature** en `src/features/*/hooks.ts` — el componente no conoce repos.

## Decisión deliberada

- Se evitó una capa extra tipo "query factory" o "repository interfaces": los repos son
  objetos planos con funciones por entidad. La capa de abstracción es el hook, no el repo
  (menos indirección, mismo contrato).

## Pendiente de decisión

- **Foco por feature**: los hooks de offers se agrupan en `src/features/hooks/index.ts`
  (facade). Si el grafo crece, migrar a colocation por feature
  (`src/features/offers/hooks.ts`). No se hizo ya para mantener el patrón del repo actual.
