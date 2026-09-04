import type { EmailSendDto } from "@0xc1x/role-commons";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { EmailSendForm } from "../forms/email-send.form";

export function EmailSendUpdateDrawer({
	send,
	isOpen,
	onClose,
}: {
	send: EmailSendDto;
	isOpen: boolean;
	onClose: () => void;
}) {
	const formId = `email-send-update-${send.id}`;
	return (
		<Drawer open={isOpen} onOpenChange={(o) => !o && onClose()}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Editar envío</DrawerTitle>
					<DrawerDescription>
						{send.email} — {send.type}/{send.status}
					</DrawerDescription>
				</DrawerHeader>
				<div className="px-4">
					<EmailSendForm formId={formId} send={send} onSuccess={onClose} />
				</div>
				<DrawerFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button type="submit" form={formId}>
						Guardar
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
