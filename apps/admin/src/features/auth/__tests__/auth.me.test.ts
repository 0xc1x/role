import { describe, expect, it, mock } from "bun:test";

/**
 * ─── `GET /auth/me` validado contra el contrato ────────────────────────────
 *
 * El panel pinta el nombre del operador en la barra lateral y en el saludo de
 * la home. Para eso hace falta que el servidor devuelva `full_name` — y hace
 * falta que el panel lo EXIGA: sin validación, una respuesta con la forma
 * antigua (`{id, email, role}`) no rompía nada, sólo hacía que el panel
 * callara al `?? user.email` y mostrara el CORREO donde debía ir el nombre.
 *
 * Estos tests son el pin de esa diferencia entre "degrada en silencio" y
 * "rompe en voz alta".
 */

// El mock reexporta el módulo real: bun comparte el registro entre specs y un
// mock que oculta exports rompe los specs hermanos que también mockean este
// módulo.
const actualClient = await import("@/lib/api/client");

const getMock = mock((_path: string) => Promise.resolve({}));

mock.module("@/lib/api/client", () => ({
	...actualClient,
	api: { ...actualClient.api, get: getMock },
}));

const { getMe } = await import("../api/auth.api");

const USER = {
	id: "11111111-1111-4111-8111-111111111111",
	email: "ada@role.test",
	full_name: "Ada Admin",
	avatar_url: null,
	role: "admin",
} as const;

describe("getMe", () => {
	it("returns the user the API sent, with the name", async () => {
		getMock.mockResolvedValueOnce({ user: USER });

		const res = await getMe();

		expect(res.user.full_name).toBe("Ada Admin");
		expect(res.user.email).toBe("ada@role.test");
	});

	it("refuses a response without the name instead of degrading to the email", async () => {
		// La forma que servía la API antes del arreglo: sin `full_name` ni
		// `avatar_url`. Con validación esto es un error; sin ella, el panel
		// pintaba el correo y nadie se enteraba.
		getMock.mockResolvedValueOnce({
			user: { id: USER.id, email: USER.email, role: USER.role },
		});

		await expect(getMe()).rejects.toThrow();
	});
});
