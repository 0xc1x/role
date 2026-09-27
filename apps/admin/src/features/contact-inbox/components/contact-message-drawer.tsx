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
import { MarkHandledDialog } from "@/features/contact-inbox/components/mark-handled-dialog";
import {
	useContactMessage,
	useMarkContactMessageHandled,
} from "@/features/contact-inbox/queries/contact-inbox.queries";
import { StatusBadge } from "@/features/contact-inbox/tables/contact-inbox.columns";
import { formatApiError } from "@/lib/api/notify";
import { formatBusinessDate } from "@/lib/dates";

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
 * Ficha del mensaje: el texto íntegro y la IP de origen.
 *
 * La IP aparece SOLO acá. Es dato personal y sirve para investigar abuso, pero
 * no es información de contacto: ponerla en la tabla la multiplicaría por cada
 * fila que el operador abre por otro motivo. `to` y `from` no aparecen en
 * ninguna parte — la API no los manda.
 */
export function ContactMessageDrawer({
	id,
	isOpen,
	onClose,
}: {
	id: string | null;
	isOpen: boolean;
	onClose: () => void;
}) {
	const { data, isLoading, isError, error } = useContactMessage(id);
	const marcar = useMarkContactMessageHandled();
	const [confirmando, setConfirmando] = useState(false);

	// El PATCH no lleva cuerpo: la transición de estado vive en el servidor.
	const yaAtendido = data?.status === "PROCESADO";

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			swipeDirection="right"
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Mensaje de contacto</DrawerTitle>
					<DrawerDescription>
						Lo que una persona escribió desde la landing
					</DrawerDescription>
				</DrawerHeader>

				<DrawerBody>
					{isLoading ? (
						<div className="flex items-center gap-2 text-muted-foreground text-sm">
							<Spinner /> Cargando mensaje
						</div>
					) : isError ? (
						// Con `requestId`: sin él, soporte no puede correlacionar el
						// fallo con la petición en los logs del servidor.
						<p className="text-destructive text-sm">
							{formatApiError(error, "No se pudo cargar el mensaje")}
						</p>
					) : data ? (
						<>
							{data.readable ? null : (
								<p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm">
									El contenido de este mensaje tiene un formato que el panel no
									puede leer. Se puede marcar como atendido, pero no hay nada
									que mostrar.
								</p>
							)}

							<section className="space-y-3" aria-label="Estado">
								<div className="flex items-center gap-2">
									<StatusBadge status={data.status} />
									<span className="text-muted-foreground text-sm">
										Recibido el {formatBusinessDate(data.created_at)}
									</span>
								</div>
							</section>

							<section className="space-y-3" aria-label="Datos de contacto">
								<h3 className="font-medium text-sm">Contacto</h3>
								<DetailField label="Nombre" value={data.name} />
								<DetailField label="Correo" value={data.email} />
								<DetailField label="Rol" value={data.role} />
								<DetailField label="Ciudad" value={data.city} />
								{data.city_raw === "Otra" ? (
									<DetailField
										label="Ciudad informada"
										value={data.city_other}
									/>
								) : null}
								{data.received_at ? (
									<DetailField
										label="Registrado"
										value={new Date(data.received_at).toLocaleString("es-EC")}
									/>
								) : null}
								<DetailField label="IP de origen" value={data.ip} />
							</section>

							<section className="space-y-3" aria-label="Mensaje">
								<h3 className="font-medium text-sm">Mensaje</h3>
								<DetailField label="Texto" value={data.message} />
							</section>

							<section className="space-y-3" aria-label="Registro">
								<h3 className="font-medium text-sm">Registro</h3>
								<DetailField label="ID" value={data.id} />
							</section>
						</>
					) : null}
				</DrawerBody>

				<DrawerFooter>
					<Button
						className="w-full"
						disabled={!data || yaAtendido}
						onClick={() => setConfirmando(true)}
					>
						{yaAtendido ? "Ya está atendido" : "Marcar como atendido"}
					</Button>
					<DrawerClose render={<Button variant="outline" className="w-full" />}>
						Cerrar
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>

			<MarkHandledDialog
				open={confirmando}
				onOpenChange={setConfirmando}
				isPending={marcar.isPending}
				nombre={data?.name ?? null}
				email={data?.email ?? null}
				onConfirm={() => {
					if (!id) return;
					// El error lo avienta la propia mutación con su `requestId`
					// (`onError: notifyMutationError`); el diálogo solo se cierra
					// cuando el PATCH terminó bien, para que un fallo deje la
					// confirmación a la vista con el motivo ya encima.
					marcar
						.mutateAsync(id)
						.then(() => setConfirmando(false))
						.catch(() => undefined);
				}}
			/>
		</Drawer>
	);
}
