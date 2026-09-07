import type { PushNotificationType, PushSendResult } from "@0xc1x/role-commons";
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
import type { usePushTest } from "@/features/push-notifications/queries/push.queries";

export /** Drawer de envío de prueba: elige usuarios destinatarios del test. */
function SendTestDrawer(props: {
	open: boolean;
	onClose: () => void;
	title: string;
	body: string;
	type: PushNotificationType;
	test: ReturnType<typeof usePushTest>;
}) {
	const [testUsers, setTestUsers] = useState<string[]>([]);
	const [result, setResult] = useState<PushSendResult | null>(null);

	const send = async () => {
		const res = await props.test.mutateAsync({
			user_ids: testUsers,
			title: props.title,
			body: props.body,
			type: props.type,
		});
		setResult(res);
		if (res.sent > 0) {
			toast.success(`Prueba enviada a ${res.sent} dispositivo(s)`);
		} else {
			toast.error(
				"Nadie recibió la prueba — verifica que los usuarios tengan push activo y sesión en la app",
			);
		}
	};

	const close = () => {
		props.onClose();
		setTestUsers([]);
		setResult(null);
	};

	return (
		<Drawer open={props.open} onOpenChange={(o) => !o && close()}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Enviar prueba</DrawerTitle>
				</DrawerHeader>
				<DrawerBody>
					<p className="text-sm text-muted-foreground">
						La prueba llega directo a los dispositivos de los usuarios elegidos,
						sin pasar por preferencias ni horario de silencio, y no se registra
						en el historial.
					</p>
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
						<Input value={props.title} readOnly disabled />
					</Field>
					<Field>
						<FieldLabel>Cuerpo</FieldLabel>
						<Input value={props.body} readOnly disabled />
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
							variant="outline"
							onClick={send}
							disabled={testUsers.length === 0 || props.test.isPending}
						>
							{props.test.isPending ? <Spinner /> : null} Enviar prueba
						</Button>
						<DrawerClose>
							<Button variant="ghost">Cerrar</Button>
						</DrawerClose>
					</div>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

// ─── Tab: plantillas ──────────────────────────────────────────────────
