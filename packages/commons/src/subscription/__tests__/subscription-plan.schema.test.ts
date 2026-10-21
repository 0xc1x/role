import { describe, expect, it } from "bun:test";
import {
	BusinessFeatureSchema,
	BusinessPlanCodeSchema,
	PlanAudienceSchema,
	SubscriptionLimitsSchema,
	SubscriptionPlanSchema,
} from "../schemas/subscription-plan.schema";
import {
	BusinessSubscriptionSchema,
	UpdateBusinessSubscriptionSchema,
} from "../schemas/business-subscription.schema";

const BUSINESS_ID = "e2000000-0000-4000-8000-000000000001";

/**
 * Un plan del catálogo, con sus topes y sus features.
 *
 * Se escribe entero y no con una variable por campo porque lo que se prueba es
 * la FORMA: un plan es un código, una audiencia, dos topes y una lista de
 * features, y el panel tiene que poder leer un plan y una suscripción con la
 * misma cabeza.
 */
const PRO_PLUS = {
	code: "pro_plus",
	audience: "business",
	limits: { max_locations: null, max_members: null },
	features: ["staff_access", "payments", "visibility_plus"],
};

describe("el vocabulario del catálogo", () => {
	it("el código del plan es el del §4.5, y no otro", () => {
		for (const code of ["free", "pro", "pro_plus"]) {
			expect(BusinessPlanCodeSchema.safeParse(code).success, code).toBe(true);
		}
		// `premium` suena a plan y no es uno: es el nombre que usaría un cliente
		// que no conoce el catálogo, y aceptarlo sería inventar un plan que el
		// motor no sabe aplicar.
		expect(BusinessPlanCodeSchema.safeParse("premium").success).toBe(false);
	});

	it("la audiencia es «a quién sirve este plan», y el enum la acota", () => {
		for (const audience of ["business", "consumer"]) {
			expect(PlanAudienceSchema.safeParse(audience).success, audience).toBe(
				true,
			);
		}
		expect(PlanAudienceSchema.safeParse("partner").success).toBe(false);
	});

	it("las features son las de `public.business_feature`, no las que se inventen", () => {
		for (const feature of ["staff_access", "payments", "visibility_plus"]) {
			expect(BusinessFeatureSchema.safeParse(feature).success, feature).toBe(
				true,
			);
		}
		// El español no es el enum: el motor compara contra la cadena de la base,
		// y una feature traducida no activa nada.
		expect(BusinessFeatureSchema.safeParse("pagos").success).toBe(false);
	});
});

describe("los topes del plan", () => {
	it("`null` es «sin tope», y por eso es un valor y no una ausencia", () => {
		expect(
			SubscriptionLimitsSchema.safeParse({
				max_locations: null,
				max_members: null,
			}).success,
		).toBe(true);
	});

	it("un tope de cero NO es «sin tope»", () => {
		// `null` es «sin tope» y `0` es «no puede tener ni una sucursal»: el
		// primero es lo que dice `pro_plus` y el segundo no lo dice ningún plan.
		// Confundirlos convertiría un tope en un regalo de cupos.
		expect(
			SubscriptionLimitsSchema.safeParse({
				max_locations: 0,
				max_members: null,
			}).success,
		).toBe(false);
		expect(
			SubscriptionLimitsSchema.safeParse({
				max_locations: null,
				max_members: 0,
			}).success,
		).toBe(false);
	});

	it("un tope negativo o fraccionario no es un tope", () => {
		expect(
			SubscriptionLimitsSchema.safeParse({
				max_locations: -1,
				max_members: 2,
			}).success,
		).toBe(false);
		expect(
			SubscriptionLimitsSchema.safeParse({
				max_locations: 1.5,
				max_members: 2,
			}).success,
		).toBe(false);
	});

	it("los topes que el §4.5 fija son los que se aceptan", () => {
		expect(
			SubscriptionLimitsSchema.safeParse({
				max_locations: 1,
				max_members: 2,
			}).success,
		).toBe(true);
		expect(
			SubscriptionLimitsSchema.safeParse({
				max_locations: 5,
				max_members: 20,
			}).success,
		).toBe(true);
	});
});

