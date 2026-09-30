import {
	type HideReviewDto,
	HideReviewFormSchema,
	isReviewModerationReason,
	REVIEW_MODERATION_REASON_LABELS,
	REVIEW_MODERATION_REASON_NEEDS_DETAIL,
	REVIEW_MODERATION_REASONS,
	SIN_MOTIVO,
} from "@0xc1x/role-commons";
import { useForm, useStore } from "@tanstack/react-form";
import { useEffect, useId } from "react";
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
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

/**
 * Confirmación de "ocultar reseña", con el motivo DECLARADO y el detalle libre.
 *
 * NO reusa `ConfirmDeleteDialog`: su copy habla de borrado y de algo que no se
 * puede deshacer, y acá no se borra nada. La reseña se conserva —para que el
 * `UNIQUE(user_id, order_id)` siga impidiendo que el autor la vuelva a publicar
 * y para que quede el registro de la decisión—, y la moderación es reversible
 * desde este mismo panel. Un "esto no se puede deshacer" sobre una acción que sí
 * se puede revertir descarta al operador sin causa.
 *
 * El flujo es motivo primero, detalle después, y el detalle solo se vuelve
 * obligatorio cuando el motivo es `other`. No es una comodidad de formulario: el
 * token es el registro de apelación —"se retiró por insultos y lenguaje de odio"—
 * y el texto libre es el contexto. Exigir el párrafo para todos los casos solo
 * haría que el operador parafraseara la etiqueta.
 *
 * El requisito condicional se DICE en pantalla (la ayuda del campo y el asterisco
 * del rótulo cambian al elegir `other`), no solo se aplica al confirmar: un
 * requisito que aparece únicamente como error es un requisito que el operador
 * descubre después de escribir todo lo demás.
 *
 * La validación es `HideReviewFormSchema`, que viene de commons: el `.trim()`, el
 * tope de 500 y la regla de `other` no están re-declarados acá, y el `.trim()` lo
 * aplica además el servidor. El panel no reescribe lo que el operador escribió.
 */
