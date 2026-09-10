import type {
	CampaignDto,
	SegmentDto,
	UpdateCampaignDto,
} from "@0xc1x/role-commons";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerBody,
	DrawerClose,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { CampaignFields } from "@/features/email/components/campaign-fields";
import { EmailPreview } from "@/features/email/components/email-preview";
import {
	type CampaignFormValues,
	campaignDefaults,
} from "@/features/email/forms/campaign-forms";
import {
	useAudience,
	usePreview,
	useTestTemplate,
} from "@/features/email/queries/emails.queries";

export function CampaignRowCard(props: {
	campaign: CampaignDto;
	templates: { id: string; name: string }[];
	segments: SegmentDto[];
	onSend: () => void;
	onCancel: () => void;
	onRemove: () => Promise<unknown>;
	onUpdate: (payload: UpdateCampaignDto) => Promise<unknown>;
	onTest: (emails: string[]) => void;
	busy: boolean;
}) {
	const c = props.campaign;
	const [drawer, setDrawer] = useState<"edit" | "test" | null>(null);
	const [values, setValues] = useState<CampaignFormValues>(() =>
		campaignDefaults(c),
	);
	const statusVariant =
		c.status === "sent"
			? "default"
			: c.status === "failed" || c.status === "cancelled"
				? "destructive"
				: "secondary";

	return (
		<>
			<div className="flex items-center justify-between rounded-lg border p-3">
				<div>
					<p className="font-medium">{c.name}</p>
					<p className="text-sm text-muted-foreground">
						{c.category} · {c.total_sent}/{c.total_recipients} enviados ·{" "}
						{c.total_opened} abiertos
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant={statusVariant}>{c.status}</Badge>
					<Button
						size="sm"
						variant="outline"
						onClick={() => setDrawer("test")}
						disabled={props.busy}
					>
						Probar
					</Button>
					<Button
						size="sm"
						onClick={() => {
							setValues(campaignDefaults(c));
							setDrawer("edit");
						}}
						disabled={props.busy}
					>
						Editar
					</Button>
					{c.status === "draft" ||
					c.status === "scheduled" ||
					c.status === "failed" ? (
						<Button
							size="sm"
							variant="destructive"
							onClick={props.onSend}
							disabled={props.busy}
						>
							Enviar
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

			{/* Drawer editar: formulario completo */}
			<Drawer
				open={drawer === "edit"}
				onOpenChange={(o) => setDrawer(o ? drawer : null)}
			>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Editar {c.name}</DrawerTitle>
					</DrawerHeader>
					<DrawerBody>
						<CampaignFields
							values={values}
							setValues={setValues}
							templates={props.templates}
							segments={props.segments}
						/>
					</DrawerBody>
					<DrawerFooter>
						<div className="flex w-full items-center justify-between">
							{c.status === "draft" ? (
								<Button
									type="button"
									variant="destructive"
									size="sm"
									disabled={props.busy}
									onClick={async () => {
										try {
											await props.onRemove();
											setDrawer(null);
										} catch (err) {
											toast.error(
												err instanceof Error ? err.message : "Error inesperado",
											);
										}
									}}
								>
									Eliminar
								</Button>
							) : (
								<span />
							)}
							<div className="flex gap-2">
								<Button
									type="button"
									disabled={props.busy}
									onClick={async () => {
										try {
											await props.onUpdate({
												name: values.name,
												template_id: values.template_id || null,
												category: values.category,
												segment_ids: values.segment_ids,
												include_user_ids: values.include_user_ids,
												exclude_user_ids: values.exclude_user_ids,
												scheduled_at: values.scheduled_at || null,
											});
											setDrawer(null);
										} catch (err) {
											toast.error(
												err instanceof Error ? err.message : "Error inesperado",
											);
										}
									}}
								>
									{props.busy ? <Spinner /> : null} Guardar cambios
								</Button>
								<DrawerClose>
									<Button variant="outline">Cancelar</Button>
								</DrawerClose>
							</div>
						</div>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>

			{/* Drawer probar: preview + envío de prueba */}
			<Drawer
				open={drawer === "test"}
				onOpenChange={(o) => setDrawer(o ? drawer : null)}
			>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Probar {c.name}</DrawerTitle>
					</DrawerHeader>
					<DrawerBody>
						<CampaignDetailBody
							campaignId={c.id}
							onSent={() => {
								toast.success("Correo de prueba enviado");
								setDrawer(null);
							}}
							onError={(message) => toast.error(message)}
						/>
					</DrawerBody>
					<DrawerFooter />
				</DrawerContent>
			</Drawer>
		</>
	);
}

function CampaignDetailBody(props: {
	campaignId: string;
	onSent?: () => void;
	onError?: (message: string) => void;
}) {
	const preview = usePreview("campaign");
	const test = useTestTemplate();
	const audience = useAudience();
	const [testEmails, setTestEmails] = useState("");

	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					variant="outline"
					onClick={() => preview.mutate(props.campaignId)}
				>
					{preview.isPending ? <Spinner /> : null} Preview
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={() => audience.mutate(props.campaignId)}
				>
					{audience.isPending ? <Spinner /> : null} Calcular alcance
				</Button>
				{audience.data ? (
					<Badge variant={audience.data.total > 0 ? "default" : "destructive"}>
						Llegaría a {audience.data.total} destinatarios
					</Badge>
				) : null}
			</div>
			{preview.data ? <EmailPreview html={preview.data.html} /> : null}
			<Field>
				<FieldLabel>Emails de prueba (coma separados)</FieldLabel>
				<Input
					value={testEmails}
					onChange={(e) => setTestEmails(e.target.value)}
					placeholder="tu@correo.com, socio@correo.com"
				/>
			</Field>
			<Button
				size="sm"
				variant="outline"
				onClick={() =>
					test.mutate(
						{
							id: props.campaignId,
							emails: testEmails
								.split(",")
								.map((s) => s.trim())
								.filter(Boolean),
						},
						{
							onSuccess: (res) =>
								res.sent > 0
									? props.onSent?.()
									: props.onError?.(
											"Ningún correo pudo enviarse — revisa el remitente en Resend",
										),
							onError: (err) => props.onError?.(err.message),
						},
					)
				}
				disabled={!testEmails.trim() || test.isPending}
			>
				{test.isPending ? <Spinner /> : null} Enviar prueba
			</Button>
		</>
	);
}
