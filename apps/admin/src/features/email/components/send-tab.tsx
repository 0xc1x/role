import {
	MARKETING_CATEGORIES,
	type MarketingCategory,
} from "@0xc1x/role-commons";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { EmailPreview } from "@/features/email/components/email-preview";
import { IdPicker } from "@/features/email/components/id-picker";
import { SendTestDrawer } from "@/features/email/components/send-test-drawer";
import {
	useCampaignMutations,
	useEmailSegments,
	useEmailTemplates,
	usePreview,
	useTestTemplate,
} from "@/features/email/queries/emails.queries";

export function SendTab() {
	const templates = useEmailTemplates();
	const segments = useEmailSegments();
	const preview = usePreview("template");
	const test = useTestTemplate();
	const campaigns = useCampaignMutations();
	const [templateId, setTemplateId] = useState<string | null>(null);
	const [category, setCategory] = useState<MarketingCategory>("announcements");
	const [segmentIds, setSegmentIds] = useState<string[]>([]);
	const [includeUserIds, setIncludeUserIds] = useState<string[]>([]);
	const [excludeUserIds, setExcludeUserIds] = useState<string[]>([]);
	const [testOpen, setTestOpen] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);

	const selected = (templates.data?.data ?? []).find(
		(t) => t.id === templateId,
	);
	const hasAudience = segmentIds.length > 0 || includeUserIds.length > 0;
	const busy = campaigns.create.isPending || campaigns.send.isPending;

	const selectTemplate = (id: string) => {
		setTemplateId(id);
		preview.mutate(id, {
			onError: (err) =>
				toast.error(err instanceof Error ? err.message : "Error inesperado"),
		});
	};

	/** Envío real: crea una campaña on-the-fly con la audiencia elegida y la envía. */
	const confirmSend = async () => {
		if (!templateId) return;
		try {
			const campaign = await campaigns.create.mutateAsync({
				name: `Envío directo — ${selected?.name ?? "email"} — ${new Date().toLocaleDateString("es-EC")}`,
				channel: "email" as const,
				template_id: templateId,
				category,
				segment_ids: segmentIds,
				include_user_ids: includeUserIds,
				exclude_user_ids: excludeUserIds,
				scheduled_at: null,
			});
			const sent = await campaigns.send.mutateAsync(campaign.id);
			toast.success(
				`Envío iniciado a ${sent.total_recipients} destinatario(s) — sigue el progreso en la pestaña Envíos`,
			);
			setConfirmOpen(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Error inesperado");
		}
	};

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,460px)_1fr]">
			<div className="space-y-4 self-start rounded-lg border p-4">
				<div>
					<h2 className="font-bold text-lg">Enviar email</h2>
					<p className="text-sm text-muted-foreground">
						Elige una plantilla, revisa la preview y envía a destinatarios de
						prueba o a tu audiencia real.
					</p>
				</div>
				<Field>
					<FieldLabel>Plantilla</FieldLabel>
					<Select
						value={templateId ?? undefined}
						onValueChange={(v) => v && selectTemplate(v)}
					>
						<SelectTrigger>
							<SelectValue placeholder="Elegir plantilla" />
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
				{selected ? (
					<p className="text-sm text-muted-foreground">
						Asunto:{" "}
						<span className="font-medium">
							{preview.data?.subject ?? selected.subject}
						</span>
					</p>
				) : null}

				<div className="space-y-4 border-t pt-4">
					<p className="text-sm font-medium">Audiencia real</p>
					<Field>
						<FieldLabel>Categoría</FieldLabel>
						<Select
							value={category}
							onValueChange={(v) => {
								if (!v) return;
								setCategory(v as MarketingCategory);
								// Los segmentos filtrados por categoría quedan deseleccionados.
								setSegmentIds([]);
							}}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{MARKETING_CATEGORIES.map((cat) => (
									<SelectItem key={cat} value={cat}>
										{cat}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel>Segmentos destinatarios</FieldLabel>
						{(segments.data?.data ?? []).filter(
							(s) => s.is_active && s.category === category,
						).length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No hay segmentos activos de categoría "{category}". Créalos en
								Campañas de Marketing → Segmentos.
							</p>
						) : (
							<div className="space-y-1.5">
								{(segments.data?.data ?? [])
									.filter((s) => s.is_active && s.category === category)
									.map((s) => {
										const checked = segmentIds.includes(s.id);
										const toggle = () =>
											setSegmentIds(
												checked
													? segmentIds.filter((id) => id !== s.id)
													: [...segmentIds, s.id],
											);
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
						)}
					</Field>
					<Field>
						<FieldLabel>Incluir usuarios (suscritos a "{category}")</FieldLabel>
						<IdPicker
							label="Incluir usuarios"
							kind="usuarios"
							subscribedTo={category}
							selectedIds={includeUserIds}
							onChange={setIncludeUserIds}
						/>
					</Field>
					<Field>
						<FieldLabel>Excluir usuarios</FieldLabel>
						<IdPicker
							label="Excluir usuarios"
							kind="usuarios"
							selectedIds={excludeUserIds}
							onChange={setExcludeUserIds}
						/>
					</Field>
				</div>

				<div className="flex items-center gap-2 border-t pt-4">
					<Button
						size="sm"
						variant="outline"
						onClick={() => setTestOpen(true)}
						disabled={!templateId}
					>
						Enviar prueba
					</Button>
					<Button
						size="sm"
						onClick={() => setConfirmOpen(true)}
						disabled={!templateId || !hasAudience || busy}
					>
						Enviar
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => templateId && preview.mutate(templateId)}
						disabled={!templateId || preview.isPending}
					>
						{preview.isPending ? <Spinner /> : null} Regenerar preview
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					El envío real crea una campaña con tracking (aparecerá en Campañas de
					Marketing → Mails) y respeta las suscripciones de cada usuario. La
					prueba usa el remitente configurado en Resend.
				</p>
			</div>
			<div className="rounded-lg border p-4">
				<h3 className="mb-3 text-sm font-medium">Preview</h3>
				{preview.data ? (
					<EmailPreview html={preview.data.html} />
				) : (
					<p className="text-sm text-muted-foreground">
						Elige una plantilla para ver la preview del email.
					</p>
				)}
			</div>
			<SendTestDrawer
				open={testOpen}
				onClose={() => setTestOpen(false)}
				templateId={templateId}
				templateName={selected?.name ?? ""}
				test={test}
			/>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>¿Enviar el email?</AlertDialogTitle>
						<AlertDialogDescription>
							Se creará una campaña y se enviará a la audiencia seleccionada
							(segmentos ∪ incluidos − excluidos), respetando las suscripciones
							de cada usuario. Esta acción no se puede deshacer.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction onClick={confirmSend} disabled={busy}>
							{busy ? <Spinner /> : null} Enviar
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

/** Drawer de envío de prueba: emails destinatarios del test. */
