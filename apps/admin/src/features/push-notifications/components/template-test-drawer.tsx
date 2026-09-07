import type { PushSendResult, PushTemplateDto } from "@0xc1x/role-commons";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerBody,
	DrawerClose,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { IdPicker } from "@/features/email/components/id-picker";
import type { usePushTestTemplate } from "@/features/push-notifications/queries/push.queries";

export function TemplateTestDrawer(props: {
	template: PushTemplateDto;
	test: ReturnType<typeof usePushTestTemplate>;
	onClose: () => void;
}) {
	const [testUsers, setTestUsers] = useState<string[]>([]);
	const [result, setResult] = useState<PushSendResult | null>(null);

	const send = async () => {
		try {
			const res = await props.test.mutateAsync({
				id: props.template.id,
				body: {
					user_ids: testUsers,
					title: props.template.title,
					body: props.template.body,
					type: "announcement",
				},
			});
			setResult(res);
			toast.success(
				res.sent > 0
					? `Prueba enviada a ${res.sent} dispositivo(s)`
					: "Nadie recibió la prueba — verifica tokens activos",
			);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Error inesperado");
		}
	};

	return (
		<Drawer open onOpenChange={(o) => !o && props.onClose()}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Probar "{props.template.name}"</DrawerTitle>
				</DrawerHeader>
				<DrawerBody>
					<Field>
						<FieldLabel>Usuarios de prueba (máx. 10)</FieldLabel>
						<IdPicker
							label="Usuarios"
							kind="usuarios"
							withPushToken
							selectedIds={testUsers}
							onChange={setTestUsers}
						/>
					</Field>
					<Field>
						<FieldLabel>Título</FieldLabel>
						<Input value={props.template.title} readOnly disabled />
					</Field>
					<Field>
						<FieldLabel>Cuerpo</FieldLabel>
						<Input value={props.template.body} readOnly disabled />
					</Field>
					{result ? (
						<Badge variant={result.sent > 0 ? "default" : "destructive"}>
							{result.sent} enviado(s) · {result.failed} fallido(s)
						</Badge>
					) : null}
				</DrawerBody>
				<DrawerFooter>
					<div className="flex w-full justify-end gap-2">
						<Button
							type="button"
							onClick={send}
							disabled={testUsers.length === 0 || props.test.isPending}
						>
							{props.test.isPending ? <Spinner /> : null} Enviar prueba
						</Button>
						<DrawerClose>
							<Button variant="outline">Cerrar</Button>
						</DrawerClose>
					</div>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

// ─── Tab: historial ───────────────────────────────────────────────────
