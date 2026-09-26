import { afterEach, describe, expect, it } from "bun:test";
import { setSessionExpiredHandler } from "../session-expiry";
import "@/test-utils/dom";

/**
 * A9: la expiración de sesión se avisa al router con la ruta actual. El
 * `window.location.href = "/login"` anterior era un reload duro: perdía la tarea
 * en curso y dejaba un login mudo.
 */
const { notifySessionExpired } = await import("../session-expiry");

/**
 * En bun `globalThis.window` ya existe (sin `location`/`history`), así que el
 * `??=` del harness de DOM no lo reemplaza: se define `location` a mano.
 */
function stubLocation(pathname: string, search = "") {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
	Object.defineProperty(globalThis, "location", {
		configurable: true,
		writable: true,
		value: { pathname, search },
	});
	return () => {
		if (descriptor) Object.defineProperty(globalThis, "location", descriptor);
		else Reflect.deleteProperty(globalThis, "location");
	};
}

let restoreLocation: (() => void) | null = null;

afterEach(() => {
	restoreLocation?.();
	restoreLocation = null;
	setSessionExpiredHandler(null);
});

describe("aviso de sesión expirada", () => {
	it("notifica al manejador registrado con la ruta actual", () => {
		restoreLocation = stubLocation("/negocios", "?page=3");
		const seen: Array<{ from: string }> = [];
		setSessionExpiredHandler((info) => seen.push(info));

		notifySessionExpired();

		expect(seen).toHaveLength(1);
		// Solo el pathname: el search de cada ruta tiene su propio schema y no se
		// puede reproducir como texto sin validarlo de nuevo.
		expect(seen[0]?.from).toBe("/negocios");
	});

	it("cae a /home si no hay location (SSR, entornos no-DOM)", () => {
		restoreLocation = stubLocation(undefined as unknown as string);
		const seen: Array<{ from: string }> = [];
		setSessionExpiredHandler((info) => seen.push(info));

		notifySessionExpired();

		expect(seen[0]?.from).toBe("/home");
	});

	it("no rompe cuando no hay manejador (SSR, tests)", () => {
		setSessionExpiredHandler(null);
		expect(() => notifySessionExpired()).not.toThrow();
	});
});
