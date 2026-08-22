import {
	type CampaignDto,
	MARKETING_CATEGORIES,
	type SegmentDto,
} from "@0xc1x/role-commons";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ActiveCell } from "@/components/data-table/cells/active-cell";
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
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { IdPicker } from "@/features/email/components/id-picker";
import {
	ComponentFields,
	componentDefaults,
	SegmentFields,
	type SegmentFormValues,
	segmentDefaults,
	TemplateFields,
	templateDefaults,
} from "@/features/email/forms/email-forms";
import {
	emailListOptions,
	useAudience,
	useCampaignMutations,
	useComponentMutations,
	useEmailComponents,
	useEmailSegments,
	useEmailTemplates,
	usePreview,
	useSegmentMutations,
	useSegmentUsers,
	useSetSegmentUsers,
	useTemplateMutations,
	useTestTemplate,
} from "@/features/email/queries/emails.queries";

const TABS = ["campanas", "plantillas", "componentes", "segmentos"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_layout/emails")({
	validateSearch: (raw: Record<string, unknown>): { tab?: Tab } => {
		const tab = typeof raw.tab === "string" ? raw.tab : undefined;
		return TABS.includes(tab as Tab) ? { tab: tab as Tab } : {};
	},
	component: EmailsPage,
	head: () => ({ meta: [{ title: "Emails | Rolé" }] }),
});

function EmailsPage() {
	const { tab: tabFromUrl } = Route.useSearch();
	const navigate = Route.useNavigate();
	const tab = tabFromUrl ?? "campanas";
	const setTab = (t: Tab) =>
		navigate({ search: t === "campanas" ? {} : { tab: t } });
	return (
		<div className="px-6 py-4">
			<h1 className="font-bold text-xl">Emails de marketing</h1>
			<div className="mt-4 flex gap-2">
				{TABS.map((t) => (
					<Button
						key={t}
						variant={tab === t ? "default" : "ghost"}
						size="sm"
						className="capitalize"
						onClick={() => setTab(t)}
					>
						{t}
					</Button>
				))}
			</div>
			<div className="mt-6">
				{tab === "campanas" && <CampaignsTab />}
				{tab === "plantillas" && <TemplatesTab />}
				{tab === "componentes" && <ComponentsTab />}
				{tab === "segmentos" && <SegmentsTab />}
			</div>
		</div>
	);
}

// ─── helpers compartidos ──────────────────────────────────────────────

function Loading() {
	return (
		<div className="space-y-2">
			{[1, 2, 3, 4].map((n) => (
				<Skeleton key={n} className="h-10 w-full" />
			))}
		</div>
	);
}

/** Drawer genérico crear/editar con estado local del formulario. */
function FormDrawer<Row, Values>(props: {
	title: string;
	createLabel: string;
	row?: Row;
	defaults: (row?: Row) => Values;
	fields: (ctx: {
		values: Values;
		setValues: (v: Values) => void;
	}) => React.ReactNode;
	toPayload: (values: Values) => unknown;
	onSubmit: (payload: unknown, row?: Row) => Promise<unknown>;
	isPending?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [resetKey, setResetKey] = useState(0);
	const [values, setValues] = useState<Values>(() => props.defaults(props.row));

	const submit = async () => {
		await props.onSubmit(values as never, props.row);
		setOpen(false);
		setValues(props.defaults(undefined));
	};

	return (
		<Drawer
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setResetKey((k) => k + 1);
			}}
		>
			<DrawerTrigger
				render={
					<Button variant="ghost" size={props.row ? "icon" : undefined} />
				}
			>
				{props.row ? <Pencil className="size-4" /> : <Plus />}{" "}
				{props.row ? null : props.createLabel}
			</DrawerTrigger>
			<DrawerContent key={resetKey}>
				<DrawerHeader>
					<DrawerTitle>{props.title}</DrawerTitle>
				</DrawerHeader>
				<div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
					{open ? (
						<div className="space-y-4">
							{props.fields({ values, setValues })}
						</div>
					) : null}
				</div>
				<DrawerFooter>
					<Button type="button" onClick={submit} disabled={props.isPending}>
						{props.isPending ? <Spinner /> : null} Guardar
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

function ComponentsTab() {
	const list = useEmailComponents();
	const mutations = useComponentMutations();

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="font-bold text-lg">Encabezados y pies</h2>
				<FormDrawer
					title="Nuevo componente"
					createLabel="Crear componente"
					defaults={() => componentDefaults()}
					fields={({ values, setValues }) => (
						<ComponentFields values={values} setValues={setValues} />
					)}
					toPayload={(v) => v}
					onSubmit={(payload) => mutations.create.mutateAsync(payload)}
					isPending={mutations.create.isPending}
				/>
			</div>
			{list.isLoading ? <Loading /> : null}
			{(list.data?.data ?? []).map((c) => (
				<div
					key={c.id}
					className="flex items-center justify-between rounded-lg border p-3"
				>
					<div>
						<p className="font-medium">{c.name}</p>
						<Badge variant="secondary">{c.type}</Badge>
					</div>
					<FormDrawer
						title={`Editar ${c.name}`}
						createLabel=""
						row={c}
						defaults={componentDefaults}
						fields={({ values, setValues }) => (
							<ComponentFields values={values} setValues={setValues} />
						)}
						toPayload={(v) => v}
						onSubmit={(payload) =>
							mutations.update.mutateAsync({ id: c.id, body: payload })
						}
						isPending={mutations.update.isPending}
					/>
				</div>
			))}
		</div>
	);
}

