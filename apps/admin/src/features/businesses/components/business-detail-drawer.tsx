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
import { BusinessEmailSendsTable } from "@/features/businesses/components/business-email-sends-table";
import { BusinessLocationsSection } from "@/features/businesses/components/business-locations-section";
import { VerificationBadge } from "@/features/businesses/tables/cells/verification-badge";
import { formatBusinessDate } from "@/lib/dates";

/**
 * Ficha read-only de un negocio: quién pidió la verificación, con qué contacto y
 * qué escribió. Verificar sin estos datos es un sello sin decisión detrás.
 */

function DetailField({
	label,
	value,
}: {
	label: string;
	value?: string | null;
}) {
	return (
		<div className="space-y-1">
			<p className="text-muted-foreground text-xs font-medium">{label}</p>
			{value ? (
				<p className="text-sm break-words whitespace-pre-line">{value}</p>
			) : (
				<p className="text-muted-foreground text-sm">— sin informar —</p>
			)}
		</div>
	);
}

export function BusinessDetailDrawer({
	business,
	isOpen,
	onClose,
}: {
	business: BusinessDto;
	isOpen: boolean;
	onClose: () => void;
}) {
	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			swipeDirection="right"
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Ficha del negocio</DrawerTitle>
					<DrawerDescription>
						{business.name} — datos del solicitante y estado de verificación
					</DrawerDescription>
				</DrawerHeader>

				<DrawerBody>
					<section className="space-y-3" aria-label="Estado de verificación">
						<div className="flex items-center gap-2">
							<VerificationBadge status={business.verification_status} />
							<span className="text-muted-foreground text-sm">
								{formatBusinessDate(business.created_at)} ·{" "}
								{business.is_active ? "activo" : "inactivo"}
							</span>
						</div>
						{business.rejection_reason ? (
							<DetailField
								label="Motivo de rechazo"
								value={business.rejection_reason}
							/>
						) : null}
					</section>

					<section className="space-y-3" aria-label="Datos de contacto">
						<h3 className="font-medium text-sm">Contacto</h3>
						<DetailField label="Correo" value={business.email} />
						<DetailField label="Teléfono" value={business.phone} />
						<DetailField label="Sitio web" value={business.website} />
					</section>

					<section className="space-y-3" aria-label="Descripción del negocio">
						<h3 className="font-medium text-sm">Descripción</h3>
						<DetailField
							label="Lo que escribió el solicitante"
							value={business.description}
						/>
					</section>

					<section className="space-y-3" aria-label="Datos del registro">
						<h3 className="font-medium text-sm">Registro</h3>
						<DetailField label="ID" value={business.id} />
						<DetailField label="Propietario" value={business.owner_id} />
						<DetailField label="Tipo" value={business.type} />
					</section>

					<section className="space-y-3" aria-label="Puntos de retiro">
						<h3 className="font-medium text-sm">Puntos de retiro</h3>
						<BusinessLocationsSection
							businessId={business.id}
							businessName={business.name}
							enabled={isOpen}
						/>
					</section>

					<section className="space-y-3" aria-label="Notificaciones por correo">
						<h3 className="font-medium text-sm">Notificaciones por correo</h3>
						<BusinessEmailSendsTable
							businessId={isOpen ? business.id : null}
							businessName={business.name}
						/>
					</section>
				</DrawerBody>

				<DrawerFooter>
					<DrawerClose render={<Button variant="outline" className="w-full" />}>
						Cerrar
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
