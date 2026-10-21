import { describe, expect, it } from "bun:test";
import { CREATABLE_BUSINESS_MEMBER_ROLES } from "../enums/business-member-role";
import {
	BusinessMemberAliasSchema,
	BusinessMemberRoleSchema,
	BusinessMemberSchema,
	BusinessMemberSessionTtlHoursSchema,
	BusinessMemberStatusSchema,
	businessMemberAliasWarnings,
	BusinessMemberDeliveryCardSchema,
	CreateBusinessMemberSchema,
	isDeliverableAlias,
	isRoleEcAlias,
	RevokeBusinessAccessResponseSchema,
	RevokeBusinessAccessSchema,
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

	it("los roles que el alta ofrece son un subconjunto, y sin `owner`", () => {
		// El §5.4 saca la transferencia de propiedad de la v1 y ninguna de las nueve
		// rutas del §8 nombra un dueño. El formulario tiene que leer ESTA lista, no
		// el vocabulario entero: si leyera el entero, el dueño llenaría un formulario
		// para descubrir un 422.
		expect([...CREATABLE_BUSINESS_MEMBER_ROLES]).not.toContain("owner");
		for (const role of CREATABLE_BUSINESS_MEMBER_ROLES) {
			expect(BusinessMemberRoleSchema.safeParse(role).success).toBe(true);
			// Y cada rol ofertable tiene que ser aceptable por el alta: el subconjunto
			// que se ofrece tiene que estar contenido en el que la API acepta, o el
			// formulario ofrecería algo que el servicio rechaza.
			expect(
				CreateBusinessMemberSchema.safeParse({
					label: "Alta ofertable",
					role,
					business_location_ids: [],
				}).success,
				role,
			).toBe(true);
		}
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

	it("no normaliza la caja: la unicidad la resuelve la base", () => {
		// El esquema acepta las dos variantes y las guarda tal cual. El índice único
		// es sobre `lower(alias)` dentro del negocio, así que las dos chocan AL
		// guardar, con `23505 business_members_alias_key`, que es lo que el servicio
		// traduce a conflicto. Si algún día este schema normaliza, este test cambia:
		// no es un test de que la normalización esté mal, es el aviso de que pasó.
		const mixed = BusinessMemberAliasSchema.parse("Caja@Acme.com");
		expect(mixed).toBe("Caja@Acme.com");
		expect(BusinessMemberAliasSchema.safeParse("caja@acme.com").success).toBe(
			true,
		);
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

describe("isDeliverableAlias", () => {
	it("no entrega a nada de `role.ec`, y el ápice va en el mismo bando", () => {
		// Un subdominio de equipo es una dirección que generamos nosotros: no hay
		// bandeja y el correo rebota.
		expect(isDeliverableAlias("centro@panaderia-familia.role.ec")).toBe(false);
		expect(isDeliverableAlias("centro@Panaderia-Familia.ROLE.EC")).toBe(false);
		// Y EL ÁPICE TAMBIÉN, que es justo donde `isRoleEcAlias` contesta otra
		// cosa: `centro@role.ec` no es una cuenta de equipo, pero el dominio es de
		// la plataforma y `centro@role.ec` no es un buzón que nadie vaya a abrir.
		// Los dos guards de correo de la API (el §8: `change-email` y
		// `forgot-password` rechazan con 422) se apoyan en ESTA, y no en la otra:
		// usar `isRoleEcAlias` ahí deja pasar el ápice.
		expect(isDeliverableAlias("centro@role.ec")).toBe(false);
		expect(isDeliverableAlias("notificaciones@role.ec")).toBe(false);
		expect(isDeliverableAlias("negocios@role.ec")).toBe(false);
	});

	it("entrega a un dominio propio, que es el caso legítimo del §9.4", () => {
		// El dominio de un negocio es un destinatario REAL: bloquearlo sería
		// inventar una regla que el §9.4 no pide y quitarle al negocio el correo
		// que sí le funciona.
		expect(isDeliverableAlias("caja.centro@panaderialafamilia.ec")).toBe(true);
		expect(isDeliverableAlias("Caja@Acme.com")).toBe(true);
		// `role` es un subdominio de `role.ec`, no un hermano: sin el punto NO es
		// el dominio de la plataforma, y el sufijo tiene que mirarlo.
		expect(isDeliverableAlias("centro@role.ec.example.com")).toBe(true);
		expect(isDeliverableAlias("centro@panaderialafamilia.ec")).toBe(true);
	});

	it("lo que no es un correo no es una dirección entregable", () => {
		expect(isDeliverableAlias("sin-dominio")).toBe(false);
		expect(isDeliverableAlias("")).toBe(false);
	});
});

describe("businessMemberAliasWarnings", () => {
	it("no avisa sobre un alias de Rolé", () => {
		expect(businessMemberAliasWarnings("centro@panaderia.role.ec")).toEqual([]);
	});

	it("avisa exactamente cuando la plataforma aceptaría esa dirección", () => {
		// La invariante que hace que las dos frases que la API manda no se
		// contradigan: el aviso afirma «esto recibe correo de verdad» y la API
		// acepta una dirección para el correo si y sólo si hay bandeja detrás.
		// Con aviso: la API no la rechaza. Sin aviso: la API la rechaza con 422.
		for (const alias of [
			"centro@panaderia.role.ec",
			"centro@role.ec",
			"caja@panaderialafamilia.ec",
			"caja@acme.com",
		]) {
			expect(businessMemberAliasWarnings(alias).length > 0).toBe(
				isDeliverableAlias(alias),
			);
		}
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

	it("las dos preguntas siguen siendo dos, y se separan donde se separan", () => {
		// `isRoleEcAlias` contesta «¿es una cuenta de equipo?» (§3.1, el sufijo) y
		// `isDeliverableAlias` contesta «¿hay una bandeja detrás?». En un subdominio
		// y en un dominio propio las dos se separan, así que una sola función
		// rompería una de las dos. Si alguien "limpia" esta duplicación, este test
		// es el que dice cuál de las dos mediadades se rompió.
		expect(isRoleEcAlias("centro@panaderia.role.ec")).toBe(true);
		expect(isDeliverableAlias("centro@panaderia.role.ec")).toBe(false);
		expect(isRoleEcAlias("caja@panaderialafamilia.ec")).toBe(false);
		expect(isDeliverableAlias("caja@panaderialafamilia.ec")).toBe(true);
	});

	it("el ápice ya NO avisa: la plataforma le cierra la puerta al correo", () => {
		// `role.ec` tiene buzones vivos, pero no tiene una bandeja para
		// `centro@role.ec`, y `forgot-password`/`change-email` rechazan TODA
		// dirección de `role.ec` con un 422. Avisar «el empleado podría activar la
		// recuperación con esta dirección» sería una mentira que la API se
		// contradice a sí misma: el dueño le creería al aviso antes que al 422.
		expect(isRoleEcAlias("centro@role.ec")).toBe(false);
		expect(isDeliverableAlias("centro@role.ec")).toBe(false);
		expect(businessMemberAliasWarnings("centro@role.ec")).toEqual([]);
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

	it("rechaza `label` tampoco: el §8 no renombra a nadie", () => {
		// La columna existe y el alta la escribe, pero ninguna de las nueve rutas la
		// vuelve editable y la lista de acciones del §9.2 tampoco. Un campo editable
		// acá sería una primera puerta por donde entra un cambio de nombre que
		// ningún cliente pidió.
		expect(
			UpdateBusinessMemberSchema.safeParse({ label: "Cajero nocturno" })
				.success,
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

	it("acepta el cuerpo AUSENTE, que no es lo mismo que `{}`", () => {
		// Un `POST /…/rotate` sin cuerpo deja `req.body` como `undefined`
		// (medido en el stack real de Nest/Express), y `strictObject({})` solo
		// falla ahí. Sin esto, la llamada más natural del panel —rotar, que no
		// tiene nada que mandar— sería un 400.
		expect(RotateBusinessMemberPinSchema.safeParse(undefined).success).toBe(
			true,
		);
	});
});

describe("RevokeBusinessAccessSchema", () => {
	it("no acepta nada, y el cuerpo puede estar AUSENTE", () => {
		// El corte de emergencia no tiene parámetros: lo que se corta es «todos los
		// accesos del negocio», y un cuerpo con algo adentro sería una puerta de
		// atrás para cortar otra cosa. Es el mismo criterio que el del rotate, con el
		// mismo `.optional()`: el `POST` sin cuerpo deja `req.body` como `undefined`.
		expect(RevokeBusinessAccessSchema.safeParse({}).success).toBe(true);
		expect(RevokeBusinessAccessSchema.safeParse(undefined).success).toBe(true);
		expect(
			RevokeBusinessAccessSchema.safeParse({ member_ids: ["e4000000"] })
				.success,
		).toBe(false);
	});
});

describe("RevokeBusinessAccessResponseSchema", () => {
	const member = {
		id: "e4000000-0000-4000-8000-000000000001",
		business_id: "e2000000-0000-4000-8000-000000000001",
		user_id: "e1000000-0000-4000-8000-000000000001",
		role: "staff",
		label: "Caja",
		alias: "caja@acme.com",
		status: "disabled",
		session_ttl_hours: 24,
		business_location_ids: [LOC_A],
		last_authenticated_at: null,
		created_at: "2026-10-16T00:00:00+00:00",
		updated_at: "2026-10-16T00:00:00+00:00",
		deleted_at: null,
	};

	it("devuelve los accesos cortados y dice si el dueño quedó afuera", () => {
		expect(
			RevokeBusinessAccessResponseSchema.safeParse({
				disabled: [member],
				owner_skipped: true,
			}).success,
		).toBe(true);
		expect(
			RevokeBusinessAccessResponseSchema.safeParse({
				disabled: [],
				owner_skipped: false,
			}).success,
		).toBe(true);
	});

	it("`owner_skipped` es OBLIGATORIO: opcional sería un silencio", () => {
		// El campo existe para que la UI pueda decir que el dueño quedó afuera. Un
		// campo opcional sería un silencio, y un silencio en un corte de emergencia
		// es una mentira: el dueño NO se corta y el panel tiene que poder decirlo.
		expect(
			RevokeBusinessAccessResponseSchema.safeParse({ disabled: [] }).success,
		).toBe(false);
	});

	it("no acepta claves de más", () => {
		expect(
			RevokeBusinessAccessResponseSchema.safeParse({
				disabled: [],
				owner_skipped: true,
				skipped: [],
			}).success,
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
