import { HideReviewSchema } from "@0xc1x/role-commons";
import { useForm } from "@tanstack/react-form";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

/**
 * Confirmación de "ocultar reseña", con el motivo obligatorio.
 *
 * NO reusa `ConfirmDeleteDialog`: su copy habla de borrado y de algo que no se
 * puede deshacer, y acá no se borra nada. La reseña se conserva —para que el
 * `UNIQUE(user_id, order_id)` siga impidiendo que el autor la vuelva a publicar
 * y para que quede el registro de la decisión—, y la moderación es reversible
 * desde este mismo panel. Un "esto no se puede deshacer" sobre una acción que sí
 * se puede revertir descarta al operador sin causa.
 *
 * El motivo es un campo del formulario y no una nota: es el registro de
 * apelación. Si el negocio disputa el ocultamiento, la respuesta a "por qué" no
 * puede ser un campo opcional, y por eso se valida con `HideReviewSchema` —el
 * contrato de commons, no una regla duplicada acá— y no con un `if` suelto.
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
	onConfirm: (hiddenReason: string) => void;
	isPending: boolean;
	authorName: string | null;
	businessName: string | null;
	comment: string | null;
}) {
	const formId = useId();

	const form = useForm({
		defaultValues: { hidden_reason: "" },
		// `onSubmit` y no `onChange`: el error tiene que aparecer cuando el
		// operador intenta confirmar, no mientras todavía no ha escrito nada.
		validators: { onSubmit: HideReviewSchema },
		onSubmit: ({ value }) => onConfirm(value.hidden_reason),
	});

	// El motivo es de la acción, no del registro: si se abre el diálogo para otra
	// reseña, el texto del anterior no puede quedar ahí esperando ser confirmado.
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
					<form.Field name="hidden_reason">
						{(field) => {
							const isInvalid =
								field.state.meta.isTouched && !field.state.meta.isValid;
							return (
								<Field data-invalid={isInvalid} className="py-4">
									<FieldLabel htmlFor={`${formId}-motivo`}>
										Motivo del ocultamiento
									</FieldLabel>
									<Textarea
										id={`${formId}-motivo`}
										value={field.state.value}
										aria-invalid={isInvalid}
										placeholder="Lenguaje abusivo hacia el personal, Elsewhere no veras un nombre asi…"
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={() => field.handleBlur()}
									/>
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
