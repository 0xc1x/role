import type { CampaignDto } from "@0xc1x/role-commons";
import { Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function PushCampaignRowCard(props: {
	campaign: CampaignDto;
	onEdit: () => void;
	onSend: () => void;
	onCancel: () => void;
	onTest: () => void;
	busy: boolean;
}) {
	const c = props.campaign;
	const statusVariant =
		c.status === "sent"
			? "default"
			: c.status === "failed" || c.status === "cancelled"
				? "destructive"
				: "secondary";

	return (
		<div className="flex items-center justify-between rounded-lg border p-3">
			<div>
				<p className="font-medium">{c.name}</p>
				<p className="text-sm text-muted-foreground">
					{c.category} · {c.total_recipients} destinatarios · {c.total_sent}{" "}
					enviados · {c.total_failed} fallidos
				</p>
			</div>
			<div className="flex items-center gap-2">
				<Badge variant={statusVariant}>{c.status}</Badge>
				<Button
					size="sm"
					variant="outline"
					onClick={props.onTest}
					disabled={props.busy || !c.template_id}
				>
					Probar
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={props.onEdit}
					disabled={props.busy}
				>
					Editar
				</Button>
				{c.status === "draft" ||
				c.status === "scheduled" ||
				c.status === "failed" ? (
					<Button size="sm" onClick={props.onSend} disabled={props.busy}>
						<Send className="size-4" /> Enviar
					</Button>
				) : null}
				{c.status === "sending" || c.status === "scheduled" ? (
					<Button
						size="sm"
						variant="outline"
						onClick={props.onCancel}
						disabled={props.busy}
					>
						Cancelar envío
					</Button>
				) : null}
			</div>
		</div>
	);
}
