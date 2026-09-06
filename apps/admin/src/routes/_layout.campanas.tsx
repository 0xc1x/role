import {
	type CampaignDto,
	MARKETING_CATEGORIES,
	type SegmentDto,
} from "@0xc1x/role-commons";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
	emailListOptions,
	useAudience,
	useCampaignMutations,
	useEmailSegments,
	useEmailTemplates,
	usePreview,
	useTestTemplate,
} from "@/features/email/queries/emails.queries";

export const Route = createFileRoute("/_layout/campanas")({
	component: CampaignsPage,
	head: () => ({ meta: [{ title: "Campañas de Marketing | Rolé" }] }),
});

function CampaignsPage() {
	const list = useQuery(emailListOptions.campaigns({ limit: 50 }));
	const templates = useEmailTemplates();
	const segments = useEmailSegments();
	const mutations = useCampaignMutations();

	if (list.isLoading || templates.isLoading) return <Loading />;

	const campaigns = list.data?.data ?? [];

	return (
		<div className="px-6 py-4">
			<h1 className="font-bold text-xl">Campañas de Marketing</h1>
			<div className="mt-6 space-y-6">
				<div className="flex items-center justify-end">
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
						onSend={() =>
							mutations.send.mutate(c.id, {
								onError: (err) =>
									toast.error(
										err instanceof Error ? err.message : "Error inesperado",
									),
							})
						}
						onCancel={() =>
							mutations.cancel.mutate(c.id, {
								onError: (err) =>
									toast.error(
										err instanceof Error ? err.message : "Error inesperado",
									),
							})
						}
						onRemove={() => mutations.remove.mutateAsync(c.id)}
						onUpdate={(payload) =>
							mutations.update.mutateAsync({ id: c.id, body: payload })
						}
						onTest={(emails) =>
							mutations.test.mutate(
								{ id: c.id, emails },
								{
									onError: (err) =>
										toast.error(
											err instanceof Error ? err.message : "Error inesperado",
										),
								},
							)
						}
						busy={
							mutations.send.isPending ||
							mutations.cancel.isPending ||
							mutations.test.isPending ||
							mutations.update.isPending
						}
					/>
				))}
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

// ─── campañas ─────────────────────────────────────────────────────────

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
						No hay segmentos de categoría "{values.category}". Créalos en
						Notificaciones → Mail → Segmentos.
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
										try {
											await props.onRemove();
											setDrawer(null);
										} catch (err) {
											toast.error(
												err instanceof Error ? err.message : "Error inesperado",
											);
										}
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
										try {
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
										} catch (err) {
											toast.error(
												err instanceof Error ? err.message : "Error inesperado",
											);
										}
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
