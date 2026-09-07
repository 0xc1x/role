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
						onCancel={() =>
							mutations.cancel.mutate(c.id, {
								onError: (err) =>
									toast.error(
										err instanceof Error ? err.message : "Error inesperado",
									),
							})
						}
						onTest={() => setTesting(c)}
						busy={
							mutations.send.isPending ||
							mutations.cancel.isPending ||
							mutations.update.isPending
						}
					/>
				))}
			</div>

			<PushCampaignEditDrawer
				campaign={editing}
				templates={templates.data?.data ?? []}
				segments={segments.data?.data ?? []}
				mutations={mutations}
				onClose={() => setEditing(null)}
			/>

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
									toast.error(
										err instanceof Error ? err.message : "Error inesperado",
									);
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
