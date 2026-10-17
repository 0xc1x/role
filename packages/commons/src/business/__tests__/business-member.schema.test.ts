import { describe, expect, it } from "bun:test";
import {
	BusinessMemberAliasSchema,
	BusinessMemberRoleSchema,
	BusinessMemberSchema,
	BusinessMemberSessionTtlHoursSchema,
	BusinessMemberStatusSchema,
	businessMemberAliasWarnings,
	BusinessMemberDeliveryCardSchema,
	CreateBusinessMemberSchema,
	isRoleEcAlias,
	RotateBusinessMemberPinSchema,
	UpdateBusinessMemberAliasResponseSchema,
	UpdateBusinessMemberAliasSchema,
	UpdateBusinessMemberSchema,
} from "../schemas/business-member.schema";

const LOC_A = "e3000000-0000-4000-8000-000000000001";

describe("los vocabularios de la membresía", () => {
	it("acepta los tres roles y rechaza lo que no es uno", () => {
		for (const role of ["owner", "manager", "staff"]) {
			expect(BusinessMemberRoleSchema.safeParse(role).success).toBe(true);
		}
		expect(BusinessMemberRoleSchema.safeParse("admin").success).toBe(false);
		expect(BusinessMemberRoleSchema.safeParse("Owner").success).toBe(false);
	});

	it("distingue pausa de baja: `disabled` es una pausa y nada más", () => {
		for (const status of ["active", "disabled"]) {
			expect(BusinessMemberStatusSchema.safeParse(status).success).toBe(true);
		}
		// Ni `deleted` — el borrado es `deleted_at`, otra columna — ni `paused`,
		// que es la palabra que usaría un lector y no una que exista.
		expect(BusinessMemberStatusSchema.safeParse("deleted").success).toBe(false);
		expect(BusinessMemberStatusSchema.safeParse("paused").success).toBe(false);
	});
});

describe("BusinessMemberSessionTtlHoursSchema", () => {
	it("el 0 es «no expira», y por eso se acepta", () => {
		// La afirmación que el modo «equipo propio» del §9.2 necesita poder
		// escribir: un schema que exigiera positivo vuelve ese modo
		// inexpresable, y el dueño se queda sin la opción que le vendimos.
		expect(BusinessMemberSessionTtlHoursSchema.safeParse(0).success).toBe(true);
	});

	it("rechaza lo que la columna no puede guardar", () => {
		expect(BusinessMemberSessionTtlHoursSchema.safeParse(-1).success).toBe(
			false,
		);
		expect(BusinessMemberSessionTtlHoursSchema.safeParse(1.5).success).toBe(
			false,
		);
		// El `integer` de Postgres es int4: sin esta cota el contrato acepta 2^31 y
		// la columna no, y el 500 aparece en la base donde el 400 debía estar.
		expect(
			BusinessMemberSessionTtlHoursSchema.safeParse(2147483648).success,
		).toBe(false);
		expect(BusinessMemberSessionTtlHoursSchema.safeParse(24).success).toBe(
			true,
		);
	});
});

describe("BusinessMemberAliasSchema", () => {
	it("acepta el alias por defecto de Rolé", () => {
		expect(
			BusinessMemberAliasSchema.safeParse("centro@panaderia-familia.role.ec")
				.success,
		).toBe(true);
	});

	it("acepta un dominio ajeno: el §9.4 lo declara legítimo", () => {
		// Un dominio del negocio es lo que el empleado ya tiene en la cabeza, y
		// además es un buzón real. Que el schema lo acepte no es una Gentileza:
		// es lo que impide que la UI tenga que saltarse la validación para poder
		// hacer lo que el dueño le pidió.
		expect(
			BusinessMemberAliasSchema.safeParse("caja.centro@panaderialafamilia.ec")
				.success,
		).toBe(true);
		expect(BusinessMemberAliasSchema.safeParse("caja@acme.com").success).toBe(
			true,
		);
	});

	it("rechaza lo que ni siquiera es un correo", () => {
		expect(BusinessMemberAliasSchema.safeParse("sin-dominio").success).toBe(
			false,
		);
		expect(BusinessMemberAliasSchema.safeParse("a@b").success).toBe(false);
		expect(BusinessMemberAliasSchema.safeParse("a b@c.d").success).toBe(false);
	});
});

describe("isRoleEcAlias", () => {
	it("reconoce el sufijo `.role.ec` y sólo ese", () => {
		expect(isRoleEcAlias("centro@panaderia-familia.role.ec")).toBe(true);
		// El dominio no distingue mayúsculas, así que la comparación no puede.
		expect(isRoleEcAlias("centro@Panaderia-Familia.ROLE.EC")).toBe(true);
		// `role` es un subdominio de `role.ec`, no un hermano: sin el punto NO
		// cuenta, que es la lectura literal de la regla del §3.1.
		expect(isRoleEcAlias("centro@role.ec")).toBe(false);
		expect(isRoleEcAlias("centro@panaderialafamilia.ec")).toBe(false);
		expect(isRoleEcAlias("centro@role.ec.example.com")).toBe(false);
		expect(isRoleEcAlias("sin-dominio")).toBe(false);
	});
});