// ─── Tab: plantillas ──────────────────────────────────────────────────

function TemplatesTab() {
	const list = useEmailTemplates();
	const components = useEmailComponents();
	const mutations = useTemplateMutations();
	const preview = usePreview("template");
	const [previewId, setPreviewId] = useState<string | null>(null);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="font-bold text-lg">Plantillas</h2>
				<FormDrawer
					title="Nueva plantilla"
					createLabel="Crear plantilla"
					defaults={() => templateDefaults()}
					fields={({ values, setValues }) => (
						<TemplateFields
							values={values}
							setValues={setValues}
							components={components.data?.data ?? []}
						/>
					)}
					toPayload={(v) => v}
					onSubmit={(payload) => mutations.create.mutateAsync(payload)}
					isPending={mutations.create.isPending}
				/>
			</div>
			{preview.data && previewId ? (
				<TestPanel
					templateId={previewId}
					html={preview.data.html}
					subject={preview.data.subject}
				/>
			) : null}
			{list.isLoading ? <Loading /> : null}
			{(list.data?.data ?? []).map((t) => (
				<div
					key={t.id}
					className="flex items-center justify-between rounded-lg border p-3"
				>
					<div>
						<p className="font-medium">{t.name}</p>
						<p className="text-sm text-muted-foreground">{t.subject}</p>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setPreviewId(null);
								preview.mutate(t.id, {
									onSuccess: () => setPreviewId(t.id),
								});
							}}
						>
							{preview.isPending ? <Spinner /> : null} Preview
						</Button>
						<FormDrawer
							title={`Editar ${t.name}`}
							createLabel=""
							row={t}
							defaults={templateDefaults}
							fields={({ values, setValues }) => (
								<TemplateFields
									values={values}
									setValues={setValues}
									components={components.data?.data ?? []}
								/>
							)}
							toPayload={(v) => v}
							onSubmit={(payload) =>
								mutations.update.mutateAsync({ id: t.id, body: payload })
							}
							isPending={mutations.update.isPending}
						/>
					</div>
				</div>
			))}
		</div>
	);
}

// ─── Tab: segmentos ───────────────────────────────────────────────────

function SegmentsTab() {
	const list = useEmailSegments();
	const mutations = useSegmentMutations();
	const setUsers = useSetSegmentUsers();
	const [editing, setEditing] = useState<SegmentDto | null>(null);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="font-bold text-lg">Segmentos</h2>
				<FormDrawer
					title="Nuevo segmento"
					createLabel="Crear segmento"
					defaults={() => segmentDefaults()}
					fields={({ values, setValues }) => (
						<SegmentFields values={values} setValues={setValues} />
					)}
					toPayload={(v) =>
						v.type === "dynamic"
							? {
									name: v.name,
									description: v.description || null,
									type: "dynamic",
									filters: JSON.parse(v.filtersJson || "{}"),
									category: v.category,
									is_active: true,
								}
							: {
									name: v.name,
									description: v.description || null,
									type: "static",
									filters: null,
									category: v.category,
									is_active: true,
									user_ids: v.user_ids,
								}
					}
					onSubmit={(payload) => mutations.create.mutateAsync(payload)}
					isPending={mutations.create.isPending}
				/>
			</div>
			{list.isLoading ? <Loading /> : null}
			{(list.data?.data ?? []).map((s) => (
				<div
					key={s.id}
					className="flex items-center justify-between rounded-lg border p-3"
				>
					<div>
						<p className="font-medium">{s.name}</p>
						<p className="text-sm text-muted-foreground">
							{s.type} · ~{s.estimated_count ?? "?"} destinatarios
						</p>
					</div>
					<div className="flex items-center gap-2">
						<ActiveCell
							active={s.is_active}
							onToggle={(checked) =>
								mutations.update.mutate({
									id: s.id,
									body: { is_active: checked },
								})
							}
							isPending={mutations.update.isPending}
							label="Segmento"
						/>
						<Button size="sm" variant="outline" onClick={() => setEditing(s)}>
							Editar
						</Button>
						<SegmentActions
							segment={s}
							onRemove={() => mutations.remove.mutateAsync(s.id)}
							isRemoving={mutations.remove.isPending}
						/>
					</div>
				</div>
			))}
			{editing ? (
				<SegmentEditDrawer
					segment={editing}
					setUsers={setUsers}
					update={mutations.update}
					onClose={() => setEditing(null)}
				/>
			) : null}
		</div>
	);
}

