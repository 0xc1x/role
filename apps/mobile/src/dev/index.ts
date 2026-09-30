/**
 * Sondas de desarrollo que NO son rutas de la app.
 *
 * Todo lo que vive aquí queda fuera de `app/`, así que expo-router no lo
 * publica y no puede llegar a un build de producción. Para usar una de estas
 * pantallas, muévela temporalmente a `app/` y devuélvela al terminar: el
 * router se regenera solo en el siguiente `expo start` / `expo export`.
 */
export { MapDiagnosticScreen } from "./map-diagnostic/MapDiagnosticScreen";
