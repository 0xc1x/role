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

export function PushCampaignFields({
	values,
	setValues,
	templates,
	segments,
}: {
	values: CampaignFormValues;
	setValues: (v: CampaignFormValues) => void;
	templates: Array<{ id: string; name: string; title: string; body: string }>;
	segments: SegmentDto[];
}) {
	// Solo segmentos de la misma categoría que la campaña.
	const matchingSegments = segments.filter(
		(s) => s.is_active && s.category === values.category,
	);
	const selectedTemplate = templates.find((t) => t.id === values.template_id);
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
				<FieldLabel>Plantilla push</FieldLabel>
				<Select
					value={values.template_id || undefined}
					onValueChange={(v) => {
						if (v) setValues({ ...values, template_id: v });
					}}
				>
					<SelectTrigger>
						<SelectValue placeholder="Elegir plantilla push" />
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
			{selectedTemplate ? (
				<div className="rounded-lg border p-3">
					<p className="text-sm font-medium">{selectedTemplate.title}</p>
					<p className="text-sm text-muted-foreground">
						{selectedTemplate.body}
					</p>
				</div>
			) : null}
			<Field>
				<FieldLabel>Categoría</FieldLabel>
				<Select
					value={values.category}
					onValueChange={(v) => {
						if (!v) return;
						setValues({
							...values,
							category: v as MarketingCategory,
							segment_ids: [],
						});
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
				{matchingSegments.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No hay segmentos activos de categoría "{values.category}". Créalos
						en la opción Segmentos de Campañas de Marketing.
					</p>
				) : (
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
				)}
			</Field>
			<Field>
				<FieldLabel>Incluir usuarios (con token push)</FieldLabel>
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
		</>
	);
}