/** Drawer de edición de segmento: campos + miembros estáticos. */
function SegmentEditDrawer(props: {
	segment: SegmentDto;
	setUsers: ReturnType<typeof useSetSegmentUsers>;
	update: ReturnType<typeof useSegmentMutations>["update"];
	onClose: () => void;
}) {
	const members = useSegmentUsers(props.segment.id);
	const [values, setValues] = useState<SegmentFormValues>(() =>
		segmentDefaults(props.segment),
	);

	useEffect(() => {
		if (members.data) {
			setValues((v) => ({ ...v, user_ids: [...members.data] }));
		}
	}, [members.data]);

	const save = async () => {
		const payload =
			values.type === "dynamic"
				? {
						name: values.name,
						description: values.description || null,
						type: "dynamic" as const,
						filters: JSON.parse(values.filtersJson || "{}"),
						category: values.category,
					}
				: {
						name: values.name,
						description: values.description || null,
						type: "static" as const,
						filters: null,
						category: values.category,
					};
		await props.update.mutateAsync({ id: props.segment.id, body: payload });
		if (values.type === "static") {
			await props.setUsers.mutateAsync({
				id: props.segment.id,
				user_ids: values.user_ids,
			});
		}
		props.onClose();
	};

	return (
		<Drawer open onOpenChange={(o) => !o && props.onClose()}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Editar {props.segment.name}</DrawerTitle>
				</DrawerHeader>
				<div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
					{members.isLoading ? (
						<p className="text-sm text-muted-foreground">Cargando miembros…</p>
					) : (
						<SegmentFields values={values} setValues={setValues} />
					)}
				</div>
				<DrawerFooter>
					<Button
						type="button"
						onClick={save}
						disabled={props.update.isPending}
					>
						{props.update.isPending ? <Spinner /> : null} Guardar cambios
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

/** Menú de acciones + confirmación (mismo patrón que categorías). */
function SegmentActions(props: {
	segment: SegmentDto;
	onRemove: () => Promise<unknown>;
	isRemoving: boolean;
}) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={<Button variant="ghost" className="h-8 w-8 p-0" />}
				>
					<span className="sr-only">Abrir menú</span>
					<MoreHorizontal className="size-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuGroup>
						<DropdownMenuLabel>Acciones</DropdownMenuLabel>
						<DropdownMenuItem
							onClick={() => navigator.clipboard.writeText(props.segment.id)}
						>
							Copiar ID
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							variant="destructive"
							onClick={() => setConfirmOpen(true)}
						>
							<Trash2 className="size-4" /> Eliminar
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Eliminar el segmento "{props.segment.name}"?
						</AlertDialogTitle>
						<AlertDialogDescription>
							El segmento se desactiva y deja de aparecer en la lista. Esta
							acción no se puede deshacer.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								await props.onRemove();
								setConfirmOpen(false);
							}}
						>
							{props.isRemoving ? <Spinner /> : null} Eliminar
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

// ─── Tab: campañas ────────────────────────────────────────────────────

interface CampaignFormValues {
	name: string;
	template_id: string;
	category: string;
	subject_override: string;
	segment_ids: string[];
	include_user_ids: string[];
	exclude_user_ids: string[];
	scheduled_at: string;
}

