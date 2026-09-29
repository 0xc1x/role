import { Loading } from "@/components/loading";
import { FormDrawer } from "@/components/resource/form-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { componentDefaults } from "@/features/email/forms/email-defaults";
import { ComponentFields } from "@/features/email/forms/email-forms";
import {
	useComponentMutations,
	useEmailComponents,
} from "@/features/email/queries/emails.queries";
import { formatApiError } from "@/lib/api/notify";

export function ComponentsTab() {
	const list = useEmailComponents();
	const mutations = useComponentMutations();

	// Una consulta fallida tiene que decir que falló. `list.data?.data ?? []`
	// convierte un 500 en "no hay componentes", que el operador lee como un
	// hecho sobre el catálogo y sobre el que va a decidir. Es el mismo estado
	// inline que el resto del panel ya resuelve, con su "Reintentar".
	if (list.isError) {
		return (
			<div className="space-y-4">
				<p className="text-destructive">
					{formatApiError(list.error, "Error al cargar componentes")}
				</p>
				<Button variant="outline" onClick={() => void list.refetch()}>
					Reintentar
				</Button>
			</div>
		);
	}

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
