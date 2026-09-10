import {
	type EmailTemplateDto,
	MARKETING_CATEGORIES,
	type MarketingCategory,
	type SegmentDto,
} from "@0xc1x/role-commons";
import { useMemo, useState } from "react";
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

/** Toggle inmutable de un id en una lista de selección. */
function toggleId(ids: string[], id: string): string[] {
	return ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
}

function TemplatePickerSection({
	templates,
	templateId,
	subject,
	onSelectTemplate,
}: {
	templates: EmailTemplateDto[];
	templateId: string | null;
	subject: string | null;
	onSelectTemplate: (id: string) => void;
}) {
	return (
		<>
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
					onValueChange={(v) => v && onSelectTemplate(v)}
				>
					<SelectTrigger>
						<SelectValue placeholder="Elegir plantilla" />
					</SelectTrigger>
					<SelectContent>
						{templates.map((t) => (
							<SelectItem key={t.id} value={t.id}>
								{t.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			{subject ? (
				<p className="text-sm text-muted-foreground">
					Asunto: <span className="font-medium">{subject}</span>
				</p>
			) : null}
		</>
	);
}

function SegmentChecklist({
	category,
	segments,
	selectedIds,
	onToggle,
}: {
	category: MarketingCategory;
	segments: SegmentDto[];
	selectedIds: string[];
	onToggle: (id: string) => void;
}) {
	// Lookup O(1) para el checklist; los writes siguen con el array.
	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	return (
		<Field>
			<FieldLabel>Segmentos destinatarios</FieldLabel>
			{segments.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No hay segmentos activos de categoría "{category}". Créalos en
					Campañas de Marketing → Segmentos.
				</p>
			) : (
				<div className="space-y-1.5">
					{segments.map((s) => {
						const checked = selectedSet.has(s.id);
						return (
							<div
								key={s.id}
								className="flex items-center gap-2 text-sm font-normal"
							>
								<Checkbox
									checked={checked}
									onCheckedChange={() => onToggle(s.id)}
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
	);
}

function AudienceSection({
	category,
	visibleSegments,
	segmentIds,
	includeUserIds,
	excludeUserIds,
	onCategoryChange,
	onToggleSegment,
	onIncludeChange,
	onExcludeChange,
}: {
	category: MarketingCategory;
	visibleSegments: SegmentDto[];
	segmentIds: string[];
	includeUserIds: string[];
	excludeUserIds: string[];
	onCategoryChange: (category: MarketingCategory) => void;
	onToggleSegment: (id: string) => void;
	onIncludeChange: (ids: string[]) => void;
	onExcludeChange: (ids: string[]) => void;
}) {
	return (
		<div className="space-y-4 border-t pt-4">
			<p className="text-sm font-medium">Audiencia real</p>
			<Field>
				<FieldLabel>Categoría</FieldLabel>
				<Select
					value={category}
					onValueChange={(v) => {
						if (!v) return;
						onCategoryChange(v as MarketingCategory);
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
			<SegmentChecklist
				category={category}
				segments={visibleSegments}
				selectedIds={segmentIds}
				onToggle={onToggleSegment}
			/>
			<Field>
				<FieldLabel>Incluir usuarios (suscritos a "{category}")</FieldLabel>
				<IdPicker
					label="Incluir usuarios"
					kind="usuarios"
					subscribedTo={category}
					selectedIds={includeUserIds}
					onChange={onIncludeChange}
				/>
			</Field>
			<Field>
				<FieldLabel>Excluir usuarios</FieldLabel>
				<IdPicker
					label="Excluir usuarios"
					kind="usuarios"
					selectedIds={excludeUserIds}
					onChange={onExcludeChange}
				/>
			</Field>
		</div>
	);
}

function SendActionsBar({
	testDisabled,
	sendDisabled,
	previewPending,
	onTest,
	onConfirm,
	onRegenerate,
}: {
	testDisabled: boolean;
	sendDisabled: boolean;
	previewPending: boolean;
	onTest: () => void;
	onConfirm: () => void;
	onRegenerate: () => void;
}) {
	return (
		<>
			<div className="flex items-center gap-2 border-t pt-4">
				<Button
					size="sm"
					variant="outline"
					onClick={onTest}
					disabled={testDisabled}
				>
					Enviar prueba
				</Button>
				<Button size="sm" onClick={onConfirm} disabled={sendDisabled}>
					Enviar
				</Button>
				<Button
					size="sm"
					variant="ghost"
					onClick={onRegenerate}
					disabled={testDisabled || previewPending}
				>
					{previewPending ? <Spinner /> : null} Regenerar preview
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				El envío real crea una campaña con tracking (aparecerá en Campañas de
				Marketing → Mails) y respeta las suscripciones de cada usuario. La
				prueba usa el remitente configurado en Resend.
			</p>
		</>
	);
}

function PreviewPane({ html }: { html: string | null }) {
	return (
		<div className="rounded-lg border p-4">
			<h3 className="mb-3 text-sm font-medium">Preview</h3>
			{html ? (
				<EmailPreview html={html} />
			) : (
				<p className="text-sm text-muted-foreground">
					Elige una plantilla para ver la preview del email.
				</p>
			)}
		</div>
	);
}

function ConfirmSendDialog({
	open,
	busy,
	onOpenChange,
	onConfirm,
}: {
	open: boolean;
	busy: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>¿Enviar el email?</AlertDialogTitle>
					<AlertDialogDescription>
						Se creará una campaña y se enviará a la audiencia seleccionada
						(segmentos ∪ incluidos − excluidos), respetando las suscripciones de
						cada usuario. Esta acción no se puede deshacer.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancelar</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} disabled={busy}>
						{busy ? <Spinner /> : null} Enviar
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/** Estado y orquestación del tab de envío (queries + selección + handlers). */
function useSendTabState() {
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
	const visibleSegments = (segments.data?.data ?? []).filter(
		(s) => s.is_active && s.category === category,
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

	const handleCategoryChange = (next: MarketingCategory) => {
		setCategory(next);
		// Los segmentos filtrados por categoría quedan deseleccionados.
		setSegmentIds([]);
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

	return {
		templates,
		preview,
		test,
		templateId,
		category,
		segmentIds,
		setSegmentIds,
		includeUserIds,
		setIncludeUserIds,
		excludeUserIds,
		setExcludeUserIds,
		testOpen,
		setTestOpen,
		confirmOpen,
		setConfirmOpen,
		selected,
		visibleSegments,
		hasAudience,
		busy,
		selectTemplate,
		handleCategoryChange,
		confirmSend,
	};
}

export function SendTab() {
	const {
		templates,
		preview,
		test,
		templateId,
		category,
		segmentIds,
		setSegmentIds,
		includeUserIds,
		setIncludeUserIds,
		excludeUserIds,
		setExcludeUserIds,
		testOpen,
		setTestOpen,
		confirmOpen,
		setConfirmOpen,
		selected,
		visibleSegments,
		hasAudience,
		busy,
		selectTemplate,
		handleCategoryChange,
		confirmSend,
	} = useSendTabState();

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,460px)_1fr]">
			<div className="space-y-4 self-start rounded-lg border p-4">
				<TemplatePickerSection
					templates={templates.data?.data ?? []}
					templateId={templateId}
					subject={preview.data?.subject ?? selected?.subject ?? null}
					onSelectTemplate={selectTemplate}
				/>
				<AudienceSection
					category={category}
					visibleSegments={visibleSegments}
					segmentIds={segmentIds}
					includeUserIds={includeUserIds}
					excludeUserIds={excludeUserIds}
					onCategoryChange={handleCategoryChange}
					onToggleSegment={(id) => setSegmentIds(toggleId(segmentIds, id))}
					onIncludeChange={setIncludeUserIds}
					onExcludeChange={setExcludeUserIds}
				/>
				<SendActionsBar
					testDisabled={!templateId}
					sendDisabled={!templateId || !hasAudience || busy}
					previewPending={preview.isPending}
					onTest={() => setTestOpen(true)}
					onConfirm={() => setConfirmOpen(true)}
					onRegenerate={() => templateId && preview.mutate(templateId)}
				/>
			</div>
			<PreviewPane html={preview.data?.html ?? null} />
			<SendTestDrawer
				open={testOpen}
				onClose={() => setTestOpen(false)}
				templateId={templateId}
				templateName={selected?.name ?? ""}
				test={test}
			/>

			<ConfirmSendDialog
				open={confirmOpen}
				busy={busy}
				onOpenChange={setConfirmOpen}
				onConfirm={confirmSend}
			/>
		</div>
	);
}

/** Drawer de envío de prueba: emails destinatarios del test. */