function campaignDefaults(c?: CampaignDto): CampaignFormValues {
	return {
		name: c?.name ?? "",
		template_id: c?.template_id ?? "",
		category: c?.category ?? "announcements",
		subject_override: c?.subject_override ?? "",
		segment_ids: c?.segment_ids ?? [],
		include_user_ids: c?.include_user_ids ?? [],
		exclude_user_ids: c?.exclude_user_ids ?? [],
		scheduled_at: c?.scheduled_at?.slice(0, 16) ?? "",
	};
}

function CampaignsTab() {
	const list = useQuery(emailListOptions.campaigns({ limit: 50 }));
	const templates = useEmailTemplates();
	const segments = useEmailSegments();
	const mutations = useCampaignMutations();

	if (list.isLoading || templates.isLoading) return <Loading />;

	const campaigns = list.data?.data ?? [];

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="font-bold text-lg">Campañas</h2>
				<FormDrawer
					title="Nueva campaña"
					createLabel="Crear campaña"
					defaults={() => campaignDefaults()}
					fields={({ values, setValues }) => (
						<CampaignFields
							values={values}
							setValues={setValues}
							templates={templates.data?.data ?? []}
							segments={segments.data?.data ?? []}
						/>
					)}
					toPayload={(v) => ({
						name: v.name,
						template_id: v.template_id || null,
						category: v.category,
						subject_override: v.subject_override || null,
						segment_ids: v.segment_ids,
						include_user_ids: v.include_user_ids,
						exclude_user_ids: v.exclude_user_ids,
						scheduled_at: v.scheduled_at || null,
					})}
					onSubmit={(payload) => mutations.create.mutateAsync(payload)}
					isPending={mutations.create.isPending}
				/>
			</div>

			{campaigns.map((c) => (
				<CampaignRowCard
					key={c.id}
					campaign={c}
					templates={templates.data?.data ?? []}
					segments={segments.data?.data ?? []}
					onSend={() => mutations.send.mutate(c.id)}
					onCancel={() => mutations.cancel.mutate(c.id)}
					onRemove={() => mutations.remove.mutateAsync(c.id)}
					onUpdate={(payload) =>
						mutations.update.mutateAsync({ id: c.id, body: payload })
					}
					onTest={(emails) => mutations.test.mutate({ id: c.id, emails })}
					busy={
						mutations.send.isPending ||
						mutations.cancel.isPending ||
						mutations.test.isPending ||
						mutations.update.isPending
					}
				/>
			))}
		</div>
	);
}

