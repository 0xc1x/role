import type { SegmentDto } from "@0xc1x/role-commons";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
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

const TABS = ["plantillas", "componentes", "segmentos"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_layout/notificaciones/mails")({
	validateSearch: (raw: Record<string, unknown>): { tab?: Tab } => {
		const tab = typeof raw.tab === "string" ? raw.tab : undefined;
		return TABS.includes(tab as Tab) ? { tab: tab as Tab } : {};
	},
	component: MailsPage,
	head: () => ({ meta: [{ title: "Mails | Rolé" }] }),
});

function MailsPage() {
	const { tab: tabFromUrl } = Route.useSearch();
	const navigate = Route.useNavigate();
	const tab = tabFromUrl ?? "plantillas";
	const setTab = (t: Tab) => navigate({ search: { tab: t } });
	return (
		<div className="px-6 py-4">
			<h1 className="font-bold text-xl">Mails</h1>
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
		try {
			await props.onSubmit(values as never, props.row);
			setOpen(false);
			setValues(props.defaults(undefined));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Error inesperado");
		}
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
									onError: (err) =>
										toast.error(
											err instanceof Error ? err.message : "Error inesperado",
										),
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
								try {
									await props.onRemove();
									setConfirmOpen(false);
								} catch (err) {
									toast.error(
										err instanceof Error ? err.message : "Error inesperado",
									);
								}
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