export function HideReviewDialog({
	open,
	onOpenChange,
	onConfirm,
	isPending,
	authorName,
	businessName,
	comment,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (input: HideReviewDto) => void;
	isPending: boolean;
	authorName: string | null;
	businessName: string | null;
	comment: string | null;
}) {
	const formId = useId();

	const form = useForm({
		defaultValues: {
			moderation_reason: SIN_MOTIVO,
			hidden_reason: "",
		},
		// `onSubmit` y no `onChange`: el error tiene que aparecer cuando el
		// operador intenta confirmar, no mientras todavía no ha escrito nada.
		validators: { onSubmit: HideReviewFormSchema },
		onSubmit: ({ value }) => {
			// El refinamiento de arriba rechaza `SIN_MOTIVO`, así que acá ya no es un
			// token pendiente sino un motivo elegido. El narrowing deja explícita esa
			// garantía, en vez de dejarla en un `as` que nadie verifica.
			// `HideReviewFormSchema` ya rechazó el estado "sin elegir" al validar;
			// el guard solo convierte el `string` del formulario en el token del
			// contrato, sin un `as` que nadie verifica. Un token desconocido sería
			// un no-hacer en vez de un PATCH con un motivo que el servidor no pidió.
			if (!isReviewModerationReason(value.moderation_reason)) return;
			onConfirm({
				moderation_reason: value.moderation_reason,
				// Detalle vacío es AUSENCIA de detalle: mandarlo como "" dejaría una
				// columna con un espacio y un registro que dice que se escribió algo.
				hidden_reason: value.hidden_reason || undefined,
			});
		},
	});

	// `useStore` y no `form.state`: leer el estado completo del form haría que
	// este componente se re-renderice con CADA tecla del detalle, y el selector
	// (que abre un popup en un portal) no necesita ese trabajo.
	const motivoElegido = useStore(form.store, (s) => s.values.moderation_reason);
	const detalleObligatorio =
		motivoElegido === REVIEW_MODERATION_REASON_NEEDS_DETAIL;

	// Los motivos son de la ACCIÓN, no del registro: si se abre el diálogo para
	// otra reseña, la elección del anterior no puede quedar ahí esperando ser
	// confirmada.
	useEffect(() => {
		if (open) form.reset();
	}, [open, form]);

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>¿Ocultar esta reseña?</AlertDialogTitle>
					<AlertDialogDescription>
						La reseña de{" "}
						{authorName ? <b>{authorName}</b> : "una persona sin nombre"}
						{comment ? <> — «{comment}»</> : null}{" "}
						{businessName ? (
							<>
								en <b>{businessName}</b>{" "}
							</>
						) : null}
						dejará de verse en la página del negocio y en el móvil.{" "}
						<b>No se borra</b>: la fila se conserva para que quede registrado
						por qué se ocultó, la persona no puede volver a publicar la misma
						reseña, y la moderación se puede revertir desde acá.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						void form.handleSubmit();
					}}
				>
					<form.Field name="moderation_reason">
						{(field) => {
							const isInvalid =
								field.state.meta.isTouched && !field.state.meta.isValid;
							return (
								<Field data-invalid={isInvalid} className="pt-4">
									<FieldLabel htmlFor={`${formId}-motivo`}>
										Motivo del ocultamiento
									</FieldLabel>
									<Select
										value={field.state.value || null}
										onValueChange={(v) => {
											if (v && isReviewModerationReason(v))
												field.handleChange(v);
											field.handleBlur();
										}}
									>
										<SelectTrigger
											id={`${formId}-motivo`}
											className="w-full"
											aria-invalid={isInvalid}
										>
											{/* Con children explícitos: sin ellos el trigger muestra
											    el token crudo en vez de la etiqueta. */}
											<SelectValue placeholder="Elige un motivo">
												{isReviewModerationReason(field.state.value)
													? REVIEW_MODERATION_REASON_LABELS[field.state.value]
													: "Elige un motivo"}
											</SelectValue>
										</SelectTrigger>
										<SelectContent>
											{REVIEW_MODERATION_REASONS.map((reason) => (
												<SelectItem key={reason} value={reason}>
													{REVIEW_MODERATION_REASON_LABELS[reason]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FieldDescription>
										Es el motivo que queda registrado como respuesta a una
										apelación del negocio.
									</FieldDescription>
									{isInvalid ? (
										<FieldError
											errors={field.state.meta.errors}
											aria-live="polite"
										/>
									) : null}
								</Field>
							);
						}}
					</form.Field>

					<form.Field name="hidden_reason">
						{(field) => {
							const isInvalid =
								field.state.meta.isTouched && !field.state.meta.isValid;
							return (
								<Field data-invalid={isInvalid} className="pt-4">
									<FieldLabel htmlFor={`${formId}-detalle`}>
										Detalle
										{detalleObligatorio ? (
											<span aria-hidden="true"> *</span>
										) : null}
									</FieldLabel>
									<Textarea
										id={`${formId}-detalle`}
										value={field.state.value}
										aria-invalid={isInvalid}
										aria-required={detalleObligatorio}
										required={detalleObligatorio}
										placeholder={
											detalleObligatorio
												? "Describe qué se retire y por qué…"
												: "Opcional: qué dijo exactamente, a qué se refiere…"
										}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={() => field.handleBlur()}
									/>
									<FieldDescription>
										{detalleObligatorio ? (
											<>
												Obligatorio para <b>«Otro motivo»</b>: es el único que
												no se explica solo.
											</>
										) : (
											<>
												Opcional. El motivo elegido ya dice por qué se oculta;
												esto es el contexto.
											</>
										)}
									</FieldDescription>
									{isInvalid ? (
										<FieldError
											errors={field.state.meta.errors}
											aria-live="polite"
										/>
									) : null}
								</Field>
							);
						}}
					</form.Field>
				</form>

				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						disabled={isPending}
						onClick={() => void form.handleSubmit()}
					>
						{isPending ? <Spinner /> : null} Ocultar reseña
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
