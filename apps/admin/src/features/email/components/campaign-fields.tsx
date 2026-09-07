import {
	MARKETING_CATEGORIES,
	type MarketingCategory,
	type SegmentDto,
} from "@0xc1x/role-commons";
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
import { IdPicker } from "@/features/email/components/id-picker";
import type { CampaignFormValues } from "@/features/email/forms/campaign-forms";

export function CampaignFields({
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
							if (v) setValues({ ...values, category: v as MarketingCategory });
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
				<FieldLabel>Segmentos destinatarios</FieldLabel>
				{matchingSegments.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No hay segmentos de categoría "{values.category}". Créalos en la
						opción Segmentos de Campañas de Marketing.
					</p>
				) : null}
				<div className="space-y-1.5">
					{matchingSegments.map((s) => {
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
