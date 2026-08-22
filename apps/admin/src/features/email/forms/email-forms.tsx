import {
	type EmailComponentDto,
	type EmailTemplateDto,
	MARKETING_CATEGORIES,
	SEGMENT_FILTER_FIELDS,
	SEGMENT_TYPES,
	type SegmentDto,
	SegmentFiltersSchema,
} from "@0xc1x/role-commons";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { IdPicker } from "../components/id-picker";

// ─── Plantilla ────────────────────────────────────────────────────────

export function TemplateFields({
	values,
	setValues,
	components,
}: {
	values: TemplateFormValues;
	setValues: (v: TemplateFormValues) => void;
	components: EmailComponentDto[];
}) {
	const headers = components.filter((c) => c.type === "header");
	const footers = components.filter((c) => c.type === "footer");
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
				<FieldLabel>Asunto (admite {"{{variables}}"})</FieldLabel>
				<Input
					value={values.subject}
					onChange={(e) => setValues({ ...values, subject: e.target.value })}
					placeholder="Novedades de Rolé, {{nombre}}"
				/>
			</Field>
			<div className="grid grid-cols-2 gap-4">
				<Field>
					<FieldLabel>Header</FieldLabel>
					<Select
						value={values.header_id ?? "none"}
						onValueChange={(v) =>
							setValues({ ...values, header_id: v === "none" ? null : v })
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">Sin header</SelectItem>
							{headers.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{c.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Field>
					<FieldLabel>Footer</FieldLabel>
					<Select
						value={values.footer_id ?? "none"}
						onValueChange={(v) =>
							setValues({ ...values, footer_id: v === "none" ? null : v })
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">Sin footer</SelectItem>
							{footers.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{c.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
			</div>
			<Field>
				<FieldLabel>Cuerpo HTML</FieldLabel>
				<Textarea
					rows={14}
					className="font-mono text-xs"
					value={values.body_html}
					onChange={(e) => setValues({ ...values, body_html: e.target.value })}
					placeholder="<h1>Hola {{nombre}}</h1>"
				/>
			</Field>
			<Field>
				<FieldLabel>
					Variables disponibles (separadas por coma, informativo)
				</FieldLabel>
				<Input
					value={values.variables.join(", ")}
					onChange={(e) =>
						setValues({
							...values,
							variables: e.target.value
								.split(",")
								.map((v) => v.trim())
								.filter(Boolean),
						})
					}
					placeholder="nombre, empresa"
				/>
			</Field>
			<Field className="flex flex-row items-center gap-3">
				<Switch
					id="template-active"
					checked={values.is_active}
					onCheckedChange={(checked) =>
						setValues({ ...values, is_active: checked })
					}
				/>
				<FieldLabel htmlFor="template-active" className="font-normal">
					{values.is_active ? "Activa" : "Inactiva"}
				</FieldLabel>
			</Field>
		</>
	);
}

export interface TemplateFormValues {
	name: string;
	subject: string;
	body_html: string;
	header_id: string | null;
	footer_id: string | null;
	variables: string[];
	is_active: boolean;
}

export function templateDefaults(t?: EmailTemplateDto): TemplateFormValues {
	return {
		name: t?.name ?? "",
		subject: t?.subject ?? "",
		body_html: t?.body_html ?? "",
		header_id: t?.header_id ?? null,
		footer_id: t?.footer_id ?? null,
		variables: t?.variables ?? [],
		is_active: t?.is_active ?? true,
	};
}

// ─── Segmento ─────────────────────────────────────────────────────────

export interface SegmentFormValues {
	name: string;
	description: string;
	type: "static" | "dynamic";
	filtersJson: string;
	category: string;
	user_ids: string[];
	is_active: boolean;
}

export function SegmentFields({
	values,
	setValues,
}: {
	values: SegmentFormValues;
	setValues: (v: SegmentFormValues) => void;
}) {
	const parseError =
		values.type === "dynamic" && values.filtersJson.trim()
			? (() => {
					try {
						const parsed = JSON.parse(values.filtersJson);
						const result = SegmentFiltersSchema.safeParse(parsed);
						return result.success
							? null
							: (result.error.issues[0]?.message ?? "JSON inválido");
					} catch {
						return "JSON inválido";
					}
				})()
			: null;

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
				<FieldLabel>Categoría</FieldLabel>
				<Select
					value={values.category}
					onValueChange={(v) => {
						if (!v) return;
						setValues({
							...values,
							category: v,
							// Cambiar categoría limpia la selección para evitar
							// mezclar usuarios que no cumplen la nueva.
							user_ids: [],
						});
					}}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{MARKETING_CATEGORIES.map((c) => (
							<SelectItem key={c} value={c}>
								{c}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<Field>
				<FieldLabel>Tipo</FieldLabel>
				<Select
					value={values.type}
					onValueChange={(v) =>
						setValues({ ...values, type: v as SegmentFormValues["type"] })
					}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{SEGMENT_TYPES.map((t) => (
							<SelectItem key={t} value={t}>
								{t === "static"
									? "Estático (lista de usuarios)"
									: "Dinámico (filtros)"}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			{values.type === "dynamic" ? (
				<Field data-invalid={Boolean(parseError)}>
					<FieldLabel>
						Filtros JSON — campos: {SEGMENT_FILTER_FIELDS.join(", ")}
					</FieldLabel>
					<Textarea
						rows={5}
						className="font-mono text-xs"
						value={values.filtersJson}
						onChange={(e) =>
							setValues({ ...values, filtersJson: e.target.value })
						}
						placeholder={`{"and":[{"field":"city","op":"eq","value":"Quito"}]}`}
					/>
					{parseError && <FieldError errors={[{ message: parseError }]} />}
				</Field>
			) : (
				<>
					<Field>
						<FieldLabel>Usuarios suscritos a "{values.category}"</FieldLabel>
						<IdPicker
							label="Usuarios"
							kind="usuarios"
							subscribedTo={values.category}
							selectedIds={values.user_ids}
							onChange={(ids) => setValues({ ...values, user_ids: ids })}
						/>
					</Field>
					<Field>
						<FieldLabel>Negocios</FieldLabel>
						<IdPicker
							label="Negocios"
							kind="negocios"
							selectedIds={values.user_ids}
							onChange={(ids) => setValues({ ...values, user_ids: ids })}
						/>
					</Field>
				</>
			)}
		</>
	);
}

export function segmentDefaults(s?: SegmentDto): SegmentFormValues {
	return {
		name: s?.name ?? "",
		description: s?.description ?? "",
		type: s?.type ?? "dynamic",
		filtersJson: s?.filters ? JSON.stringify(s.filters, null, 2) : "",
		category: s?.category ?? "announcements",
		user_ids: [],
		is_active: s?.is_active ?? true,
	};
}

// ─── Header / Footer ──────────────────────────────────────────────────

export interface ComponentFormValues {
	name: string;
	type: "header" | "footer";
	html_content: string;
	is_active: boolean;
}

export function ComponentFields({
	values,
	setValues,
}: {
	values: ComponentFormValues;
	setValues: (v: ComponentFormValues) => void;
}) {
	return (
		<>
			<Field>
				<FieldLabel>Nombre</FieldLabel>
				<Input
					value={values.name}
					onChange={(e) => setValues({ ...values, name: e.target.value })}
					placeholder="Header principal"
				/>
			</Field>
			<Field>
				<FieldLabel>Tipo</FieldLabel>
				<Select
					value={values.type}
					onValueChange={(v) =>
						setValues({
							...values,
							type: v as ComponentFormValues["type"],
						})
					}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="header">Header</SelectItem>
						<SelectItem value="footer">Footer</SelectItem>
					</SelectContent>
				</Select>
			</Field>
			<Field>
				<FieldLabel>HTML (usa estilos inline)</FieldLabel>
				<Textarea
					rows={10}
					className="font-mono text-xs"
					value={values.html_content}
					onChange={(e) =>
						setValues({ ...values, html_content: e.target.value })
					}
					placeholder="<table width='100%' bgcolor='#111'>…</table>"
				/>
			</Field>
			<Field className="flex flex-row items-center gap-3">
				<Switch
					id="component-active"
					checked={values.is_active}
					onCheckedChange={(checked) =>
						setValues({ ...values, is_active: checked })
					}
				/>
				<FieldLabel htmlFor="component-active" className="font-normal">
					{values.is_active ? "Activo" : "Inactivo"}
				</FieldLabel>
			</Field>
		</>
	);
}

export function componentDefaults(c?: EmailComponentDto): ComponentFormValues {
	return {
		name: c?.name ?? "",
		type: c?.type ?? "header",
		html_content: c?.html_content ?? "",
		is_active: c?.is_active ?? true,
	};
}
