/**
 * El ÚNICO namespace que esta bandeja puede leer o escribir.
 *
 * `app_store` es un store genérico con muchos escritores (`POST /contact` es
 * solo uno). El endpoint NO acepta un namespace del cliente: si lo aceptara,
 * este controlador dejaría de ser una bandeja de contactos y pasaría a ser un
 * `app_store` admin genérico, capaz de leer y de marcar como atendido cualquier
 * fila que otro escritor meta mañana. El valor vive en el servidor y el servicio
 * lo aplica en las TRES operaciones — filtro del listado, verificación del
 * detalle y verificación previa a la escritura — para que ningún camino lo
 * esquive.
 */
export const CONTACT_NAMESPACE = 'contact';
