import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Los identificadores con los que se entró en ESTE dispositivo (§9.1).
 *
 * ─── EL PIN NUNCA ENTRA AQUÍ ──────────────────────────────────────────────────
 *
 * Lo que se guarda es el identificador —el alias o el correo que la persona
 * escribe— y nada más. El PIN es un secreto que el dueño entrega una vez
 * (§8) y que la plataforma nunca vuelve a mostrar: guardarlo aquí lo dejaría
 * en un almacén del dispositivo que cualquiera con el teléfono puede leer, y
 * lo convertiría en una credencial persistente sin rotación. El registro que
 * se escribe tiene una sola clave (`identifiers`) y el test lo sostiene.
 *
 * ─── POR QUÉ EL ALMACÉN LOCAL Y NO EL SERVIDOR ────────────────────────────────
 *
 * El identificador de un acceso es una dirección de correo, y una dirección de
 * correo en un dispositivo compartido es un dato personal. Guardarlo en el
 * teléfono es la decisión menos mala: el registro es local, se puede borrar
 * (`clearLoginIdentifiers`) y no sale del dispositivo. Lo que NO se hace es
 * mandarlo a un servidor para que lo devuelva: eso sería un perfil de
 * rastreo con la lista de cuentas por las que una persona entra.
 */

/** La clave del registro local de identificadores. */
const STORAGE_KEY = "role.login.identifiers";

/** Cuántos identificadores se guardan como máximo. */
const MAX_IDENTIFIERS = 3;

/**
 * Lo que se escribe en `AsyncStorage`. Un objeto y no un arreglo pelado para
 * que la forma del registro pueda crecer sin ambigüedad (una versión, un
 * timestamp) sin reinterpretar el JSON viejo.
 */
interface LoginIdentifierRecord {
	identifiers: string[];
}

/**
 * La última lista leída, en memoria.
 *
 * Sirve para que la pantalla del login muestre los chips en el PRIMER pintado:
 * al volver al login en la misma sesión, los identificadores ya están y la
 * pantalla no arranca vacía. La lectura asíncrona refresca la caché después,
 * así que la caché nunca decide sola qué se muestra.
 */
let cache: string[] = [];

/**
 * Los identificadores que ya se leyeron, sin esperar al disco.
 *
 * La lista es una copia: el llamador no puede mutar la caché por accidente.
 */
export function cachedLoginIdentifiers(): string[] {
	return [...cache];
}

/**
 * Lee el registro. Un JSON corrupto devuelve `[]` en vez de lanzar: un registro
 * que no se puede leer no es una razón para romper la pantalla de acceso, y
 * un `catch` que se traga el error sin dejar rastro sería un bug difícil de
 * ver.
 */
export async function readLoginIdentifiers(): Promise<string[]> {
	try {
		const raw = await AsyncStorage.getItem(STORAGE_KEY);
		cache = parseRecord(raw);
		return [...cache];
	} catch (error) {
		console.warn("login_identifiers_read_failed", error);
		cache = [];
		return [];
	}
}

/**
 * Recuerda el identificador con el que se acaba de entrar.
 *
 * ─── NUNCA ROMPE EL LOGIN ─────────────────────────────────────────────────────
 *
 * El login ya ocurrió cuando esta función se llama: fallar al escribir el
 * registro es un problema del APARATO (disco lleno, almacenamiento roto) y no
 * un motivo para echar a quien acaba de entrar. Por eso el fallo se avisa por
 * `console.warn` y se traga, igual que hace el sello de la sesión de staff.
 *
 * ─── LA ESCRITURA ES LO QUE SE VE ────────────────────────────────────────────
 *
 * El identificador nuevo va primero y empuja al último de los tres, y uno que
 * sólo cambia la caja reemplaza al que ya estaba: para la base son el MISMO
 * acceso (la unicidad es sobre `lower(alias)`), así que dos filas serían una
 * de más y taparía un acceso verdadero.
 */
export async function rememberLoginIdentifier(
	identifier: string,
): Promise<void> {
	const trimmed = identifier.trim();
	if (!trimmed) return;
	try {
		const previous = await readLoginIdentifiers();
		const next = [
			trimmed,
			...previous.filter(
				(value) => value.toLowerCase() !== trimmed.toLowerCase(),
			),
		].slice(0, MAX_IDENTIFIERS);
		const record: LoginIdentifierRecord = { identifiers: next };
		await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record));
		cache = next;
	} catch (error) {
		console.warn("login_identifier_remember_failed", error);
	}
}

/**
 * Borra el registro de identificadores de este dispositivo.
 *
 * Vive en el módulo y no traga el fallo por la misma razón que el resto: un
 * borrado que falla no puede dejar la sesión en un estado raro, y el aviso por
 * `console.warn` deja la traza.
 */
export async function clearLoginIdentifiers(): Promise<void> {
	try {
		await AsyncStorage.removeItem(STORAGE_KEY);
		cache = [];
	} catch (error) {
		console.warn("login_identifiers_clear_failed", error);
	}
}

/**
 * Lee el registro crudo. Devuelve `[]` para todo lo que no sea una lista de
 * cadenas: un JSON corrupto, un objeto con otra forma, una lista con algo que
 * no es texto. La pantalla del login sólo sabe mostrar identificadores.
 */
function parseRecord(raw: string | null): string[] {
	if (!raw) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!parsed || typeof parsed !== "object") return [];
	const identifiers = (parsed as { identifiers?: unknown }).identifiers;
	if (!Array.isArray(identifiers)) return [];
	return identifiers.filter(
		(value): value is string =>
			typeof value === "string" && value.trim() !== "",
	);
}
