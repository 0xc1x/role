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

/**
 * El bucket donde el móvil sube las capturas de un reporte.
 *
 * NO sale de `value` ni del cliente: es una constante del servidor, como el
 * namespace. Las rutas viajan en `value.images` y el bucket se deduce de acá, de
 * modo que un `value` manipulado no puede hacer que la API firme una URL de otro
 * bucket —ni de uno que no exista, ni de uno cuya política de storage sea más
 * permisiva que la de `bug_report_images`.
 *
 * Es privado a propósito: por eso el API firma URLs de corta duración en vez de
 * publicar rutas (design §8, "el panel nunca ve el bucket crudo").
 */
export const BUG_REPORT_IMAGES_BUCKET = 'bug_report_images';

/**
 * Segundos de validez de una URL firmada.
 *
 * Corta a propósito: la URL se la pasa el API al panel, el panel la usa para
 * pintar la imagen en un drawer y la guarda en el estado de la vista. Si durara
 * un día, quedaría una URL utilizable en el historial del navegador, en un
 * ticket de soporte y en la caché de un proxy, y el bucket es privado por
 * decisión. Cinco minutos alcanzan para abrir el detalle y mirar las capturas;
 * un enlace de soporte no depende de esta URL, porque quien comparte el reporte
 * comparte el id, no la imagen.
 */
export const BUG_REPORT_IMAGE_URL_TTL_SECONDS = 300;
