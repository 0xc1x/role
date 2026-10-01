import { BUG_TRIAGE_STATES, type BugTriageState } from "@0xc1x/role-commons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerBody,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { SetTriageStateDialog } from "@/features/bug-reports/components/set-triage-state-dialog";
import {
	useBugReport,
	useSetBugReportState,
} from "@/features/bug-reports/queries/bug-reports.queries";
import { TriageBadge } from "@/features/bug-reports/tables/cells/triage-badge";
import { formatApiError } from "@/lib/api/notify";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/dates";
import { bugTriageStateLabel, entryOriginLabel } from "@/lib/labels";

function DetailField({
	label,
	value,
}: {
	label: string;
	value?: string | null;
}) {
	return (
		<div className="space-y-1">
			<p className="font-medium text-muted-foreground text-xs">{label}</p>
			{value ? (
				<p className="text-sm break-words whitespace-pre-line">{value}</p>
			) : (
				<p className="text-muted-foreground text-sm">— sin informar —</p>
			)}
		</div>
	);
}

/**
 * Cuerpo de la ficha: el texto íntegro del reporte, sus capturas y quién lo
 * mandó.
 *
 * Su propio componente porque tiene identidad propia (la ficha) y porque
 * concentra el anidado: los `data.x ? … : null` de cada campo y el bloque de
 * "no legible" vivían dentro del `return` del drawer, junto con el estado de
 * carga y el pie con las acciones de triaje. Separados, cada uno se lee solo.
 */
function BugReportBody({
	data,
}: {
	data: NonNullable<ReturnType<typeof useBugReport>["data"]>;
}) {
	return (
		<>
			{data.readable ? null : (
				<p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm">
					El contenido de este reporte tiene un formato que el panel no puede
					leer. Se puede triar, pero no hay nada que mostrar.
				</p>
			)}

			<section className="space-y-3" aria-label="Estado">
				<div className="flex flex-wrap items-center gap-2">
					<TriageBadge state={data.state} />
					{data.origin ? (
						<span className="text-muted-foreground text-sm">
							Llegó por {entryOriginLabel(data.origin)}
						</span>
					) : null}
					<span className="text-muted-foreground text-sm">
						Recibido el {formatBusinessDate(data.created_at)}
					</span>
				</div>
			</section>

			<section className="space-y-3" aria-label="Reporte">
				<h3 className="font-medium text-sm">Reporte</h3>
				<DetailField label="Resumen" value={data.summary} />
				<DetailField label="Descripción" value={data.description} />
			</section>

			{/* Lo que sale acá son URLs FIRMADAS que caducan a los cinco minutos: el
			    bucket de las capturas es privado y una ruta sola no descarga nada. El
			    panel las usa TAL CUAL — no reconstruye la ruta ni adivina el bucket—,
			    y si una venció el `<img>` no carga mientras el texto de al lado sigue
			    siendo el reporte. Por eso las capturas no bloquean el render:
			    `image_urls` puede llegar VACÍO porque la captura ya no existe, y un
			    reporte sin imagen tiene que llegar igual. */}
			<section className="space-y-3" aria-label="Capturas">
				<h3 className="font-medium text-sm">Capturas</h3>
				{data.image_urls.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						El reporte no trae capturas.
					</p>
				) : (
					<ul className="flex flex-wrap gap-2">
						{data.image_urls.map((url, i) => (
							<li key={url}>
								<a href={url} target="_blank" rel="noreferrer">
									<img
										src={url}
										alt={`Captura ${i + 1}`}
										className="h-28 w-auto rounded-md border object-cover"
									/>
								</a>
							</li>
						))}
					</ul>
				)}
			</section>

			{/* El `reporter_id` está acá y no en el listado, por decisión del diseño
			    (§8): es PII y el listado es la superficie que se amplía de un vistazo
			    en un monitor de soporte. El detalle es donde el operador investiga UNA
			    fila, y es donde el uid le sirve. */}
			<section className="space-y-3" aria-label="Registro">
				<h3 className="font-medium text-sm">Registro</h3>
				<DetailField label="Reportante" value={data.reporter_id} />
				{data.received_at ? (
					<DetailField
						label="Registrado"
						value={formatBusinessDateTime(data.received_at)}
					/>
				) : null}
				<DetailField label="ID" value={data.id} />
			</section>
		</>
	);
}

/**
 * Los cinco estados de triaje, en el pie del drawer.
 *
 * UN botón por estado y no un `Select`: un selector obliga a dos clics y a leer
 * la etiqueta que uno ya conoce de memoria para confirmar que escribió el estado
 * correcto. Acá se ven los cinco a la vez, que es lo que hace falta para decidir.
 *
 * Del contrato y no de una lista local: `BUG_TRIAGE_STATES` es el vocabulario
 * SSOT, y un estado nuevo aparece con su botón sin tocar este archivo.
 *
 * El estado YA APLICADO se anuncia arriba y su botón queda deshabilitado. Un
 * "Abierto" pulsable sobre una fila ya abierta fingiría que hay un cambio
 * pendiente, y el operador no tiene forma de distinguir un clic inerte de uno
 * que sí guardó. Los cinco se deshabilitan mientras no haya dato cargado: sin
 * `id` no hay a qué escribírselo, y un botón habilitado que no hace nada es peor
 * que uno que visibly no está.
 */
