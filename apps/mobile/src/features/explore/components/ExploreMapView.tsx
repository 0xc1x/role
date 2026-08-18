/**
 * Re-export del fallback web. Metro resuelve `.native.tsx` en iOS/Android
 * y `.web.tsx` en web; este archivo solo existe para que TypeScript resuelva
 * el import sin sufijo de plataforma.
 */
export * from "./ExploreMapView.web";