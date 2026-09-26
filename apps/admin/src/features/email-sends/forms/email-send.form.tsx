import {
	EMAIL_SEND_STATUSES,
	type EmailSendDto,
	type EmailSendStatus,
	UpdateEmailSendSchema,
} from "@0xc1x/role-commons";
import { useForm } from "@tanstack/react-form";
import { Fragment } from "react";
import { z } from "zod";
import { useReportDrawerPending } from "@/components/resource/resource-drawer";
import { Field, FieldLabel } from "@/components/ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ApiClientError } from "@/lib/api/errors";
import { useUpdateEmailSend } from "../queries/email-sends.queries";

/** Campos mutables según el contrato (UpdateEmailSendSchema → PATCH /email-marketing/sends/:id). */
const schema = z.object({
	status: z.enum(EMAIL_SEND_STATUSES),
});
/**
 * Contexto de solo lectura: el API ignora estos campos en el PATCH.
 *
 * `error_message` se muestra pero NO se edita. Desde a7fac68 la API escribe ahí
 * la huella acotada del fallo (`safeErrorSummary`) en vez del texto crudo de
 * Resend, precisamente porque ese texto podía traer la API key o el email del
 * destinatario. Un textarea libre devolvía esa fuga por la puerta de atrás: el
 * operador escribía a mano lo que el servidor ya tenía que redimir, y el
 * PATCH lo persistía. Para limpiarlo está `POST /sends/:id/retry`, que lo
 *pone a null.
 */
function ReadOnlyInfo({ send }: { send: EmailSendDto }) {
	const rows: Array<[label: string, value: string]> = [
		["Email", send.email],
		["Tipo", send.type],
		[
			"Origen",
			send.source_type ? `${send.source_type} · ${send.source_id ?? "—"}` : "—",
		],
		["Intentos", `${send.attempts} / ${send.max_attempts}`],
		["Huella del error", send.error_message ?? "—"],
	];

	return (
		<div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border bg-muted/40 p-3 text-sm">
			{rows.map(([label, value]) => (
				<Fragment key={label}>
					<span className="text-muted-foreground">{label}</span>
					<span className="break-all">{value}</span>
				</Fragment>
			))}
		</div>
	);
}

export function EmailSendForm({
	formId,
	onSuccess,
	send,
}: {
	formId: string;
	onSuccess?: () => void;
	send: EmailSendDto;
}) {
	const updateMutation = useUpdateEmailSend();
	useReportDrawerPending(updateMutation.isPending);
	const form = useForm({
		defaultValues: {
			status: send.status,
		},
		validators: { onSubmit: schema },
		onSubmit: async ({ value }) => {
			// Valida contra el contrato antes de enviar.
			const body = UpdateEmailSendSchema.parse({ status: value.status });
			await updateMutation.mutateAsync({
				id: send.id,
				body,
			});
			onSuccess?.();
		},
	});

	const formError = updateMutation.error;

	return (
		<form
			id={formId}
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="space-y-4"
		>
			{formError && (
				<p className="text-sm text-destructive">
					{formError instanceof ApiClientError
						? formError.message
						: formError instanceof Error
							? formError.message
							: "Error inesperado"}
				</p>
			)}

			<ReadOnlyInfo send={send} />

			<form.Field name="status">
				{(field) => (
					<Field>
						<FieldLabel>Estado</FieldLabel>
						<Select
							value={field.state.value}
							onValueChange={(v) => field.handleChange(v as EmailSendStatus)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{EMAIL_SEND_STATUSES.map((s) => (
									<SelectItem key={s} value={s}>
										{s}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
				)}
			</form.Field>
		</form>
	);
}
