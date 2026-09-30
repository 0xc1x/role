import type { CampaignDto } from "@0xc1x/role-commons";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { FormDrawer } from "@/components/resource/form-drawer";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { campaignDefaults } from "@/features/email/forms/campaign-forms";
import {
	emailListOptions,
	useCampaignMutations,
	useEmailSegments,
} from "@/features/email/queries/emails.queries";
import { PushCampaignEditDrawer } from "@/features/push-notifications/components/push-campaign-edit-drawer";
import { PushCampaignFields } from "@/features/push-notifications/components/push-campaign-fields";
import { PushCampaignRowCard } from "@/features/push-notifications/components/push-campaign-row-card";
import { PushTestDrawer } from "@/features/push-notifications/components/push-test-drawer";
import { usePushTemplates } from "@/features/push-notifications/queries/push.queries";
import { formatApiError, notifyMutationError } from "@/lib/api/notify";

export const Route = createFileRoute("/_layout/campanas/push")({
	component: PushCampaignsPage,
	head: () => ({ meta: [{ title: "Campañas Push | Rolé" }] }),
});

function PushCampaignsPage() {
	const list = useQuery(
		emailListOptions.campaigns({ limit: 50, channel: "push" }),
	);
	const templates = usePushTemplates();
	const segments = useEmailSegments();
	const mutations = useCampaignMutations();
	const [editing, setEditing] = useState<CampaignDto | null>(null);
	const [confirmSend, setConfirmSend] = useState<CampaignDto | null>(null);
	const [testing, setTesting] = useState<CampaignDto | null>(null);

	if (list.isLoading || templates.isLoading) return <Loading />;

	// Una consulta fallida tiene que decir que falló. `list.data?.data ?? []`
	// convierte un 500 en "no hay campañas push", que el operador lee como un
	// hecho y sobre el que decide si relanza o no. Es el mismo estado inline
	// que el resto del panel ya resuelve, con su "Reintentar".
	if (list.isError || templates.isError) {
		return (
			<div className="px-6 py-4">
				<h1 className="font-bold text-xl">Campañas Push</h1>
				<div className="mt-4 space-y-4">
					<p className="text-destructive">
						{formatApiError(
							list.error ?? templates.error,
							"Error al cargar campañas push",
						)}
					</p>
					<Button
						variant="outline"
						onClick={() => {
							void list.refetch();
							void templates.refetch();
						}}
					>
						Reintentar
					</Button>
				</div>
			</div>
		);
	}

	const campaigns = list.data?.data ?? [];

	return (
		<div className="px-6 py-4">
			<h1 className="font-bold text-xl">Campañas Push</h1>
			<div className="mt-6 space-y-6">
				<div className="flex items-center justify-end">
					<FormDrawer
						title="Nueva campaña push"
						createLabel="Crear campaña"
						defaults={() => campaignDefaults()}
						fields={({ values, setValues }) => (
							<PushCampaignFields
								values={values}
								setValues={setValues}
								templates={templates.data?.data ?? []}
								segments={segments.data?.data ?? []}
							/>
						)}
						toPayload={(v) => ({
							name: v.name,
							channel: "push" as const,
							template_id: v.template_id || null,
							category: v.category,
							segment_ids: v.segment_ids,
							include_user_ids: v.include_user_ids,
							exclude_user_ids: v.exclude_user_ids,
							scheduled_at: v.scheduled_at || null,
						})}
						onSubmit={(payload) => mutations.create.mutateAsync(payload)}
						isPending={mutations.create.isPending}
					/>
				</div>

				{campaigns.map((c) => (
					<PushCampaignRowCard
						key={c.id}
						campaign={c}
						onEdit={() => setEditing(c)}
						onSend={() => setConfirmSend(c)}
						onResend={() => mutations.resend.mutate(c)}
						onCancel={() =>
							mutations.cancel.mutate(c.id, {
								onError: (err) => notifyMutationError(err),
							})
						}
						onTest={() => setTesting(c)}
						onRemove={() => mutations.remove.mutateAsync(c.id)}
						busy={
							mutations.send.isPending ||
							mutations.resend.isPending ||
							mutations.cancel.isPending ||
							mutations.update.isPending ||
							mutations.remove.isPending
						}
					/>
				))}
			</div>

			{editing ? (
				<PushCampaignEditDrawer
					key={editing.id}
					campaign={editing}
					templates={templates.data?.data ?? []}
					segments={segments.data?.data ?? []}
					mutations={mutations}
					onClose={() => setEditing(null)}
				/>
			) : null}

			<PushTestDrawer
				campaign={testing}
				templates={templates.data?.data ?? []}
				onClose={() => setTesting(null)}
			/>

			<AlertDialog
				open={confirmSend !== null}
				onOpenChange={(o) => !o && setConfirmSend(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							¿Enviar la campaña "{confirmSend?.name}"?
						</AlertDialogTitle>
						<AlertDialogDescription>
							Se enviará a la audiencia seleccionada (segmentos ∪ incluidos −
							excluidos), respetando push_enabled y los tokens activos de cada
							usuario. Esta acción no se puede deshacer.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								if (!confirmSend) return;
								try {
									const sent = await mutations.send.mutateAsync(confirmSend.id);
									toast.success(
										`Envío iniciado a ${sent.total_recipients} destinatario(s) — sigue el progreso en Notificaciones → Push → Historial`,
									);
									setConfirmSend(null);
								} catch (err) {
									notifyMutationError(err);
								}
							}}
							disabled={mutations.send.isPending}
						>
							{mutations.send.isPending ? <Spinner /> : null} Enviar
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function Loading() {
	return (
		<div className="space-y-2">
			{[1, 2, 3, 4].map((n) => (
				<Skeleton key={n} className="h-10 w-full" />
			))}
		</div>
	);
}
