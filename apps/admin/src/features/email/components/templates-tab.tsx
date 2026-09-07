import { useState } from "react";
import { toast } from "sonner";
import { Loading } from "@/components/loading";
import { FormDrawer } from "@/components/resource/form-drawer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TestPanel } from "@/features/email/components/test-panel";
import {
	TemplateFields,
	templateDefaults,
} from "@/features/email/forms/email-forms";
import {
	useEmailComponents,
	useEmailTemplates,
	usePreview,
	useTemplateMutations,
} from "@/features/email/queries/emails.queries";

export function TemplatesTab() {
	const list = useEmailTemplates();
	const components = useEmailComponents();
	const mutations = useTemplateMutations();
	const preview = usePreview("template");
	const [previewId, setPreviewId] = useState<string | null>(null);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="font-bold text-lg">Plantillas</h2>
				<FormDrawer
					title="Nueva plantilla"
					createLabel="Crear plantilla"
					defaults={() => templateDefaults()}
					fields={({ values, setValues }) => (
						<TemplateFields
							values={values}
							setValues={setValues}
							components={components.data?.data ?? []}
						/>
					)}
					toPayload={(v) => v}
					onSubmit={(payload) => mutations.create.mutateAsync(payload)}
					isPending={mutations.create.isPending}
				/>
			</div>
			{preview.data && previewId ? (
				<TestPanel
					templateId={previewId}
					html={preview.data.html}
					subject={preview.data.subject}
				/>
			) : null}
			{list.isLoading ? <Loading /> : null}
			{(list.data?.data ?? []).map((t) => (
				<div
					key={t.id}
					className="flex items-center justify-between rounded-lg border p-3"
				>
					<div>
						<p className="font-medium">{t.name}</p>
						<p className="text-sm text-muted-foreground">{t.subject}</p>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setPreviewId(null);
								preview.mutate(t.id, {
									onSuccess: () => setPreviewId(t.id),
									onError: (err) =>
										toast.error(
											err instanceof Error ? err.message : "Error inesperado",
										),
								});
							}}
						>
							{preview.isPending ? <Spinner /> : null} Preview
						</Button>
						<FormDrawer
							title={`Editar ${t.name}`}
							createLabel=""
							row={t}
							defaults={templateDefaults}
							fields={({ values, setValues }) => (
								<TemplateFields
									values={values}
									setValues={setValues}
									components={components.data?.data ?? []}
								/>
							)}
							toPayload={(v) => v}
							onSubmit={(payload) =>
								mutations.update.mutateAsync({ id: t.id, body: payload })
							}
							isPending={mutations.update.isPending}
						/>
					</div>
				</div>
			))}
		</div>
	);
}

// ─── Tab: envíos ──────────────────────────────────────────────────────