function CampaignFields({
	values,
	setValues,
	templates,
	segments,
}: {
	values: CampaignFormValues;
	setValues: (v: CampaignFormValues) => void;
	templates: { id: string; name: string }[];
	segments: SegmentDto[];
}) {
	// Solo segmentos de la misma categoría que la campaña.
	const matchingSegments = segments.filter(
		(s) => s.category === values.category,
	);
	return (
		<>
			<Field>
				<FieldLabel>Nombre</FieldLabel>
				<Input
					value={values.name}
					onChange={(e) => setValues({ ...values, name: e.target.value })}
				/>
			</Field>
			<Field>
				<FieldLabel>Plantilla</FieldLabel>
				<Select
					value={values.template_id || undefined}
					onValueChange={(v) => {
						if (v) setValues({ ...values, template_id: v });
					}}
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
			<div className="grid grid-cols-2 gap-4">
				<Field>
					<FieldLabel>Categoría</FieldLabel>
					<Select
						value={values.category}
						onValueChange={(v) => {
							if (v) setValues({ ...values, category: v });
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
					<FieldLabel>Programar (opcional)</FieldLabel>
					<Input
						type="datetime-local"
						value={values.scheduled_at}
						onChange={(e) =>
							setValues({ ...values, scheduled_at: e.target.value })
						}
					/>
				</Field>
			</div>
			<Field>
				<FieldLabel>Asunto alternativo (opcional)</FieldLabel>
				<Input
					value={values.subject_override}
					onChange={(e) =>
						setValues({ ...values, subject_override: e.target.value })
					}
				/>
			</Field>
			<Field>
				<FieldLabel>Segmentos destinatarios</FieldLabel>
				{matchingSegments.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No hay segmentos de categoría "{values.category}". Créalos en la
						pestaña Segmentos.
					</p>
				) : null}
				<div className="space-y-1.5">
					{matchingSegments.map((s) => {
						const checked = values.segment_ids.includes(s.id);
						return (
							<label
								key={s.id}
								className="flex items-center gap-2 text-sm font-normal"
							>
								<input
									type="checkbox"
									checked={checked}
									onChange={(e) =>
										setValues({
											...values,
											segment_ids: e.target.checked
												? [...values.segment_ids, s.id]
												: values.segment_ids.filter((id) => id !== s.id),
										})
									}
								/>
								{s.name} ({s.type})
							</label>
						);
					})}
				</div>
			</Field>
			<Field>
				<FieldLabel>
					Incluir usuarios (suscritos a "{values.category}")
				</FieldLabel>
				<IdPicker
					label="Incluir usuarios"
					kind="usuarios"
					subscribedTo={values.category}
					selectedIds={values.include_user_ids}
					onChange={(ids) => setValues({ ...values, include_user_ids: ids })}
				/>
			</Field>
			<Field>
				<FieldLabel>Incluir negocios</FieldLabel>
				<IdPicker
					label="Incluir negocios"
					kind="negocios"
					selectedIds={values.include_user_ids}
					onChange={(ids) => setValues({ ...values, include_user_ids: ids })}
				/>
			</Field>
			<Field>
				<FieldLabel>Excluir usuarios</FieldLabel>
				<IdPicker
					label="Excluir usuarios"
					kind="usuarios"
					selectedIds={values.exclude_user_ids}
					onChange={(ids) => setValues({ ...values, exclude_user_ids: ids })}
				/>
			</Field>
			<Field>
				<FieldLabel>Excluir negocios</FieldLabel>
				<IdPicker
					label="Excluir negocios"
					kind="negocios"
					selectedIds={values.exclude_user_ids}
					onChange={(ids) => setValues({ ...values, exclude_user_ids: ids })}
				/>
			</Field>
		</>
	);
}

function CampaignRowCard(props: {
	campaign: CampaignDto;
	templates: { id: string; name: string }[];
	segments: SegmentDto[];
	onSend: () => void;
	onCancel: () => void;
	onRemove: () => Promise<unknown>;
	onUpdate: (payload: unknown) => Promise<unknown>;
	onTest: (emails: string[]) => void;
	busy: boolean;
}) {
	const c = props.campaign;
	const [drawer, setDrawer] = useState<"edit" | "test" | null>(null);
	const [values, setValues] = useState<CampaignFormValues>(() =>
		campaignDefaults(c),
	);
	const statusVariant =
		c.status === "sent"
			? "default"
			: c.status === "failed" || c.status === "cancelled"
				? "destructive"
				: "secondary";

	return (
		<>
			<div className="flex items-center justify-between rounded-lg border p-3">
				<div>
					<p className="font-medium">{c.name}</p>
					<p className="text-sm text-muted-foreground">
						{c.category} · {c.total_sent}/{c.total_recipients} enviados ·{" "}
						{c.total_opened} abiertos
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant={statusVariant}>{c.status}</Badge>
					<Button
						size="sm"
						variant="outline"
						onClick={() => setDrawer("test")}
						disabled={props.busy}
					>
						Probar
					</Button>
					<Button
						size="sm"
						onClick={() => {
							setValues(campaignDefaults(c));
							setDrawer("edit");
						}}
						disabled={props.busy}
					>
						Editar
					</Button>
					{c.status === "draft" ||
					c.status === "scheduled" ||
					c.status === "failed" ? (
						<Button
							size="sm"
							variant="destructive"
							onClick={props.onSend}
							disabled={props.busy}
						>
							Enviar
						</Button>
					) : null}
					{c.status === "sending" || c.status === "scheduled" ? (
						<Button
							size="sm"
							variant="outline"
							onClick={props.onCancel}
							disabled={props.busy}
						>
							Cancelar envío
						</Button>
					) : null}
				</div>
			</div>

			{/* Drawer editar: formulario completo */}
			<Drawer
				open={drawer === "edit"}
				onOpenChange={(o) => setDrawer(o ? drawer : null)}
			>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Editar {c.name}</DrawerTitle>
					</DrawerHeader>
					<div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
						<CampaignFields
							values={values}
							setValues={setValues}
							templates={props.templates}
							segments={props.segments}
						/>
					</div>
					<DrawerFooter>
						<div className="flex w-full items-center justify-between">
							{c.status === "draft" ? (
								<Button
									type="button"
									variant="destructive"
									size="sm"
									disabled={props.busy}
									onClick={async () => {
										await props.onRemove();
										setDrawer(null);
									}}
								>
									Eliminar
								</Button>
							) : (
								<span />
							)}
							<div className="flex gap-2">
								<Button
									type="button"
									disabled={props.busy}
									onClick={async () => {
										await props.onUpdate({
											name: values.name,
											template_id: values.template_id || null,
											category: values.category,
											subject_override: values.subject_override || null,
											segment_ids: values.segment_ids,
											include_user_ids: values.include_user_ids,
											exclude_user_ids: values.exclude_user_ids,
											scheduled_at: values.scheduled_at || null,
										});
										setDrawer(null);
									}}
								>
									{props.busy ? <Spinner /> : null} Guardar cambios
								</Button>
								<DrawerClose>
									<Button variant="outline">Cancelar</Button>
								</DrawerClose>
							</div>
						</div>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>

			{/* Drawer probar: preview + envío de prueba */}
			<Drawer
				open={drawer === "test"}
				onOpenChange={(o) => setDrawer(o ? drawer : null)}
			>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Probar {c.name}</DrawerTitle>
					</DrawerHeader>
					<div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
						<CampaignDetailBody
							campaignId={c.id}
							onSent={() => {
								toast.success("Correo de prueba enviado");
								setDrawer(null);
							}}
							onError={(message) => toast.error(message)}
						/>
					</div>
					<DrawerFooter />
				</DrawerContent>
			</Drawer>
		</>
	);
}

function CampaignDetailBody(props: {
	campaignId: string;
	onSent?: () => void;
	onError?: (message: string) => void;
}) {
	const preview = usePreview("campaign");
	const test = useTestTemplate();
	const audience = useAudience();
	const [testEmails, setTestEmails] = useState("");

	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					variant="outline"
					onClick={() => preview.mutate(props.campaignId)}
				>
					{preview.isPending ? <Spinner /> : null} Preview
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={() => audience.mutate(props.campaignId)}
				>
					{audience.isPending ? <Spinner /> : null} Calcular alcance
				</Button>
				{audience.data ? (
					<Badge variant={audience.data.total > 0 ? "default" : "destructive"}>
						Llegaría a {audience.data.total} destinatarios
					</Badge>
				) : null}
			</div>
			{preview.data ? (
				<iframe
					title="preview"
					srcDoc={preview.data.html}
					className="h-96 w-full rounded-lg border bg-white"
				/>
			) : null}
			<Field>
				<FieldLabel>Emails de prueba (coma separados)</FieldLabel>
				<Input
					value={testEmails}
					onChange={(e) => setTestEmails(e.target.value)}
					placeholder="tu@correo.com, socio@correo.com"
				/>
			</Field>
			<Button
				size="sm"
				variant="outline"
				onClick={() =>
					test.mutate(
						{
							id: props.campaignId,
							emails: testEmails
								.split(",")
								.map((s) => s.trim())
								.filter(Boolean),
						},
						{
							onSuccess: (res) =>
								res.sent > 0
									? props.onSent?.()
									: props.onError?.(
											"Ningún correo pudo enviarse — revisa el remitente en Resend",
										),
							onError: (err) => props.onError?.(err.message),
						},
					)
				}
				disabled={!testEmails.trim() || test.isPending}
			>
				{test.isPending ? <Spinner /> : null} Enviar prueba
			</Button>
		</>
	);
}

/** Preview renderizado + envío de prueba real a un email. */
function TestPanel(props: {
	templateId: string;
	html: string;
	subject: string;
}) {
	const test = useTestTemplate();
	const [email, setEmail] = useState("");
	return (
		<div className="space-y-3">
			<p className="text-sm text-muted-foreground">
				Vista previa — asunto:{" "}
				<span className="font-medium">{props.subject}</span>
			</p>
			<iframe
				title="preview"
				srcDoc={props.html}
				className="h-96 w-full rounded-lg border bg-white"
			/>
			<div className="flex items-center gap-2">
				<Input
					className="max-w-sm"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="tu@correo.com"
					type="email"
				/>
				<Button
					size="sm"
					variant="outline"
					disabled={!email.includes("@") || test.isPending}
					onClick={() =>
						test.mutate(
							{ id: props.templateId, emails: [email.trim()] },
							{
								onSuccess: () => {
									toast.success("Correo de prueba enviado");
									setEmail("");
								},
								onError: (err) => toast.error(err.message),
							},
						)
					}
				>
					{test.isPending ? <Spinner /> : null} Enviar prueba
				</Button>
			</div>
		</div>
	);
}
