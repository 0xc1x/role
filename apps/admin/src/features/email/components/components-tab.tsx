import { Loading } from "@/components/loading";
import { FormDrawer } from "@/components/resource/form-drawer";
import { Badge } from "@/components/ui/badge";
import {
	ComponentFields,
	componentDefaults,
} from "@/features/email/forms/email-forms";
import {
	useComponentMutations,
	useEmailComponents,
} from "@/features/email/queries/emails.queries";

export function ComponentsTab() {
	const list = useEmailComponents();
	const mutations = useComponentMutations();

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="font-bold text-lg">Encabezados y pies</h2>
				<FormDrawer
					title="Nuevo componente"
					createLabel="Crear componente"
					defaults={() => componentDefaults()}
					fields={({ values, setValues }) => (
						<ComponentFields values={values} setValues={setValues} />
					)}
					toPayload={(v) => v}
					onSubmit={(payload) => mutations.create.mutateAsync(payload)}
					isPending={mutations.create.isPending}
				/>
			</div>
			{list.isLoading ? <Loading /> : null}
			{(list.data?.data ?? []).map((c) => (
				<div
					key={c.id}
					className="flex items-center justify-between rounded-lg border p-3"
				>
					<div>
						<p className="font-medium">{c.name}</p>
						<Badge variant="secondary">{c.type}</Badge>
					</div>
					<FormDrawer
						title={`Editar ${c.name}`}
						createLabel=""
						row={c}
						defaults={componentDefaults}
						fields={({ values, setValues }) => (
							<ComponentFields values={values} setValues={setValues} />
						)}
						toPayload={(v) => v}
						onSubmit={(payload) =>
							mutations.update.mutateAsync({ id: c.id, body: payload })
						}
						isPending={mutations.update.isPending}
					/>
				</div>
			))}
		</div>
	);
}

// ─── Tab: plantillas ──────────────────────────────────────────────────
