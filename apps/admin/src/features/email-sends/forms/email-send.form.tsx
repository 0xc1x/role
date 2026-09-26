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
import { formatApiError } from "@/lib/api/notify";
import { useUpdateEmailSend } from "../queries/email-sends.queries";

/** Campos mutables según el contrato (UpdateEmailSendSchema → PATCH /email-marketing/sends/:id). */
const schema = z.object({
	status: z.enum(EMAIL_SEND_STATUSES),
});
/**
 * Contexto de solo lectura: el contrato no permite escribir estos campos.
 *
 * `error_message` se muestra pero NO se edita, y `UpdateEmailSendSchema` lo
 * hace imposible: es `strict` y no declara el campo, así que un PATCH que lo
 * lleve es un 400. Antes el textarea libre devolvía por la puerta de atrás la
 * fuga que a7fac68 cerró en el camino de fallo del servidor: el operador
 * escribía a mano el texto crudo de Resend y el PATCH lo persistía. Para limpiar
 * el valor está `POST /sends/:id/retry`, que lo pone a null.
 *
 * LO QUE MUESTRA LA FILA, con precisión: en los envíos fallidos DESDE a7fac68
 * el valor es la huella acotada del fallo (`safeErrorSummary`, p. ej. `Error` o
 * `NotFoundException:E42`). En las filas anteriores a ese commit NO hay backfill:
 * el valor sigue siendo el texto crudo que devolvió Resend, que ese mismo
 * commit definió como potencialmente sensible. Por eso la etiqueta dice
 * "Detalle del error del servidor" y no "Huella": para una fila antigua no es
 * una huella, y prometer una redacción que no ocurrió sería mentir sobre el
 * estado real de los datos. La redacción de esas filas es una migración escrita
 * y NO aplicada:
 * `supabase/migrations/20260926041000_email_sends_redact_legacy_error_message.sql`.
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
		["Detalle del error del servidor", send.error_message ?? "—"],
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

	// El error de la mutación YA se renderiza aquí, así que no lleva un
	// `onError` con toast (serían dos avisos del mismo fallo). Lo que le faltaba
	// era el `requestId`: sin él, soporte no podía correlacionar un 400 de
	// validación con la petición en los logs del servidor. El guard es
	// imprescindible: `formatApiError(null)` devuelve texto, y sin él el drawer
	// mostraría "Error inesperado" antes de que la mutación falle alguna vez.
	const formError = updateMutation.error
		? formatApiError(updateMutation.error)
		: null;

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
			{formError && <p className="text-sm text-destructive">{formError}</p>}

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
