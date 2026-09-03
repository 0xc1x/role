import type { EmailSendDto } from "@0xc1x/role-commons";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError } from "@/lib/api/errors";
import { useUpdateEmailSend } from "../queries/email-sends.queries";

const schema = z.object({
	email: z.string().email().optional(),
	status: z.enum(["pending", "queued", "processing", "sent", "delivered", "opened", "clicked", "bounced", "complained", "failed", "cancelled"]).optional(),
	type: z.enum(["campaign", "transactional", "newsletter", "notification", "test"]).optional(),
	source_type: z.string().nullable().optional(),
	source_id: z.string().nullable().optional(),
	attempts: z.any().optional(),
	max_attempts: z.any().optional(),
	error_message: z.string().nullable().optional(),
});

export function EmailSendForm({ formId, onSuccess, send }: { formId: string; onSuccess?: () => void; send: EmailSendDto }) {
	const updateMutation = useUpdateEmailSend();
	const form = useForm({
		defaultValues: {
			email: send.email ?? "",
			status: send.status,
			type: send.type,
			source_type: send.source_type ?? "",
			source_id: send.source_id ?? "",
			attempts: send.attempts ?? 0,
			max_attempts: send.max_attempts ?? 5,
			error_message: send.error_message ?? "",
		} as unknown as z.infer<typeof schema>,
		validators: { onSubmit: schema },
		onSubmit: async ({ value }) => {
			await updateMutation.mutateAsync({
				id: send.id,
				body: {
					email: value.email || undefined,
					status: value.status,
					type: value.type,
					source_type: value.source_type || null,
					source_id: value.source_id || null,
					attempts: value.attempts,
					max_attempts: value.max_attempts,
					error_message: value.error_message || null,
				} as unknown as Partial<EmailSendDto>,
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

			<form.Field name="email">
				{(field) => (
					<Field>
						<FieldLabel>Email</FieldLabel>
						<Input value={field.state.value ?? ""} onChange={(e) => field.handleChange(e.target.value)} />
					</Field>
				)}
			</form.Field>
			<form.Field name="type">
				{(field) => (
					<Field>
						<FieldLabel>Tipo</FieldLabel>
						<Select value={field.state.value} onValueChange={(v) => field.handleChange(v as never)}>
							<SelectTrigger><SelectValue /></SelectTrigger>
							<SelectContent>
								<SelectItem value="campaign">campaign</SelectItem>
								<SelectItem value="transactional">transactional</SelectItem>
								<SelectItem value="newsletter">newsletter</SelectItem>
								<SelectItem value="notification">notification</SelectItem>
								<SelectItem value="test">test</SelectItem>
							</SelectContent>
						</Select>
					</Field>
				)}
			</form.Field>
			<form.Field name="status">
				{(field) => (
					<Field>
						<FieldLabel>Estado</FieldLabel>
						<Select value={field.state.value} onValueChange={(v) => field.handleChange(v as never)}>
							<SelectTrigger><SelectValue /></SelectTrigger>
							<SelectContent>
								{["pending", "queued", "processing", "sent", "delivered", "opened", "clicked", "bounced", "complained", "failed", "cancelled"].map((s) => (
									<SelectItem key={s} value={s}>{s}</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
				)}
			</form.Field>
			<form.Field name="source_type">
				{(field) => (
					<Field>
						<FieldLabel>Source Type</FieldLabel>
						<Input value={field.state.value ?? ""} onChange={(e) => field.handleChange(e.target.value)} placeholder="campaign, business, contact" />
					</Field>
				)}
			</form.Field>
			<form.Field name="source_id">
				{(field) => (
					<Field>
						<FieldLabel>Source ID</FieldLabel>
						<Input value={field.state.value ?? ""} onChange={(e) => field.handleChange(e.target.value)} />
					</Field>
				)}
			</form.Field>
			<div className="grid grid-cols-2 gap-4">
				<form.Field name="attempts">
					{(field) => (
						<Field>
							<FieldLabel>Intentos</FieldLabel>
							<Input type="number" value={String(field.state.value ?? 0)} onChange={(e) => field.handleChange(Number(e.target.value) as never)} />
						</Field>
					)}
				</form.Field>
				<form.Field name="max_attempts">
					{(field) => (
						<Field>
							<FieldLabel>Max Intentos</FieldLabel>
							<Input type="number" value={String(field.state.value ?? 5)} onChange={(e) => field.handleChange(Number(e.target.value) as never)} />
						</Field>
					)}
				</form.Field>
			</div>
			<form.Field name="error_message">
				{(field) => (
					<Field>
						<FieldLabel>Error</FieldLabel>
						<Textarea value={field.state.value ?? ""} onChange={(e) => field.handleChange(e.target.value)} />
					</Field>
				)}
			</form.Field>
		</form>
	);
}
