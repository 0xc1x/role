import type { PushNotificationDto, PushSendResult, PushTemplateDto } from "@0xc1x/role-commons";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Search, Send, Trash2 } from "lucide-react";
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
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { IdPicker } from "@/features/email/components/id-picker";
import {
	PushTemplateFields,
	type PushTemplateFormValues,
	pushTemplateDefaults,
	PushTypeSelect,
	type SendFormValues,
	sendDefaults,
} from "@/features/push-notifications/forms/push-forms";
import { hasAudience, toSendPayload } from "@/features/push-notifications/lib/to-send-payload";
import {
	pushListOptions,
	useEmailSegments,
	usePushAudience,
	usePushSend,
	usePushTemplateMutations,
	usePushTemplates,
	usePushTest,
	usePushTestTemplate,
} from "@/features/push-notifications/queries/push.queries";
import { historyColumns } from "@/features/push-notifications/tables/history-columns";
import { tokenColumns } from "@/features/push-notifications/tables/tokens-columns";
import { DataTable } from "@/components/data-table/data-table";

const TABS = ["enviar", "plantillas", "historial", "dispositivos"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_layout/notificaciones-push")({
	validateSearch: (raw: Record<string, unknown>): { tab?: Tab } => {
		const tab = typeof raw.tab === "string" ? raw.tab : undefined;
		return TABS.includes(tab as Tab) ? { tab: tab as Tab } : {};
	},
	component: PushPage,
	head: () => ({ meta: [{ title: "Notificaciones Push | Rolé" }] }),
});

