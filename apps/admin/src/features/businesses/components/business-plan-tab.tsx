import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBusinessDate } from "@/lib/dates";
import {
	businessFeatureLabel,
	businessPlanAudienceLabel,
	businessPlanLabel,
	businessPlanLimitLabel,
} from "@/lib/labels";
import { useBusinessStaff } from "../queries/business-staff.queries";
import {
	useBusinessPlans,
	useBusinessSubscription,
} from "../queries/business-subscription.queries";
import { useBusinessActiveLocationsCount } from "../queries/businesses.queries";
import { BusinessPlanChangeDialog } from "./business-plan-change-dialog";

/**
 * El plan del negocio, en la ficha: QUÉ plan tiene y QUÉ incluye.
 *
 * ─── POR QUÉ EL PANEL ASIGNA Y NO APLICA ─────────────────────────────────────
 *
 * Porque el plan bloquea CRECER, nunca OPERAR (§5.4): un negocio con tres
 * sucursales y un plan `free` sigue funcionando, no pierde nada de lo que ya
 * tiene y simplemente no puede crecer hasta que vuelva a estar por debajo del
 * tope. Por eso esta pestaña sólo ASIGNA un plan, y por eso el conteo de lo
 * que el negocio usa es TEXTO: el admin no expulsa a nadie y no le cambia el
 * acceso a nadie.
 *
 * ─── POR QUÉ LOS NÚMEROS SON LOS DEL CATÁLOGO ────────────────────────────────
 *
 * Porque la respuesta de la API trae los límites y las features DEL CATÁLOGO,
 * no los de la fila: el panel pinta el mismo número que el motor aplica. Si el
 * panel tradujera una forma en otra, habría dos verdades —la que se ve y la
 * que se corta—.
 *
 * ─── Y POR QUÉ EL `since` NO SE INVENTA ───────────────────────────────────────
 *
 * Porque `null` es «todavía no hay suscripción»: el negocio se lee `free` por
 * el `coalesce` de la base y la fecha no existe porque la suscripción no
 * existe. Ponerle una fecha sería inventar un dato que nadie midió.
 *
 * ─── Y POR QUÉ EL BLOQUE DICE «SUSCRIPCIÓN DESDE» ─────────────────────────────
 *
 * Porque la fecha que se muestra es la de la SUSCRIPCIÓN —la fila de
 * `subscriptions`— y no la del plan que el negocio tiene HOY: cambiar de plan
 * no reinicia la suscripción (`started_at` no se mueve), así que un negocio que
 * llevaba el `pro` desde junio y pasó al `pro_plus` en octubre tiene la
 * suscripción de junio y el plan de octubre.
 *
 * Un rótulo que dijera sólo «Desde cuándo» leía como la fecha del plan
 * actual, y eso es MENTIRA: el rótulo dice lo que mide, que es la suscripción.
 */
