import type { BusinessDto } from "@0xc1x/role-commons";
import { useState } from "react";
import { PageTabs, TabPanel } from "@/components/page-tabs";
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
import { BusinessStaffTable } from "@/features/businesses/components/business-staff-table";
import { VerificationBadge } from "@/features/businesses/tables/cells/verification-badge";
import { formatBusinessDate } from "@/lib/dates";

/**
 * Ficha read-only de un negocio: quién pidió la verificación, con qué contacto y
 * qué escribió. Verificar sin estos datos es un sello sin decisión detrás.
 *
 * ─── POR QUÉ LA FICHA TIENE PESTAÑAS ──────────────────────────────────────────
 *
 * Porque la ficha crece: los datos del solicitante, sus puntos de retiro, sus
 * avisos por correo y su equipo son cuatro preguntas DISTINTAS, y metidas en
 * una sola columna obligan al operador a hacer scroll para llegar a la que
 * quiere.
 *
 * ─── POR QUÉ EL ESTADO NO ES LA URL ───────────────────────────────────────────
 *
 * Porque el drawer no es una ruta: es un overlay de una página que ya tiene su
 * propia URL. Poner la pestaña en la URL haría que un enlace al negocio
 * pudiera abrir la ficha en la pestaña equivocada —y que la pestaña se
 * compartiera como si fuera una página—. El estado local alcanza, y como el
 * drawer se monta y se desmonta con la ficha, cada apertura arranca en «Ficha».
 */

const TABS = ["ficha", "equipo"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
	ficha: "Ficha",
	equipo: "Equipo",
};

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
	const [tab, setTab] = useState<Tab>("ficha");

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
					<PageTabs
						tabs={TABS}
						labels={TAB_LABELS}
						value={tab}
						onChange={setTab}
					/>

					{/*
					  Los paneles inactivos NO se desmontan (`TabPanel` los deja
					  montados y ocultos), así que cada sección tiene que gatear su
					  consulta por la pestaña activa: sin eso, el equipo se pediría
					  al abrir la ficha y el operador vería un roster que no miró.
					*/}
					<TabPanel tab="ficha" active={tab === "ficha"} className="space-y-4">
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
								enabled={isOpen && tab === "ficha"}
							/>
						</section>

						<section
							className="space-y-3"
							aria-label="Notificaciones por correo"
						>
							<h3 className="font-medium text-sm">Notificaciones por correo</h3>
							<BusinessEmailSendsTable
								businessId={isOpen && tab === "ficha" ? business.id : null}
								businessName={business.name}
							/>
						</section>
					</TabPanel>

					<TabPanel
						tab="equipo"
						active={tab === "equipo"}
						className="space-y-4"
					>
						<section className="space-y-3" aria-label="Equipo del negocio">
							<h3 className="font-medium text-sm">Equipo</h3>
							<BusinessStaffTable
								businessId={isOpen && tab === "equipo" ? business.id : null}
								businessName={business.name}
							/>
						</section>
					</TabPanel>
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
