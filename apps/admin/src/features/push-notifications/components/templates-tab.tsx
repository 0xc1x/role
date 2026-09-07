import type { PushTemplateDto } from "@0xc1x/role-commons";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Loading } from "@/components/loading";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TemplateTestDrawer } from "@/features/push-notifications/components/template-test-drawer";
import {
	PushTemplateFields,
	pushTemplateDefaults,
} from "@/features/push-notifications/forms/push-forms";
import {
	usePushTemplateMutations,
	usePushTemplates,
	usePushTestTemplate,
} from "@/features/push-notifications/queries/push.queries";

export function TemplatesTab() {
	const list = usePushTemplates();
	const mutations = usePushTemplateMutations();
	const test = usePushTestTemplate();
	const [testing, setTesting] = useState<PushTemplateDto | null>(null);
	const [deleting, setDeleting] = useState<PushTemplateDto | null>(null);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="font-bold text-lg">Plantillas de push</h2>
				<FormDrawer
					title="Nueva plantilla"
					createLabel="Crear plantilla"
					defaults={() => pushTemplateDefaults()}
					fields={({ values, setValues }) => (
						<PushTemplateFields values={values} setValues={setValues} />
					)}
					toPayload={(v) => ({
						name: v.name,
						title: v.title,
						body: v.body,
						is_active: v.is_active,
						data: v.link.trim() ? { link: v.link.trim() } : {},
					})}
					onSubmit={(payload) => mutations.create.mutateAsync(payload)}
					isPending={mutations.create.isPending}
				/>
			</div>
			{list.isLoading ? <Loading /> : null}
			{(list.data?.data ?? []).map((t) => {
				const link =
					((t.data as Record<string, unknown> | undefined)?.link as string) ??
					"";
				return (
					<div
						key={t.id}
						className="flex items-center justify-between rounded-lg border p-3"
					>
						<div className="min-w-0">
							<p className="font-medium">{t.name}</p>
							<p className="truncate text-sm text-muted-foreground">
								{t.title} — {t.body}
							</p>
							{link ? (
								<p className="truncate text-xs text-muted-foreground">
									↗ {link}
								</p>
							) : null}
						</div>
						<div className="flex items-center gap-2">
							<Badge variant={t.is_active ? "default" : "secondary"}>
								{t.is_active ? "activa" : "inactiva"}
							</Badge>
							<Button size="sm" variant="outline" onClick={() => setTesting(t)}>
								Probar
							</Button>
							<FormDrawer
								title={`Editar ${t.name}`}
								createLabel=""
								row={t}
								defaults={pushTemplateDefaults}
								fields={({ values, setValues }) => (
									<PushTemplateFields values={values} setValues={setValues} />
								)}
								toPayload={(v) => ({
									name: v.name,
									title: v.title,
									body: v.body,
									is_active: v.is_active,
									data: v.link.trim() ? { link: v.link.trim() } : {},
								})}
								onSubmit={(payload) =>
									mutations.update.mutateAsync({ id: t.id, body: payload })
								}
								isPending={mutations.update.isPending}
							/>
							<Button
								size="sm"
								variant="ghost"
								className="text-destructive"
								onClick={() => setDeleting(t)}
							>
								<Trash2 className="size-4" />
							</Button>
						</div>
					</div>
				);
			})}

			{testing ? (
				<TemplateTestDrawer
					template={testing}
					test={test}
					onClose={() => setTesting(null)}
				/>
			) : null}

			<AlertDialog
				open={Boolean(deleting)}
				onOpenChange={(o) => !o && setDeleting(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Eliminar la plantilla "{deleting?.name}"?
						</AlertDialogTitle>
						<AlertDialogDescription>
							La plantilla se elimina y deja de aparecer en la lista. Esta
							acción no se puede deshacer.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								if (!deleting) return;
								try {
									await mutations.remove.mutateAsync(deleting.id);
									setDeleting(null);
								} catch (err) {
									toast.error(
										err instanceof Error ? err.message : "Error inesperado",
									);
								}
							}}
						>
							{mutations.remove.isPending ? <Spinner /> : null} Eliminar
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