export function BusinessPlanTab({ businessId }: { businessId: string | null }) {
	const subscription = useBusinessSubscription(businessId);
	// El catálogo se pide gateado por la MISMA bandera que el resto de la
	// pestaña: si el operador no está mirando el plan, no se pide.
	const plans = useBusinessPlans(Boolean(businessId));
	const locationsCount = useBusinessActiveLocationsCount(businessId);
	const staff = useBusinessStaff(businessId);
	// El diálogo se abre PARA un negocio. La pestaña sigue montada cuando se
	// deja de mirarla (los paneles inactivos no se desmontan), así que el
	// estado se ajusta al cambiar el negocio: sin este reset, volver a entrar
	// encontraría el diálogo abierto y sin plan elegido.
	const [changeOpenFor, setChangeOpenFor] = useState<string | null>(null);
	const [lastBusinessId, setLastBusinessId] = useState(businessId);
	if (businessId !== lastBusinessId) {
		setLastBusinessId(businessId);
		setChangeOpenFor(null);
	}
	const changeOpen = changeOpenFor !== null && changeOpenFor === businessId;

	// Sin negocio no hay nada que supervisar: la consulta ni siquiera se
	// dispara (`enabled: false`) y la pantalla no muestra un estado de carga
	// eterno.
	if (!businessId) return null;

	if (subscription.isPending) {
		return (
			<div className="space-y-2">
				{[1, 2, 3].map((n) => (
					<Skeleton key={n} className="h-10 w-full" />
				))}
			</div>
		);
	}

	// Si la lectura falla, se dice POR QUÉ y no se inventa un plan: un «Gratis»
	// pintado por un error de red se lee como «este negocio no tiene plan».
	if (subscription.isError) {
		return (
			<p className="text-destructive text-sm">
				{subscription.error instanceof Error
					? subscription.error.message
					: "No se pudo cargar el plan del negocio"}
			</p>
		);
	}

	const current = subscription.data;

	// Las sucursales que CUENTAN son las activas: es lo que cuenta el motor
	// (§5.3), y una sucursal dada de baja no consume cupo.
	//
	// El conteo sale del TOTAL que devuelve la API —la misma pregunta que
	// hace el motor, `business_locations … is_active`—, y no del largo de una
	// lista: la lista se pide con el máximo del contrato (100) y un negocio
	// con más de cien sucursales contaría las que se le ven.
	//
	// `null` cuando la lectura FALLÓ: un «0» pintado por un error de red
	// afirma que el negocio no usa nada, y este bloque existe justo para
	// dizer si está por encima del tope. Un conteo que no se pudo leer se
	// dice que no se pudo leer.
	const locationsUsed = locationsCount.isError
		? null
		: (locationsCount.data?.meta.total ?? null);
	// El dueño NO consume cupo: el motor excluye al `owner` del conteo, y el
	// conteo del panel tiene que contar lo mismo que el motor.
	const membersUsed = staff.isError
		? null
		: (staff.data ?? []).filter((member) => member.role !== "owner").length;

	const cataloguePlan = plans.data?.find(
		(plan) => plan.code === current.plan_code,
	);

	return (
		<div className="space-y-4">
			<section className="space-y-2" aria-label="Plan actual">
				<h3 className="font-medium text-sm">Plan actual</h3>
				<div className="flex items-center gap-2">
					<Badge>{businessPlanLabel(current.plan_code)}</Badge>
					{cataloguePlan ? (
						<span className="text-muted-foreground text-sm">
							Audiencia: {businessPlanAudienceLabel(cataloguePlan.audience)}
						</span>
					) : null}
				</div>
			</section>

			<section className="space-y-2" aria-label="Suscripción desde">
				<h3 className="font-medium text-sm">Suscripción desde</h3>
				<p className="text-sm">
					{current.since
						? formatBusinessDate(current.since)
						: "sin suscripción registrada"}
				</p>
			</section>

			<section className="space-y-2" aria-label="Qué incluye">
				<h3 className="font-medium text-sm">Qué incluye</h3>
				<LimitRow
					label="Sucursales"
					value={businessPlanLimitLabel(current.limits.max_locations)}
				/>
				<LimitRow
					label="Miembros"
					value={businessPlanLimitLabel(current.limits.max_members)}
				/>
				<ul className="flex flex-wrap gap-2">
					{current.features.map((feature) => (
						<li key={feature}>
							<Badge variant="secondary">{businessFeatureLabel(feature)}</Badge>
						</li>
					))}
				</ul>
			</section>

			{/*
			  El uso contra el tope es TEXTO: le dice al operador que el negocio
			  ya está por encima del tope de su plan —y que eso NO le va a pasar
			  nada— sin ofrecerle ninguna acción sobre las personas del equipo.
			*/}
			<section className="space-y-2" aria-label="Uso actual">
				<h3 className="font-medium text-sm">Uso actual</h3>
				<UsageRow
					label="Sucursales"
					used={locationsUsed}
					cap={current.limits.max_locations}
					isPending={locationsCount.isPending}
				/>
				<UsageRow
					label="Miembros"
					used={membersUsed}
					cap={current.limits.max_members}
					isPending={staff.isPending}
				/>
				{locationsCount.isError || staff.isError ? (
					<p className="text-destructive text-sm">
						No se pudo leer el uso del negocio: los conteos de arriba no están
						disponibles.
					</p>
				) : null}
			</section>

			{/*
			  El botón aparece cuando el catálogo llegó: sin los planes en oferta
			  no hay nada que ofrecer, y un botón que abre un diálogo vacío es
			  una puerta que no lleva a ninguna parte.
			*/}
			{plans.isPending ? (
				<Skeleton className="h-9 w-40" />
			) : plans.isError ? (
				<p className="text-destructive text-sm">
					No se pudo cargar el catálogo de planes: no se puede asignar uno.
				</p>
			) : (
				<Button onClick={() => setChangeOpenFor(businessId)}>
					Cambiar plan
				</Button>
			)}

			{/*
			  La `key` es el negocio: el diálogo guarda el plan elegido DENTRO de
			  sí, y un cierre desde el padre —el reset de arriba— no la limpia.
			  Sin la `key`, cambiar de negocio dejaría el plan del negocio
			  anterior elegido en el diálogo del nuevo.
			*/}
			<BusinessPlanChangeDialog
				key={businessId}
				businessId={businessId}
				currentPlanCode={current.plan_code}
				plans={plans.data ?? []}
				open={changeOpen}
				onOpenChange={(open) => setChangeOpenFor(open ? businessId : null)}
			/>
		</div>
	);
}

/**
 * Un tope del plan, con su rótulo al lado.
 *
 * El valor es el número pelado —«5»— o «sin tope» cuando el plan no lo tiene:
 * `null` NO es cero, y un «0» leería como un plan que no admite ni una
 * sucursal, que no es lo que dice el catálogo.
 */
function LimitRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="text-muted-foreground text-sm">{label}</span>
			<span className="text-sm font-medium">{value}</span>
		</div>
	);
}

/**
 * Lo que el negocio usa contra el tope de su plan, en una línea.
 *
 * Con tope: «2 de 5». Sin tope: «2 (sin tope)». El rótulo dice de QUÉ es el
 * conteo, así que el número no necesita de plurales para entenderse.
 *
 * El «—» es para el conteo que NO SE PUDO LEER (la lectura falló): no es un
 * cero. Un «0» ahí afirmaría que el negocio no usa nada, y este bloque
 * existe para decir si está por encima del tope.
 */
function UsageRow({
	label,
	used,
	cap,
	isPending,
}: {
	label: string;
	used: number | null;
	cap: number | null;
	isPending: boolean;
}) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="text-muted-foreground text-sm">{label}</span>
			{isPending ? (
				<Skeleton className="h-4 w-16" />
			) : used === null ? (
				<span className="text-muted-foreground text-sm">—</span>
			) : (
				<span className="text-sm">
					{cap === null ? `${used} (sin tope)` : `${used} de ${cap}`}
				</span>
			)}
		</div>
	);
}
