import type {
	BusinessPlanCode,
	SubscriptionPlanDto,
} from "@0xc1x/role-commons";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { notifyMutationError } from "@/lib/api/notify";
import {
	businessFeatureLabel,
	businessPlanLabel,
	businessPlanLimitLabel,
} from "@/lib/labels";
import { useUpdateBusinessSubscription } from "../queries/business-subscription.queries";

/**
 * La asignación manual del plan, desde el panel de la plataforma.
 *
 * ─── POR QUÉ EL DIÁLOGO DICE LO QUE NO PASA ───────────────────────────────────
 *
 * Porque bajar de plan NO castiga al negocio (§5.4): no se le corta nada de lo
 * que ya tiene —ni sucursales, ni equipo, ni pedidos— y sigue operando igual.
 * Lo único que se detiene es el CRECIMIENTO: no podrá añadir sucursales ni
 * miembros hasta que vuelva a estar por debajo del tope de su plan. Es la
 * consecuencia que el operador tiene que saber ANTES de confirmar, porque es
 * la diferencia entre «le quité algo» y «le cerré una puerta».
 *
 * ─── POR QUÉ NO HAY PRECIO NI RENOVACIÓN ─────────────────────────────────────
 *
 * Porque no hay ninguno: el plan se asigna a mano, sin pasarela y sin cobro
 * automático. Un texto que prometiera un precio o una renovación sería una
 * promesa que el panel no puede cumplir.
 *
 * ─── POR QUÉ EL PLAN SE ELIGE Y NO SE CONFIRMA A CIEGAS ───────────────────────
 *
 * Porque el cuerpo del PATCH lleva SÓLO el código del plan —los límites y las
 * features salen del catálogo—, así que el operador tiene que ver los topes de
 * lo que está asignando antes de decidir. Por eso el diálogo muestra el
 * catálogo completo con sus límites a la vista.
 *
 * ─── Y POR QUÉ EL FALLO NO CIERRA EL DIÁLOGO ──────────────────────────────────
 *
 * Porque la asignación no se aplicó, así que la pantalla tiene que seguir
 * pidiendo la decisión. El aviso es el de `notifyMutationError`, que lleva el
 * `requestId`: sin ese identificador el operador no puede cruzar el fallo con
 * el log del servidor.
 */
export function BusinessPlanChangeDialog({
	businessId,
	currentPlanCode,
	plans,
	open,
	onOpenChange,
}: {
	businessId: string;
	currentPlanCode: BusinessPlanCode;
	plans: SubscriptionPlanDto[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const update = useUpdateBusinessSubscription(businessId);
	const [selected, setSelected] = useState<BusinessPlanCode | null>(null);
	// Una asignación en vuelo no se repite: el botón se deshabilita, y esta
	// guarda es la segunda barrera para el clic que llega antes de que React
	// repinte.
	const inFlight = useRef(false);

	const close = () => {
		setSelected(null);
		onOpenChange(false);
	};

	const confirm = async () => {
		if (!selected || inFlight.current) return;
		inFlight.current = true;
		try {
			await update.mutateAsync({ plan_code: selected });
			toast.success(`Plan cambiado a ${businessPlanLabel(selected)}.`);
			close();
		} catch (error) {
			notifyMutationError(error);
		} finally {
			inFlight.current = false;
		}
	};

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => (next ? onOpenChange(true) : close())}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>¿Cambiar el plan?</AlertDialogTitle>
					<AlertDialogDescription>
						El plan lo asigna la plataforma, a mano. Bajar de plan{" "}
						<span className="font-medium text-foreground">no se corta</span>{" "}
						nada: el negocio sigue operando con lo que ya tiene y lo único que
						se detiene es{" "}
						<span className="font-medium text-foreground">crecer</span> —no
						podrá añadir sucursales ni miembros hasta que vuelva a estar por
						debajo del tope de su plan.
					</AlertDialogDescription>
				</AlertDialogHeader>

				{plans.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No hay planes en el catálogo: no se puede asignar ninguno.
					</p>
				) : (
					<div
						role="radiogroup"
						aria-label="Planes del catálogo"
						className="space-y-2"
					>
						{plans.map((plan) => (
							<label
								key={plan.code}
								className="flex items-start gap-3 rounded-lg border p-3"
							>
								<input
									type="radio"
									name="business-plan"
									value={plan.code}
									aria-label={businessPlanLabel(plan.code)}
									checked={selected === plan.code}
									onChange={() => setSelected(plan.code)}
									className="mt-1 size-4"
								/>
								<span className="space-y-1">
									<span className="flex items-center gap-2">
										<span className="text-sm font-medium">
											{businessPlanLabel(plan.code)}
										</span>
										{plan.code === currentPlanCode ? (
											<Badge variant="secondary">actual</Badge>
										) : null}
									</span>
									<span className="block text-muted-foreground text-xs">
										{limitPhrase(
											plan.limits.max_locations,
											"sucursal",
											"sucursales",
										)}{" "}
										·{" "}
										{limitPhrase(
											plan.limits.max_members,
											"miembro",
											"miembros",
										)}
									</span>
									<span className="block text-muted-foreground text-xs">
										{plan.features.length > 0
											? plan.features
													.map((feature) => businessFeatureLabel(feature))
													.join(" · ")
											: "Sin features incluidas"}
									</span>
								</span>
							</label>
						))}
					</div>
				)}

				<AlertDialogFooter>
					<AlertDialogCancel disabled={update.isPending}>
						Cancelar
					</AlertDialogCancel>
					<AlertDialogAction
						disabled={!selected || update.isPending}
						onClick={confirm}
					>
						{/*
						  El spinner va `aria-hidden`: el `Spinner` es un `role="status"`
						  con nombre «Loading», y dentro del botón se sumaría al nombre
						  accesible («Loading Cambiar a Pro») y el botón cambiaría de
						  nombre a mitad del vuelo. El estado de la asignación ya lo
						  dice el botón deshabilitado.
						*/}
						{update.isPending ? <Spinner aria-hidden="true" /> : null}{" "}
						{selected
							? `Cambiar a ${businessPlanLabel(selected)}`
							: "Cambiar el plan"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/**
 * El tope de un plan, en la frase que lo acompaña.
 *
 * `null` es «sin tope» y NO es cero: `pro_plus` no tiene tope, y un «0» leería
 * como un plan que no admite ni una sucursal. Y el plural va con el número:
 * «1 sucursal» no es «1 sucursales».
 */
function limitPhrase(
	cap: number | null,
	singular: string,
	plural: string,
): string {
	if (cap === null) return `Sin tope de ${plural}`;
	return `${businessPlanLimitLabel(cap)} ${cap === 1 ? singular : plural}`;
}
