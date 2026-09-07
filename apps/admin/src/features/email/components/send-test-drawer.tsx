import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { useTestTemplate } from "@/features/email/queries/emails.queries";

export function SendTestDrawer(props: {
	open: boolean;
	onClose: () => void;
	templateId: string | null;
	templateName: string;
	test: ReturnType<typeof useTestTemplate>;
}) {
	const [emails, setEmails] = useState("");
	const parsed = emails
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	const send = async () => {
		if (!props.templateId) return;
		try {
			const res = await props.test.mutateAsync({
				id: props.templateId,
				emails: parsed,
			});
			if (res.sent > 0) {
				toast.success(`Prueba enviada a ${res.sent} correo(s)`);
				props.onClose();
			} else {
				toast.error(
					"Ningún correo pudo enviarse — revisa el remitente en Resend",
				);
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Error inesperado");
		}
	};

	return (
		<Drawer open={props.open} onOpenChange={(o) => !o && props.onClose()}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Probar {props.templateName}</DrawerTitle>
				</DrawerHeader>
				<div className="p-4 space-y-4">
					<Field>
						<FieldLabel>Emails destinatarios (coma separados)</FieldLabel>
						<Input
							value={emails}
							onChange={(e) => setEmails(e.target.value)}
							placeholder="tu@correo.com, socio@correo.com"
						/>
					</Field>
				</div>
				<DrawerFooter>
					<Button
						type="button"
						onClick={send}
						disabled={parsed.length === 0 || props.test.isPending}
					>
						{props.test.isPending ? <Spinner /> : null} Enviar prueba
					</Button>
					<DrawerClose>
						<Button variant="outline" className="w-full">
							Cancelar
						</Button>
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

// ─── Tab: componentes ─────────────────────────────────────────────────
