import { ApiClientError } from "@/lib/api/errors";

/**
 * POR QUÉ ESTE MAPPER EXISTE.
 *
 * Publicar un aviso dirigido a negocios ya no puede salir invisible: la API
 * resuelve cada `business_id` a su `owner_id` al publicar
 * (`announcements.service.ts`, `resolverDuenosDeNegocios`), y los dueños se
 * suman a `user_ids`, que es lo único que mira la policy de select. Un aviso
 * dirigido a negocios LLEGA a sus dueños.
 *
 * El error que queda es del servidor y solo existe cuando existe: un negocio sin
 * dueño se RECHAZA con un 400 que nombra los ids
 * (`No se puede publicar: estos negocios no tienen dueño asignado y el aviso no
 * llegaría a nadie: <ids>`). Ese 400 tiene que llegar al operador con los
 * negocios identificables —la respuesta posible es ir a darle dueño al negocio, y
 * para eso hay que saber cuál— y no tragado como un error genérico.
 *
 * POR QUÉ SE RECONOCE POR EL TEXTO Y NO POR UN CÓDIGO: la API no manda un
 * código de error. `ApiClientError` no tiene `code`, y `error: "Bad Request"` lo
 * comparten todos los 400, así que no hay nada más que el mensaje. Por eso el
 * reconocimiento es por una marca y por el status, y por eso devuelve `[]`
 * cuando no la encuentra: el form cae al párrafo genérico de arriba, que es lo
 * correcto ante un mensaje desconocido. Atar el panel a la redacción exacta
 * sería peor —el mensaje puede cambiar sin romper contrato— y un 400 reconocido
 * solo por sus ids mentiría sobre cualquier otro 400.
 */
const MARCA_SIN_DUEÑO = "no tienen dueño asignado";

/** Un `uuid`: lo único que el mensaje puede traer que sea un id de negocio. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Los `business_id` que el servidor nombró en el 400 del negocio sin dueño, o
 * `[]` si el error no es ese.
 *
 * Puros: el form los pinta, y la correspondencia id → nombre la resuelve el
 * directorio que ya está cargando, así que acá no hay nada de React.
 */
export function negociosSinDueño(error: unknown): string[] {
	if (!(error instanceof ApiClientError)) return [];
	if (error.status !== 400) return [];
	if (!error.message.includes(MARCA_SIN_DUEÑO)) return [];

	// Los ids van al final, separados por ", ". Se parte por `:` y `,` y se queda
	// con lo que parece un uuid: así la redacción del mensaje puede cambiar sin que
	// el panel deje de encontrar los ids.
	//
	// El `Set` evita además claves de React repetidas si el mensaje los trajera
	// dos veces. El servidor ya deduplica, pero el panel no depende de eso.
	return [
		...new Set(
			error.message
				.split(/[,:]/)
				.map((parte) => parte.trim())
				.filter((parte) => UUID.test(parte)),
		),
	];
}
