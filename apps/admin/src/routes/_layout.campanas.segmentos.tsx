import type { SegmentDto } from "@0xc1x/role-commons";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ActiveCell } from "@/components/data-table/cells/active-cell";
import { FormDrawer } from "@/components/resource/form-drawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentActions } from "@/features/email/components/segment-actions";
import { SegmentEditDrawer } from "@/features/email/components/segment-edit-drawer";
import {
	SegmentFields,
	segmentDefaults,
} from "@/features/email/forms/email-forms";
import {
	useEmailSegments,
	useSegmentMutations,
	useSetSegmentUsers,
} from "@/features/email/queries/emails.queries";

export const Route = createFileRoute("/_layout/campanas/segmentos")({
	component: SegmentosPage,
	head: () => ({ meta: [{ title: "Segmentos | Rolé" }] }),
});

function SegmentosPage() {
	const list = useEmailSegments();
	const mutations = useSegmentMutations();
	const setUsers = useSetSegmentUsers();
	const [editing, setEditing] = useState<SegmentDto | null>(null);

	return (
		<div className="px-6 py-4">
			<h1 className="font-bold text-xl">Segmentos</h1>
			<div className="mt-6 space-y-6">
				<div className="flex items-center justify-end">
					<FormDrawer
						title="Nuevo segmento"
						createLabel="Crear segmento"
						defaults={() => segmentDefaults()}
						fields={({ values, setValues }) => (
							<SegmentFields values={values} setValues={setValues} />
						)}
						toPayload={(v) =>
							v.type === "dynamic"
								? {
										name: v.name,
										description: v.description || null,
										type: "dynamic" as const,
										filters: JSON.parse(v.filtersJson || "{}"),
										category: v.category,
										is_active: true,
									}
								: {
										name: v.name,
										description: v.description || null,
										type: "static" as const,
										filters: null,
										category: v.category,
										is_active: true,
										user_ids: v.user_ids,
									}
						}
						onSubmit={(payload) => mutations.create.mutateAsync(payload)}
						isPending={mutations.create.isPending}
					/>
				</div>
				{list.isLoading ? <Loading /> : null}
				{(list.data?.data ?? []).map((s) => (
					<div
						key={s.id}
						className="flex items-center justify-between rounded-lg border p-3"
					>
						<div>
							<p className="font-medium">{s.name}</p>
							<p className="text-sm text-muted-foreground">
								{s.type} · ~{s.estimated_count ?? "?"} destinatarios
							</p>
						</div>
						<div className="flex items-center gap-2">
							<ActiveCell
								active={s.is_active}
								onToggle={(checked) =>
									mutations.update.mutate({
										id: s.id,
										body: { is_active: checked },
									})
								}
								isPending={mutations.update.isPending}
								label="Segmento"
							/>
							<Button size="sm" variant="outline" onClick={() => setEditing(s)}>
								Editar
							</Button>
							<SegmentActions
								segment={s}
								onRemove={() => mutations.remove.mutateAsync(s.id)}
								isRemoving={mutations.remove.isPending}
							/>
						</div>
					</div>
				))}
				{editing ? (
					<SegmentEditDrawer
						segment={editing}
						setUsers={setUsers}
						update={mutations.update}
						onClose={() => setEditing(null)}
					/>
				) : null}
			</div>
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
