import type { CampaignDto } from "@0xc1x/role-commons";
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
import { Spinner } from "@/components/ui/spinner";
import { IdPicker } from "@/features/email/components/id-picker";
import { usePushTestTemplate } from "@/features/push-notifications/queries/push.queries";

export function PushTestDrawer(props: {
	campaign: CampaignDto | null;
	templates: Array<{ id: string; name: string; title: string; body: string }>;
	onClose: () => void;
}) {
	const test = usePushTestTemplate();
	const [userIds, setUserIds] = useState<string[]>([]);
	const c = props.campaign;
	const template =
		c?.template_id != null
			? props.templates.find((t) => t.id === c.template_id)
			: undefined;

	const send = async () => {
		if (!c?.template_id || userIds.length === 0 || !template) return;
		const res = await test.mutateAsync({
			id: c.template_id,
			body: {
				user_ids: userIds,
				title: template.title,
				body: template.body,
				type: "announcement" as const,
			},
		});
		if (res.sent > 0) {
			toast.success(`Prueba enviada a ${res.sent} dispositivo(s)`);
			props.onClose();
		} else {
			toast.error("Ningún envío pudo entregarse — revisa los tokens");
		}
	};

	if (!c) return null;

	return (
		<Drawer open onOpenChange={(o) => !o && props.onClose()}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Probar {c.name}</DrawerTitle>
				</DrawerHeader>
				<div className="p-4 space-y-4">
					<Field>
						<FieldLabel>Usuarios destinatarios (máx. 10)</FieldLabel>
						<IdPicker
							label="Usuarios de prueba"
							kind="usuarios"
							withPushToken
							selectedIds={userIds}
							onChange={setUserIds}
						/>
					</Field>
					{template ? (
						<div className="rounded-lg border p-3">
							<p className="text-sm font-medium">{template.title}</p>
							<p className="text-sm text-muted-foreground">{template.body}</p>
						</div>
					) : null}
				</div>
				<DrawerFooter>
					<Button
						type="button"
						onClick={send}
						disabled={userIds.length === 0 || test.isPending}
					>
						{test.isPending ? <Spinner /> : null} Enviar prueba
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