describe("businessMemberAliasWarnings", () => {
	it("no avisa sobre un alias de Rolé", () => {
		expect(businessMemberAliasWarnings("centro@panaderia.role.ec")).toEqual([]);
	});

	it("avisa —no rechaza— sobre un dominio que puede recibir correo de verdad", () => {
		// El aviso y el almacenamiento no pueden separarse: la respuesta dice
		// «esto recibe correo» si y sólo si el alias guardado dice lo contrario.
		expect(
			businessMemberAliasWarnings("caja.centro@panaderialafamilia.ec"),
		).toEqual(["alias_domain_can_receive_mail"]);
		expect(businessMemberAliasWarnings("caja@acme.com")).toEqual([
			"alias_domain_can_receive_mail",
		]);
	});
});

describe("CreateBusinessMemberSchema", () => {
	it("acepta el alta mínima: nombre, alcance, y que el rol y el alias los ponga el sistema", () => {
		const parsed = CreateBusinessMemberSchema.safeParse({
			label: "Cajero de turno",
			business_location_ids: [LOC_A],
		});
		expect(parsed.success).toBe(true);
		// El alias propuesto es `{código}@{slug}.role.ec` y el rol por defecto es el
		// `default 'staff'` de la columna: los dos los decide la base, no el schema.
		expect(parsed.success && parsed.data.alias).toBeUndefined();
		expect(parsed.success && parsed.data.role).toBeUndefined();
	});

	it("acepta un dominio propio y una política de sesión por turnos", () => {
		expect(
			CreateBusinessMemberSchema.safeParse({
				label: "Caja",
				alias: "caja.centro@panaderialafamilia.ec",
				role: "manager",
				session_ttl_hours: 24,
				business_location_ids: [LOC_A],
			}).success,
		).toBe(true);
	});

	it("exige el alcance, aunque sea vacío", () => {
		// Sin alcance es un acceso que no puede ver nada, y eso es una decisión
		// del dueño en el formulario, no un default del servidor.
		expect(
			CreateBusinessMemberSchema.safeParse({ label: "Sin sucursales" }).success,
		).toBe(false);
		expect(
			CreateBusinessMemberSchema.safeParse({
				label: "Sin sucursales",
				business_location_ids: [],
			}).success,
		).toBe(true);
	});

	it("rechaza un body que quiera escribirse el negocio o el estado", () => {
		expect(
			CreateBusinessMemberSchema.safeParse({
				label: "Puerta de atrás",
				business_location_ids: [],
				business_id: "e2000000-0000-4000-8000-000000000001",
			}).success,
		).toBe(false);
		// Nadie nace pausado, y un 200 que finge haberlo hecho es peor que un 400.
		expect(
			CreateBusinessMemberSchema.safeParse({
				label: "Nacido pausado",
				business_location_ids: [],
				status: "disabled",
			}).success,
		).toBe(false);
	});
});

describe("UpdateBusinessMemberSchema", () => {
	it("edita rol, alcance y política de sesión, sin exigir nada", () => {
		const parsed = UpdateBusinessMemberSchema.safeParse({ role: "manager" });
		expect(parsed.success).toBe(true);
		expect(parsed.success && Object.keys(parsed.data)).toEqual(["role"]);
		expect(
			UpdateBusinessMemberSchema.safeParse({
				business_location_ids: [LOC_A],
				session_ttl_hours: 0,
			}).success,
		).toBe(true);
	});

	it("rechaza `status` y `alias`: no son de esta ruta", () => {
		// Desactivar es `POST …/disable` con su ban, y cambiar el alias cambia
		// `auth.users.email` y trae el aviso del §9.4. Que no sean campos no impide
		// las operaciones: impide que un PATCH las haga de rebote.
		expect(
			UpdateBusinessMemberSchema.safeParse({ status: "disabled" }).success,
		).toBe(false);
		expect(
			UpdateBusinessMemberSchema.safeParse({ alias: "caja@acme.com" }).success,
		).toBe(false);
	});
});

describe("RotateBusinessMemberPinSchema", () => {
	it("no acepta nada, y sobre todo no un PIN", () => {
		// El PIN lo genera el servidor y se entrega una vez. Un body con `pin`
		// sería una puerta de atrás para que lo elija el cliente, y sin `strict`
		// zod lo descartaría en silencio.
		expect(RotateBusinessMemberPinSchema.safeParse({}).success).toBe(true);
		expect(
			RotateBusinessMemberPinSchema.safeParse({ pin: "123456" }).success,
		).toBe(false);
	});
});

