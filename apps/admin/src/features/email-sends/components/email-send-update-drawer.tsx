import type { EmailSendDto } from "@0xc1x/role-commons";
import { ResourceUpdateDrawer } from "@/components/resource/resource-drawer";
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
		<ResourceUpdateDrawer
			formId={formId}
			title="Editar envío"
			description={`${send.email} — ${send.type}/${send.status}`}
			isOpen={isOpen}
			onClose={onClose}
			submitLabel="Guardar"
			updatingLabel="Guardando"
		>
			<EmailSendForm formId={formId} send={send} onSuccess={onClose} />
		</ResourceUpdateDrawer>
	);
}
