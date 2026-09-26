import type { BusinessDto } from "@0xc1x/role-commons";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useBusinessEmailSends } from "@/features/businesses/queries/businesses.queries";
import { StatusBadge } from "@/features/email-sends/tables/email-sends.columns";

/**
 * Avisos transaccionales de un negocio (read-only).
 *
 * El trigger de Postgres encola el correo de aprobación/rechazo en `email_sends`
 * y el cron lo entrega: sin esta vista el operador aprueba y no tiene forma de
 * saber si el aviso se encoló, salió o falló (y por qué).
 */
export function BusinessEmailSendsDrawer({
	business,
	isOpen,
	onClose,
}: {
	business: BusinessDto;
	isOpen: boolean;
	onClose: () => void;
}) {
	const sends = useBusinessEmailSends(isOpen ? business.id : null);
	const rows = sends.data ?? [];

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			swipeDirection="right"
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Notificaciones por correo</DrawerTitle>
					<DrawerDescription>
						{business.name} — avisos de aprobación y rechazo
					</DrawerDescription>
				</DrawerHeader>

				<DrawerBody>
					{sends.isPending ? (
						<div className="space-y-2">
							{[1, 2, 3].map((n) => (
								<Skeleton key={n} className="h-10 w-full" />
							))}
						</div>
					) : sends.isError ? (
						<p className="text-destructive text-sm">
							{sends.error instanceof Error
								? sends.error.message
								: "No se pudieron cargar las notificaciones"}
						</p>
					) : rows.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Sin notificaciones por correo para este negocio.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Destinatario</TableHead>
									<TableHead>Plantilla</TableHead>
									<TableHead>Estado</TableHead>
									<TableHead>Detalle</TableHead>
									<TableHead>Creado</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((send) => (
									<TableRow key={send.id}>
										<TableCell className="font-medium">{send.email}</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{send.template_name}
										</TableCell>
										<TableCell>
											<StatusBadge status={send.status} />
										</TableCell>
										<TableCell className="max-w-[16rem] text-sm">
											{send.error_message ?? "—"}
										</TableCell>
										<TableCell className="text-muted-foreground text-sm whitespace-nowrap">
											{new Date(send.created_at).toLocaleString("es-EC")}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</DrawerBody>

				<DrawerFooter>
					{sends.isFetching && !sends.isPending ? <Spinner /> : null}
					<DrawerClose>
						<Button variant="outline" className="w-full">
							Cerrar
						</Button>
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
