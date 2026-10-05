import { describe, expect, it } from "bun:test";
import { NonNegativeIntSchema } from "../schemas/common";

/**
 * El tope de un `integer` de Postgres, y no un número que elegimos.
 *
 * `z.number().int()` de Zod 4 significa "entero seguro" — hasta 2^53−1 —, no
 * "int4". Y todo lo que este schema valida sale de un int4: `offers.stock` e
 * `initial_stock` son columnas `integer`, y los agregados de estadísticas se
 * castean a `int` en el SQL (`count(*)::int`, verificado en
 * `business-owner-stats.repository.ts:69`). Así que sin la cota el contrato
 * acepta 2^31, la columna no, y el frontera se descubre en la base: un 500 en
 * vez del 400 que el mismo dato debería haber producido en el borde.
 *
 * El otro borde también está: el `nonnegative` de este schema y el `>= 0` que
 * aplica la regla de negocio no son lo mismo, y por eso el piso se prueba
 * aparte.
 */
describe("NonNegativeIntSchema contra el rango de un integer de Postgres", () => {
	it("acepta hasta el tope de int4 inclusive", () => {
		// El contrato tiene que aceptar todo lo que la columna acepta, y ni un
		// valor más. Un valor shy de aceptarlo es un 500 esperando su momento.
		expect(NonNegativeIntSchema.safeParse(0).success).toBe(true);
		expect(NonNegativeIntSchema.safeParse(2147483647).success).toBe(true);
	});

	it("rechaza por encima de int4 en vez de dejarlo pasar a la base", () => {
		// El valor que la columna no puede guardar. El mensaje importa: es lo que
		// ve la persona, y "no puede ser mayor a 2147483647" le dice cuál es el
		// número, mientras que el default de Zod no le dice nada.
		const r = NonNegativeIntSchema.safeParse(2147483648);
		expect(r.success).toBe(false);
		if (r.success) throw new Error("la guarda no se ejecutó");
		expect(r.error.issues[0]?.message).toBe("No puede ser mayor a 2147483647");
	});

	it("rechaza los enteros seguros que safeint sí admite, y que int4 no", () => {
		// El caso que hace el defecto invisible en una revisión: 2^53−1 es un
		// "entero" para Zod y un desbordamiento para la columna.
		expect(NonNegativeIntSchema.safeParse(9007199254740991).success).toBe(
			false,
		);
	});

	it("mantiene el piso en cero y no lo sube por el efecto del tope", () => {
		// El `nonnegative` sigue siendo lo que impone el piso; el `.max` es
		// aditivo y no puede relajarlo.
		expect(NonNegativeIntSchema.safeParse(-1).success).toBe(false);
		expect(NonNegativeIntSchema.safeParse(0).success).toBe(true);
	});
});