describe("SubscriptionPlanSchema", () => {
	it("acepta un plan del catálogo, con `null` donde no hay tope", () => {
		expect(SubscriptionPlanSchema.safeParse(PRO_PLUS).success).toBe(true);
	});

	it("rechaza un tope de cero, que no es «sin tope»", () => {
		expect(
			SubscriptionPlanSchema.safeParse({
				...PRO_PLUS,
				limits: { max_locations: null, max_members: 0 },
			}).success,
		).toBe(false);
	});

	it("rechaza una feature que no está en `BUSINESS_FEATURES`", () => {
		expect(
			SubscriptionPlanSchema.safeParse({
				...PRO_PLUS,
				features: ["pagos"],
			}).success,
		).toBe(false);
	});

	it("rechaza un código o una audiencia que no existen", () => {
		expect(
			SubscriptionPlanSchema.safeParse({ ...PRO_PLUS, code: "premium" })
				.success,
		).toBe(false);
		expect(
			SubscriptionPlanSchema.safeParse({ ...PRO_PLUS, audience: "partner" })
				.success,
		).toBe(false);
	});

	it("no acepta claves de más: el plan es el que es", () => {
		// Un `price` aquí sería una columna que este contrato no tiene, y una
		// columna que este contrato no tiene es una promesa que alguien espera.
		expect(
			SubscriptionPlanSchema.safeParse({ ...PRO_PLUS, price: 9.99 }).success,
		).toBe(false);
	});
});

describe("BusinessSubscriptionSchema", () => {
	const subscription = {
		business_id: BUSINESS_ID,
		plan_code: "pro",
		since: "2026-10-21T00:00:00+00:00",
		limits: { max_locations: 5, max_members: 20 },
		features: ["staff_access", "payments"],
	};

	it("la suscripción lleva los límites del plan, no los suyos", () => {
		// Los límites y las features de la suscripción son los del catálogo: el
		// panel lee una fila y tiene que poder pintar los mismos números que
		// pinta cuando lee el plan suelto. Dos dialectos serían dos verdades.
		expect(BusinessSubscriptionSchema.safeParse(subscription).success).toBe(
			true,
		);
	});

	it("`since` puede ser `null`: un negocio sin fila sigue siendo `free`", () => {
		expect(
			BusinessSubscriptionSchema.safeParse({
				...subscription,
				since: null,
			}).success,
		).toBe(true);
	});

	it("el negocio es un uuid y el plan es del catálogo", () => {
		expect(
			BusinessSubscriptionSchema.safeParse({
				...subscription,
				business_id: "no-so-uuid",
			}).success,
		).toBe(false);
		expect(
			BusinessSubscriptionSchema.safeParse({
				...subscription,
				plan_code: "premium",
			}).success,
		).toBe(false);
	});

	it("no acepta claves de más", () => {
		expect(
			BusinessSubscriptionSchema.safeParse({
				...subscription,
				cancelled_at: "2026-10-21T00:00:00+00:00",
			}).success,
		).toBe(false);
	});
});

describe("UpdateBusinessSubscriptionSchema", () => {
	it("cambiar de plan es mandar un plan", () => {
		expect(
			UpdateBusinessSubscriptionSchema.safeParse({ plan_code: "pro" }).success,
		).toBe(true);
	});

	it("rechaza un plan que no existe: `premium` no está en el catálogo", () => {
		expect(
			UpdateBusinessSubscriptionSchema.safeParse({ plan_code: "premium" })
				.success,
		).toBe(false);
	});

	it("no acepta los topes: los topes son del catálogo, no de la petición", () => {
		// Si el cliente pudiera mandar los topes, podría cambiarse a sí mismo el
		// número que el motor aplica, y el panel dejaría de ser la verdad.
		expect(
			UpdateBusinessSubscriptionSchema.safeParse({
				plan_code: "pro_plus",
				limits: { max_locations: null, max_members: null },
			}).success,
		).toBe(false);
	});
});
