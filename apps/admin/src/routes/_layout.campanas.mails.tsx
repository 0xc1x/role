import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { FormDrawer } from "@/components/resource/form-drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { CampaignFields } from "@/features/email/components/campaign-fields";
import { CampaignRowCard } from "@/features/email/components/campaign-row-card";
import { campaignDefaults } from "@/features/email/forms/campaign-forms";
import {
	emailListOptions,
	useCampaignMutations,
	useEmailSegments,
	useEmailTemplates,
} from "@/features/email/queries/emails.queries";

export const Route = createFileRoute("/_layout/campanas/mails")({
	component: CampaignsPage,
	head: () => ({ meta: [{ title: "Campañas de Marketing | Rolé" }] }),
});

function CampaignsPage() {
	const list = useQuery(
		emailListOptions.campaigns({ limit: 50, channel: "email" }),
	);
	const templates = useEmailTemplates();
	const segments = useEmailSegments();
	const mutations = useCampaignMutations();

	if (list.isLoading || templates.isLoading) return <Loading />;

	const campaigns = list.data?.data ?? [];

	return (
		<div className="px-6 py-4">
			<h1 className="font-bold text-xl">Campañas de Marketing</h1>
			<div className="mt-6 space-y-6">
				<div className="flex items-center justify-end">
					<FormDrawer
						title="Nueva campaña"
						createLabel="Crear campaña"
						defaults={() => campaignDefaults()}
						fields={({ values, setValues }) => (
							<CampaignFields
								values={values}
								setValues={setValues}
								templates={templates.data?.data ?? []}
								segments={segments.data?.data ?? []}
							/>
						)}
						toPayload={(v) => ({
							name: v.name,
							channel: "email" as const,
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
					<CampaignRowCard
						key={c.id}
						campaign={c}
						templates={templates.data?.data ?? []}
						segments={segments.data?.data ?? []}
						onSend={() =>
							mutations.send.mutate(c.id, {
								onError: (err) =>
									toast.error(
										err instanceof Error ? err.message : "Error inesperado",
									),
							})
						}
						onCancel={() =>
							mutations.cancel.mutate(c.id, {
								onError: (err) =>
									toast.error(
										err instanceof Error ? err.message : "Error inesperado",
									),
							})
						}
						onRemove={() => mutations.remove.mutateAsync(c.id)}
						onUpdate={(payload) =>
							mutations.update.mutateAsync({ id: c.id, body: payload })
						}
						onTest={(emails) =>
							mutations.test.mutate(
								{ id: c.id, emails },
								{
									onError: (err) =>
										toast.error(
											err instanceof Error ? err.message : "Error inesperado",
										),
								},
							)
						}
						busy={
							mutations.send.isPending ||
							mutations.cancel.isPending ||
							mutations.test.isPending ||
							mutations.update.isPending
						}
					/>
				))}
			</div>
		</div>
	);
}

// ─── helpers compartidos ──────────────────────────────────────────────

function Loading() {
	return (
		<div className="space-y-2">
			{[1, 2, 3, 4].map((n) => (
				<Skeleton key={n} className="h-10 w-full" />
			))}
		</div>
	);
}
