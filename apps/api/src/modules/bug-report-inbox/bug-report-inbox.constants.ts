/**
 * El ÚNICO namespace que este buzón puede leer o escribir.
 *
 * `app_store` es un store genérico con muchos escritores: el formulario público
 * de contacto (`POST /contact`) y los reportes de la app móvil son dos, y mañana
 * pueden ser más. El endpoint NO acepta un namespace del cliente: si lo
 * aceptara, este controlador dejaría de ser un buzón de reportes de errores y
 * pasaría a ser un `app_store` admin genérico, capaz de leer —y de triar— la
 * bandeja de contactos y cualquier otra fila que otro escritor meta después.
 *
 * El valor vive en el servidor y el servicio lo aplica en las TRES
 * operaciones —filtro del listado, verificación del detalle y verificación
 * previa a la escritura— para que ningún camino lo esquive. La última es la
 * que importa: sin ella, un `PATCH` por id escribiría el triaje de un reporte
 * encima de la fila que ese id tenga en `app_store`.
 */
export const BUG_REPORT_NAMESPACE = 'bug_report';
