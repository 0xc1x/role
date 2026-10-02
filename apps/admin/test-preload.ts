// Preload de tests (bunfig.toml [test]): shims mínimos para specs que
// tocan `window` sin necesitar jsdom (storage + redirect a /login).
const g = globalThis as unknown as Record<string, unknown>;
if (!g.window) g.window = globalThis;
const w = g.window as Record<string, unknown>;
if (!w.location) w.location = { href: "" };

/**
 * POR QUÉ ESTE SHIM: `lib/api/client.ts` resuelve el storage con un `localStorage`
 * global y lo trata fail-safe (`getStorage()` lo envuelve en try/catch y devuelve
 * `undefined` si no existe), así que sin este objeto el cliente queda mudo en
 * silencio: los helpers de token devuelven `null` y los specs de auth mueren en
 * `beforeEach` con `TypeError: undefined is not an object` al hacer
 * `window.localStorage.clear()`. Es el mismo shim que ya se Armada a mano en
 * `client.test.ts`, patrón que se conserva: se define en `window` Y en
 * `globalThis` porque son objetos distintos siempre que otro spec sustituya
 * `window` por la ventana de happy-dom, y el código bajo prueba lee el global.
 *
 * Solo los accesos que el panel usa; `length` y `key` están porque un `Storage`
 * que los omite no es sustituible por uno real y el primer consumer que
 * introspeccione las claves (sonda de persistencia, tests) fallaría por un
 * motivo equivocado. `getItem` devuelve `null` —no `undefined`— por la misma
 * razón: es lo que distingue "no está" de "está con valor vacío".
 */
if (!w.localStorage) {
	const store = new Map<string, string>();
	const storage = {
		get length() {
			return store.size;
		},
		key(index: number) {
			return [...store.keys()][index] ?? null;
		},
		getItem(key: string) {
			return store.get(key) ?? null;
		},
		setItem(key: string, value: string) {
			store.set(key, String(value));
		},
		removeItem(key: string) {
			store.delete(key);
		},
		clear() {
			store.clear();
		},
	};
	w.localStorage = storage;
	g.localStorage = storage;
}
