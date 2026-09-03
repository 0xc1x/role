import "zod/compile";
// Sentry debe inicializarse antes que expo-router/entry para capturar
// errores tempranos en nativo y web con el mismo DSN.
import "./src/core/analytics";
import "./global.css";
import "expo-router/entry";
