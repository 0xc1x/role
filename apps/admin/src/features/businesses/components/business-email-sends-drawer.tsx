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
					<BusinessEmailSendsTable
						businessId={isOpen ? business.id : null}
						businessName={business.name}
					/>
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
