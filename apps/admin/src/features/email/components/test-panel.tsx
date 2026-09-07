import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { EmailPreview } from "@/features/email/components/email-preview";
import { useTestTemplate } from "@/features/email/queries/emails.queries";

export /** Preview renderizado + envío de prueba real a un email. */
function TestPanel(props: {
	templateId: string;
	html: string;
	subject: string;
}) {
	const test = useTestTemplate();
	const [email, setEmail] = useState("");
	return (
		<div className="space-y-3">
			<p className="text-sm text-muted-foreground">
				Vista previa — asunto:{" "}
				<span className="font-medium">{props.subject}</span>
			</p>
			<EmailPreview html={props.html} />
			<div className="flex items-center gap-2">
				<Input
					className="max-w-sm"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="tu@correo.com"
					type="email"
				/>
				<Button
					size="sm"
					variant="outline"
					disabled={!email.includes("@") || test.isPending}
					onClick={() =>
						test.mutate(
							{ id: props.templateId, emails: [email.trim()] },
							{
								onSuccess: () => {
									toast.success("Correo de prueba enviado");
									setEmail("");
								},
								onError: (err) => toast.error(err.message),
							},
						)
					}
				>
					{test.isPending ? <Spinner /> : null} Enviar prueba
				</Button>
			</div>
		</div>
	);
}