describe("la tarjeta de entrega y el aviso del alias", () => {
	it("lleva alias, PIN y avisos", () => {
		expect(
			BusinessMemberDeliveryCardSchema.safeParse({
				alias: "centro@panaderia-familia.role.ec",
				pin: "418902",
				alias_warnings: [],
			}).success,
		).toBe(true);
		expect(
			BusinessMemberDeliveryCardSchema.safeParse({
				alias: "caja@acme.com",
				pin: "418902",
				alias_warnings: ["alias_domain_can_receive_mail"],
			}).success,
		).toBe(true);
	});

	it("un PIN de otra longitud no es una tarjeta de entrega", () => {
		expect(
			BusinessMemberDeliveryCardSchema.safeParse({
				alias: "centro@panaderia-familia.role.ec",
				pin: "1234",
				alias_warnings: [],
			}).success,
		).toBe(false);
	});

	it("la lista de avisos es obligatoria: vacía es una decisión", () => {
		expect(
			BusinessMemberDeliveryCardSchema.safeParse({
				alias: "centro@panaderia-familia.role.ec",
				pin: "418902",
			}).success,
		).toBe(false);
	});
});

describe("la respuesta del cambio de alias", () => {
	const member = {
		id: "e4000000-0000-4000-8000-000000000001",
		business_id: "e2000000-0000-4000-8000-000000000001",
		user_id: "e1000000-0000-4000-8000-000000000001",
		role: "staff",
		label: "Caja",
		alias: "caja@acme.com",
		status: "active",
		session_ttl_hours: 24,
		business_location_ids: [LOC_A],
		last_authenticated_at: null,
		created_at: "2026-10-16T00:00:00+00:00",
		updated_at: "2026-10-16T00:00:00+00:00",
		deleted_at: null,
	};

	it("devuelve la membresía nueva y el aviso del §9.4", () => {
		const parsed = UpdateBusinessMemberAliasResponseSchema.safeParse({
			member,
			alias_warnings: businessMemberAliasWarnings(member.alias),
		});
		expect(parsed.success).toBe(true);
		expect(parsed.success && parsed.data.alias_warnings).toEqual([
			"alias_domain_can_receive_mail",
		]);
	});

	it("el input es sólo el alias", () => {
		expect(
			UpdateBusinessMemberAliasSchema.safeParse({ alias: "caja@acme.com" })
				.success,
		).toBe(true);
		expect(
			UpdateBusinessMemberAliasSchema.safeParse({
				alias: "caja@acme.com",
				label: "También el nombre",
			}).success,
		).toBe(false);
	});
});

describe("BusinessMemberSchema", () => {
	it("una fila viva con el alcance resuelto y sin sello de sesión", () => {
		expect(
			BusinessMemberSchema.safeParse({
				id: "e4000000-0000-4000-8000-000000000001",
				business_id: "e2000000-0000-4000-8000-000000000001",
				user_id: "e1000000-0000-4000-8000-000000000001",
				role: "owner",
				label: "Dueña",
				alias: "duena@panaderia-familia.role.ec",
				status: "active",
				// El §5.2 dice que el modo persistente se ofrece a dueño y gerente:
				// el 0 es una fila real, no una casilla vacía.
				session_ttl_hours: 0,
				business_location_ids: [],
				last_authenticated_at: null,
				created_at: "2026-10-16T00:00:00+00:00",
				updated_at: "2026-10-16T00:00:00+00:00",
				deleted_at: null,
			}).success,
		).toBe(true);
	});

	it("sin alcance es un dato, y el borrado lógico es un `deleted_at` con fecha", () => {
		const base = {
			id: "e4000000-0000-4000-8000-000000000001",
			business_id: "e2000000-0000-4000-8000-000000000001",
			user_id: "e1000000-0000-4000-8000-000000000001",
			role: "staff",
			label: "Caja",
			alias: "caja@acme.com",
			status: "disabled",
			session_ttl_hours: 24,
			business_location_ids: [],
			last_authenticated_at: "2026-10-16T09:00:00+00:00",
			created_at: "2026-10-16T00:00:00+00:00",
			updated_at: "2026-10-16T09:00:00+00:00",
			deleted_at: "2026-10-16T10:00:00+00:00",
		};
		expect(BusinessMemberSchema.safeParse(base).success).toBe(true);
		// El alcance no es opcional: `[]` es un `staff` sin sucursales, y
		// confundirse con «no lo sabemos» es lo que este schema evita.
		const { business_location_ids: _omitted, ...withoutScope } = base;
		expect(BusinessMemberSchema.safeParse(withoutScope).success).toBe(false);
	});
});
