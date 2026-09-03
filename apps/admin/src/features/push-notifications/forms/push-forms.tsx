import { type PushTemplateDto, PUSH_NOTIFICATION_TYPES } from "@0xc1x/role-commons";
import { Field, FieldLabel } from "@/components/ui/field";
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

// ─── Plantilla de push ────────────────────────────────────────────────

export interface PushTemplateFormValues {
	name: string;
	title: string;
	body: string;
	link: string;
	is_active: boolean;
}

export function PushTemplateFields({
	values,
	setValues,
}: {
	values: PushTemplateFormValues;
	setValues: (v: PushTemplateFormValues) => void;
}) {
	return (
		<>
			<Field>
				<FieldLabel>Nombre</FieldLabel>
				<Input
					value={values.name}
					onChange={(e) => setValues({ ...values, name: e.target.value })}
					placeholder="Bienvenida"
				/>
			</Field>
			<Field>
				<FieldLabel>Título (admite {"{{nombre}}"})</FieldLabel>
				<Input
					value={values.title}
					onChange={(e) => setValues({ ...values, title: e.target.value })}
					placeholder="¡Hola {{nombre}}!"
					maxLength={120}
				/>
			</Field>
			<Field>
				<FieldLabel>Cuerpo (máx. 500 caracteres)</FieldLabel>
				<Textarea
					rows={4}
					value={values.body}
					onChange={(e) => setValues({ ...values, body: e.target.value })}
					placeholder="Nueva oferta cerca de ti. ¡Pídela antes de que se agote!"
					maxLength={500}
				/>
			</Field>
			<Field>
				<FieldLabel>Link de destino (opcional, ruta de la app)</FieldLabel>
				<Input
					value={values.link}
					onChange={(e) => setValues({ ...values, link: e.target.value })}
					placeholder="/all-offers"
				/>
				<p className="text-xs text-muted-foreground">
					Ej: /all-offers, /all-businesses o /. Vacío = inicio.
				</p>
			</Field>
			<Field className="flex flex-row items-center gap-3">
				<Switch
					id="push-template-active"
					checked={values.is_active}
					onCheckedChange={(checked) =>
						setValues({ ...values, is_active: checked })
					}
				/>
				<FieldLabel htmlFor="push-template-active" className="font-normal">
					{values.is_active ? "Activa" : "Inactiva"}
				</FieldLabel>
			</Field>
		</>
	);
}

export function pushTemplateDefaults(t?: PushTemplateDto): PushTemplateFormValues {
	return {
		name: t?.name ?? "",
		title: t?.title ?? "",
		body: t?.body ?? "",
		link: ((t?.data as Record<string, unknown> | undefined)?.link as string) ?? "",
		is_active: t?.is_active ?? true,
	};
}

// ─── Envío manual ─────────────────────────────────────────────────────

export interface SendFormValues {
	template_id: string;
	title: string;
	body: string;
	type: string;
	link: string;
	segment_ids: string[];
	include_user_ids: string[];
	exclude_user_ids: string[];
}

export function sendDefaults(): SendFormValues {
	return {
		template_id: "",
		title: "",
		body: "",
		type: "announcement",
		link: "",
		segment_ids: [],
		include_user_ids: [],
		exclude_user_ids: [],
	};
}

/** Selector de tipo reutilizado por el formulario de envío y el de prueba. */
export function PushTypeSelect({
	value,
	onChange,
}: {
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<Select value={value} onValueChange={(v) => v && onChange(v)}>
			<SelectTrigger>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{PUSH_NOTIFICATION_TYPES.map((t) => (
					<SelectItem key={t} value={t}>
						{t}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
