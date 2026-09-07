import { Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { IdPicker } from "@/features/email/components/id-picker";
import { SendTestDrawer } from "@/features/push-notifications/components/send-test-drawer";
import {
	PushTypeSelect,
	type SendFormValues,
	sendDefaults,
} from "@/features/push-notifications/forms/push-forms";
import {
	hasAudience,
	toSendPayload,
} from "@/features/push-notifications/lib/to-send-payload";
import {
	useEmailSegments,
	usePushAudience,
	usePushSend,
	usePushTemplates,
	usePushTest,
} from "@/features/push-notifications/queries/push.queries";

export function SendTab() {
	const templates = usePushTemplates();
	const segments = useEmailSegments();
	const send = usePushSend();
	const audience = usePushAudience();
	const test = usePushTest();
	const [values, setValues] = useState<SendFormValues>(() => sendDefaults());
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [testOpen, setTestOpen] = useState(false);

	const applyTemplate = (templateId: string) => {
		const t = (templates.data?.data ?? []).find((x) => x.id === templateId);
		const link =
			((t?.data as Record<string, unknown> | undefined)?.link as string) ?? "";
		setValues({
			...values,
			template_id: templateId,
			title: t?.title ?? values.title,
			body: t?.body ?? values.body,
			link: link || values.link,
		});
	};

	const ready =
		hasAudience(values) && values.title.trim() && values.body.trim();

	const requestAudience = () =>
		audience.mutate({
			segment_ids: values.segment_ids,
			include_user_ids: values.include_user_ids,
			exclude_user_ids: values.exclude_user_ids,
		});

	const confirmSend = async () => {
		try {
			await send.mutateAsync(toSendPayload(values));
			setConfirmOpen(false);
			setValues(sendDefaults());
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Payload inválido");
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="font-bold text-lg">Enviar notificación</h2>
			</div>
			<div className="grid max-w-3xl gap-4 rounded-lg border p-4">
				<Field>
					<FieldLabel>Plantilla (opcional)</FieldLabel>
					<Select
						value={values.template_id || undefined}
						onValueChange={(v) => v && applyTemplate(v)}
					>
						<SelectTrigger>
							<SelectValue placeholder="Componer desde cero" />
						</SelectTrigger>
						<SelectContent>
							{(templates.data?.data ?? []).map((t) => (
								<SelectItem key={t.id} value={t.id}>
									{t.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<div className="grid grid-cols-3 gap-4">
					<Field className="col-span-2">
						<FieldLabel>Título</FieldLabel>
						<Input
							value={values.title}
							onChange={(e) => setValues({ ...values, title: e.target.value })}
							placeholder="¡Últimas unidades!"
							maxLength={120}
						/>
					</Field>
					<Field>
						<FieldLabel>Tipo</FieldLabel>
						<PushTypeSelect
							value={values.type}
							onChange={(v) => setValues({ ...values, type: v })}
						/>
					</Field>
				</div>
				<Field>
					<FieldLabel>Cuerpo</FieldLabel>
					<Textarea
						rows={3}
						maxLength={500}
						value={values.body}
						onChange={(e) => setValues({ ...values, body: e.target.value })}
						placeholder="Nueva oferta cerca de ti…"
					/>
				</Field>
				<Field>
					<FieldLabel>Link de destino (opcional, ruta de la app)</FieldLabel>
					<Input
						value={values.link}
						onChange={(e) => setValues({ ...values, link: e.target.value })}
						placeholder="/ofertas/1"
					/>
				</Field>
				<Field>
					<FieldLabel>Segmentos destinatarios</FieldLabel>
					<div className="space-y-1.5">
						{(segments.data?.data ?? [])
							.filter((s) => s.is_active)
							.map((s) => {
								const checked = values.segment_ids.includes(s.id);
								const toggle = () =>
									setValues({
										...values,
										segment_ids: checked
											? values.segment_ids.filter((id) => id !== s.id)
											: [...values.segment_ids, s.id],
									});
								return (
									<div
										key={s.id}
										className="flex items-center gap-2 text-sm font-normal"
									>
										<Checkbox
											checked={checked}
											onCheckedChange={toggle}
											aria-label={s.name}
										/>
										<span>
											{s.name} ({s.type})
										</span>
									</div>
								);
							})}
					</div>
				</Field>
				<Field>
					<FieldLabel>Incluir usuarios</FieldLabel>
					<IdPicker
						label="Incluir usuarios"
						kind="usuarios"
						withPushToken
						selectedIds={values.include_user_ids}
						onChange={(ids) => setValues({ ...values, include_user_ids: ids })}
					/>
				</Field>
				<Field>
					<FieldLabel>Excluir usuarios</FieldLabel>
					<IdPicker
						label="Excluir usuarios"
						kind="usuarios"
						withPushToken
						selectedIds={values.exclude_user_ids}
						onChange={(ids) => setValues({ ...values, exclude_user_ids: ids })}
					/>
				</Field>

				<div className="flex flex-wrap items-center gap-2 border-t pt-4">
					<Button
						size="sm"
						variant="outline"
						onClick={requestAudience}
						disabled={!ready || audience.isPending}
					>
						{audience.isPending ? <Spinner /> : null} Calcular alcance
					</Button>
					{audience.data ? (
						<Badge
							variant={audience.data.total > 0 ? "default" : "destructive"}
						>
							Llegaría a {audience.data.total} dispositivo(s)
						</Badge>
					) : null}
					<div className="ml-auto flex gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => setTestOpen(true)}
							disabled={!values.title.trim() || !values.body.trim()}
						>
							Enviar prueba
						</Button>
						<Button
							size="sm"
							onClick={() => setConfirmOpen(true)}
							disabled={!ready}
						>
							<Send className="size-4" /> Enviar
						</Button>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">
					Se respeta push_enabled y el horario de silencio de cada usuario. El
					alcance mostrado no incluye a quienes estén en horario de silencio al
					momento del envío.
				</p>
			</div>

			<SendTestDrawer
				open={testOpen}
				onClose={() => setTestOpen(false)}
				title={values.title}
				body={values.body}
				type={values.type}
				test={test}
			/>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>¿Enviar la notificación?</AlertDialogTitle>
						<AlertDialogDescription>
							Se entregará a la audiencia seleccionada (segmentos ∪ incluidos −
							excluidos) respetando sus preferencias. Esta acción no se puede
							deshacer.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction onClick={confirmSend} disabled={send.isPending}>
							{send.isPending ? <Spinner /> : null} Enviar
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

/** Drawer de envío de prueba: elige usuarios destinatarios del test. */