function PushPage() {
	const { tab: tabFromUrl } = Route.useSearch();
	const navigate = Route.useNavigate();
	const tab = tabFromUrl ?? "enviar";
	const setTab = (t: Tab) =>
		navigate({ search: t === "enviar" ? {} : { tab: t } });

	return (
		<div className="px-6 py-4">
			<h1 className="font-bold text-xl">Notificaciones push</h1>
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
				{tab === "enviar" && <SendTab />}
				{tab === "plantillas" && <TemplatesTab />}
				{tab === "historial" && <HistoryTab />}
				{tab === "dispositivos" && <TokensTab />}
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
function FormDrawer<Row>(props: {
	title: string;
	createLabel: string;
	row?: Row;
	defaults: (row?: Row) => PushTemplateFormValues;
	fields: (ctx: {
		values: PushTemplateFormValues;
		setValues: (v: PushTemplateFormValues) => void;
	}) => React.ReactNode;
	toPayload: (values: PushTemplateFormValues) => unknown;
	onSubmit: (payload: unknown, row?: Row) => Promise<unknown>;
	isPending?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [resetKey, setResetKey] = useState(0);
	const [values, setValues] = useState<PushTemplateFormValues>(() =>
		props.defaults(props.row),
	);

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
			<DrawerTrigger render={<Button size={props.row ? "icon" : undefined} variant={props.row ? "ghost" : undefined} />}>
				{props.row ? <Pencil className="size-4" /> : <Plus />}{" "}
				{props.row ? null : props.createLabel}
			</DrawerTrigger>
			<DrawerContent key={resetKey}>
				<DrawerHeader>
					<DrawerTitle>{props.title}</DrawerTitle>
				</DrawerHeader>
				<div className="space-y-4 overflow-y-auto p-4 max-h-[70vh]">
					{open ? props.fields({ values, setValues }) : null}
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

// ─── Tab: enviar ──────────────────────────────────────────────────────

function SendTab() {
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
		const link = ((t?.data as Record<string, unknown> | undefined)?.link as string) ?? "";
		setValues({
			...values,
			template_id: templateId,
			title: t?.title ?? values.title,
			body: t?.body ?? values.body,
			link: link || values.link,
		});
	};

	const ready = hasAudience(values) && values.title.trim() && values.body.trim();

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
						{(segments.data?.data ?? []).filter((s) => s.is_active).map((s) => {
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
					<FieldLabel>Incluir usuarios</FieldLabel>
					<IdPicker
						label="Incluir usuarios"
						kind="usuarios"
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
						<Badge variant={audience.data.total > 0 ? "default" : "destructive"}>
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
						<Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!ready}>
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
						<AlertDialogAction
							onClick={confirmSend}
							disabled={send.isPending}
						>
							{send.isPending ? <Spinner /> : null} Enviar
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

/** Drawer de envío de prueba: elige usuarios destinatarios del test. */
function SendTestDrawer(props: {
	open: boolean;
	onClose: () => void;
	title: string;
	body: string;
	type: string;
	test: ReturnType<typeof usePushTest>;
}) {
	const [testUsers, setTestUsers] = useState<string[]>([]);
	const [result, setResult] = useState<PushSendResult | null>(null);

	const send = async () => {
		const res = await props.test.mutateAsync({
			user_ids: testUsers,
			title: props.title,
			body: props.body,
			type: props.type as never,
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
				<div className="space-y-4 overflow-y-auto p-4 max-h-[70vh]">
					<p className="text-sm text-muted-foreground">
						La prueba llega directo a los dispositivos de los usuarios
						elegidos, sin pasar por preferencias ni horario de silencio, y no
						se registra en el historial.
					</p>
					<Field>
						<FieldLabel>Usuarios de prueba (máx. 10)</FieldLabel>
						<IdPicker
							label="Usuarios"
							kind="usuarios"
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
				</div>
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

function TemplatesTab() {
	const list = usePushTemplates();
	const mutations = usePushTemplateMutations();
	const test = usePushTestTemplate();
	const [testing, setTesting] = useState<PushTemplateDto | null>(null);
	const [deleting, setDeleting] = useState<PushTemplateDto | null>(null);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="font-bold text-lg">Plantillas de push</h2>
				<FormDrawer
					title="Nueva plantilla"
					createLabel="Crear plantilla"
					defaults={() => pushTemplateDefaults()}
					fields={({ values, setValues }) => (
						<PushTemplateFields values={values} setValues={setValues} />
					)}
					toPayload={(v) => ({
						name: v.name,
						title: v.title,
						body: v.body,
						is_active: v.is_active,
						data: v.link.trim() ? { link: v.link.trim() } : {},
					})}
					onSubmit={(payload) => mutations.create.mutateAsync(payload)}
					isPending={mutations.create.isPending}
				/>
			</div>
			{list.isLoading ? <Loading /> : null}
			{(list.data?.data ?? []).map((t) => {
				const link = ((t.data as Record<string, unknown> | undefined)?.link as string) ?? "";
				return (
				<div
					key={t.id}
					className="flex items-center justify-between rounded-lg border p-3"
				>
					<div className="min-w-0">
						<p className="font-medium">{t.name}</p>
						<p className="truncate text-sm text-muted-foreground">
							{t.title} — {t.body}
						</p>
						{link ? <p className="truncate text-xs text-muted-foreground">↗ {link}</p> : null}
					</div>
					<div className="flex items-center gap-2">
						<Badge variant={t.is_active ? "default" : "secondary"}>
							{t.is_active ? "activa" : "inactiva"}
						</Badge>
						<Button size="sm" variant="outline" onClick={() => setTesting(t)}>
							Probar
						</Button>
						<FormDrawer
							title={`Editar ${t.name}`}
							createLabel=""
							row={t}
							defaults={pushTemplateDefaults}
							fields={({ values, setValues }) => (
								<PushTemplateFields values={values} setValues={setValues} />
							)}
							toPayload={(v) => ({
								name: v.name,
								title: v.title,
								body: v.body,
								is_active: v.is_active,
								data: v.link.trim() ? { link: v.link.trim() } : {},
							})}
							onSubmit={(payload) =>
								mutations.update.mutateAsync({ id: t.id, body: payload })
							}
							isPending={mutations.update.isPending}
						/>
						<Button
							size="sm"
							variant="ghost"
							className="text-destructive"
							onClick={() => setDeleting(t)}
						>
							<Trash2 className="size-4" />
						</Button>
					</div>
				</div>
				);
			})}

			{testing ? (
				<TemplateTestDrawer
					template={testing}
					test={test}
					onClose={() => setTesting(null)}
				/>
			) : null}

			<AlertDialog
				open={Boolean(deleting)}
				onOpenChange={(o) => !o && setDeleting(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Eliminar la plantilla "{deleting?.name}"?
						</AlertDialogTitle>
						<AlertDialogDescription>
							La plantilla se elimina y deja de aparecer en la lista. Esta
							acción no se puede deshacer.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								if (!deleting) return;
								try {
									await mutations.remove.mutateAsync(deleting.id);
									setDeleting(null);
								} catch (err) {
									toast.error(
										err instanceof Error ? err.message : "Error inesperado",
									);
								}
							}}
						>
							{mutations.remove.isPending ? <Spinner /> : null} Eliminar
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function TemplateTestDrawer(props: {
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
				body: { user_ids: testUsers, title: props.template.title, body: props.template.body, type: "announcement" },
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
				<div className="space-y-4 overflow-y-auto p-4 max-h-[70vh]">
					<Field>
						<FieldLabel>Usuarios de prueba (máx. 10)</FieldLabel>
						<IdPicker
							label="Usuarios"
							kind="usuarios"
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
				</div>
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

function HistoryTab() {
	const [page, setPage] = useState(1);
	const [limit, setLimit] = useState(20);
	const [search, setSearch] = useState("");
	const [type, setType] = useState<string>("all");
	const { data, isLoading } = useQuery(
		pushListOptions.history({
			page,
			limit,
			search: search || undefined,
			type: type === "all" ? undefined : type,
		}),
	);

	if (isLoading) return <Loading />;
	const rows: PushNotificationDto[] = data?.data ?? [];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between flex-wrap gap-2">
				<h2 className="font-bold text-lg">Historial de envíos</h2>
				<div className="flex items-center gap-2">
					<Select
						value={type}
						onValueChange={(v) => {
							if (!v) return;
							setType(v);
							setPage(1);
						}}
					>
						<SelectTrigger className="w-36">
							<SelectValue placeholder="Tipo" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos tipos</SelectItem>
							<SelectItem value="announcement">announcement</SelectItem>
							<SelectItem value="promo">promo</SelectItem>
							<SelectItem value="system">system</SelectItem>
						</SelectContent>
					</Select>
					<InputGroup className="max-w-sm">
						<InputGroupAddon align="inline-start">
							<Search className="size-4 text-muted-foreground" />
						</InputGroupAddon>
						<InputGroupInput
							placeholder="Buscar título..."
							value={search}
							onChange={(e) => {
								setSearch(e.target.value);
								setPage(1);
							}}
						/>
					</InputGroup>
				</div>
			</div>
			<DataTable
				columns={historyColumns}
				data={rows}
				meta={data?.meta}
				onPageChange={setPage}
				onLimitChange={(l) => {
					setLimit(l);
					setPage(1);
				}}
			/>
		</div>
	);
}

// ─── Tab: dispositivos ────────────────────────────────────────────────

function TokensTab() {
	const [page, setPage] = useState(1);
	const [limit, setLimit] = useState(20);
	const [search, setSearch] = useState("");
	const [platform, setPlatform] = useState<string>("all");
	const { data, isLoading } = useQuery(
		pushListOptions.tokens({
			page,
			limit,
			search: search || undefined,
			platform: platform === "all" ? undefined : platform,
		}),
	);

	if (isLoading) return <Loading />;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between flex-wrap gap-2">
				<h2 className="font-bold text-lg">Dispositivos registrados</h2>
				<div className="flex items-center gap-2">
					<Select
						value={platform}
						onValueChange={(v) => {
							if (!v) return;
							setPlatform(v);
							setPage(1);
						}}
					>
						<SelectTrigger className="w-36">
							<SelectValue placeholder="Plataforma" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todas</SelectItem>
							<SelectItem value="ios">ios</SelectItem>
							<SelectItem value="android">android</SelectItem>
							<SelectItem value="web">web</SelectItem>
						</SelectContent>
					</Select>
					<InputGroup className="max-w-sm">
						<InputGroupAddon align="inline-start">
							<Search className="size-4 text-muted-foreground" />
						</InputGroupAddon>
						<InputGroupInput
							placeholder="Buscar usuario o token..."
							value={search}
							onChange={(e) => {
								setSearch(e.target.value);
								setPage(1);
							}}
						/>
					</InputGroup>
				</div>
			</div>
			<DataTable
				columns={tokenColumns}
				data={data?.data ?? []}
				meta={data?.meta}
				onPageChange={setPage}
				onLimitChange={(l) => {
					setLimit(l);
					setPage(1);
				}}
			/>
		</div>
	);
}