function TriageActions({
	state,
	isPending,
	onPick,
}: {
	state: BugTriageState | null | undefined;
	isPending: boolean;
	onPick: (state: BugTriageState) => void;
}) {
	return (
		<div className="space-y-2">
			<p className="text-muted-foreground text-xs">
				{state ? `Ya está en ${bugTriageStateLabel(state)}` : "Sin triar"}
			</p>
			<div className="grid grid-cols-2 gap-2">
				{BUG_TRIAGE_STATES.map((s) => (
					<Button
						key={s}
						variant={s === state ? "secondary" : "outline"}
						size="sm"
						disabled={state === undefined || s === state || isPending}
						onClick={() => onPick(s)}
					>
						{bugTriageStateLabel(s)}
					</Button>
				))}
			</div>
		</div>
	);
}

/**
 * Ficha del reporte de error: el texto íntegro, las capturas y el triaje.
 *
 * LO QUE NO APARECE, y es deliberado: el estado de entrega. `delivery_status` lo
 * mueve el camino público de `POST /contact` cuando se entrega el correo de
 * aviso, y un reporte de errores no tiene ese camino (D8): nadie lo mueve
 * después del insert. Mostrarlo acá daría un "Entrega pendiente" permanente que
 * el operador leería como una tarea que tiene pendiente y que no existe.
 */
export function BugReportDrawer({
	id,
	isOpen,
	onClose,
}: {
	id: string | null;
	isOpen: boolean;
	onClose: () => void;
}) {
	const { data, isLoading, isError, error } = useBugReport(id);
	const setState = useSetBugReportState();
	const [porConfirmar, setPorConfirmar] = useState<BugTriageState | null>(null);

	/**
	 * Los dos estados que se pierden de vista piden confirmación antes de
	 * escribir. No por ceremonial: un estado que saca el reporte de la cola sin
	 * aviso es un cambio con consecuencia, y una confirmación que no dice QUÉ pasa
	 * es ruido. Los otros tres se aplican directo —abrir, reproducir y corregir
	 * son el trabajo de todos los días— porque poner un diálogo delante de cada
	 * triageo es lo que hace que la gente deje de leerlos.
	 */
	const triagear = (estado: BugTriageState) => {
		if (!id) return;
		if (estado === "DUPLICADO" || estado === "DESCARTADO") {
			setPorConfirmar(estado);
			return;
		}
		setState.mutate({ id, state: estado });
	};

	const confirmar = () => {
		if (!id || !porConfirmar) return;
		// El error lo avienta la propia mutación con su `requestId`
		// (`onError: notifyMutationError`); el diálogo solo se cierra cuando el
		// PATCH terminó bien, para que un fallo deje la confirmación a la vista con
		// el motivo ya encima.
		setState
			.mutateAsync({ id, state: porConfirmar })
			.then(() => setPorConfirmar(null))
			.catch(() => undefined);
	};

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			swipeDirection="right"
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Reporte de error</DrawerTitle>
					<DrawerDescription>
						Lo que una persona reportó desde la app
					</DrawerDescription>
				</DrawerHeader>

				<DrawerBody>
					{isLoading ? (
						<div className="flex items-center gap-2 text-muted-foreground text-sm">
							<Spinner /> Cargando reporte
						</div>
					) : isError ? (
						// Con `requestId`: sin él, soporte no puede correlacionar el
						// fallo con la petición en los logs del servidor.
						<p className="text-destructive text-sm">
							{formatApiError(error, "No se pudo cargar el reporte")}
						</p>
					) : data ? (
						<BugReportBody data={data} />
					) : null}
				</DrawerBody>

				<DrawerFooter>
					{setState.isPending ? (
						<p className="flex items-center gap-2 text-muted-foreground text-sm">
							<Spinner /> Guardando el triaje
						</p>
					) : null}
					<TriageActions
						state={data?.state}
						isPending={setState.isPending}
						onPick={triagear}
					/>
					<DrawerClose render={<Button variant="outline" className="w-full" />}>
						Cerrar
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>

			<SetTriageStateDialog
				open={porConfirmar !== null}
				onOpenChange={(open) => {
					if (!open) setPorConfirmar(null);
				}}
				isPending={setState.isPending}
				state={porConfirmar ?? "DESCARTADO"}
				resumen={data?.summary ?? null}
				onConfirm={confirmar}
			/>
		</Drawer>
	);
}
