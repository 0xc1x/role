import type { CreateCampaignDto, UpdateCampaignDto } from "@0xc1x/role-commons";
import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { emailApi } from "../api/emails.api";
import { emailKeys } from "./email.keys";

export { emailKeys };

type ListQ = Parameters<typeof emailApi.listComponents>[0];

// ─── listas ────────────────────────────────────────────────────────────
export const emailListOptions = {
	components: (q?: ListQ) =>
		queryOptions({
			queryKey: emailKeys.list("components", q),
			queryFn: () => emailApi.listComponents(q),
		}),
	templates: (q?: ListQ) =>
		queryOptions({
			queryKey: emailKeys.list("templates", q),
			queryFn: () => emailApi.listTemplates(q),
		}),
	segments: (q?: ListQ) =>
		queryOptions({
			queryKey: emailKeys.list("segments", q),
			queryFn: () => emailApi.listSegments(q),
		}),
	campaigns: (q?: ListQ) =>
		queryOptions({
			queryKey: emailKeys.list("campaigns", q),
			queryFn: () => emailApi.listCampaigns(q),
		}),
};

export function useEmailComponents() {
	return useQuery(emailListOptions.components({ limit: 100, active: true }));
}
export function useEmailTemplates() {
	return useQuery(emailListOptions.templates({ limit: 100, active: true }));
}
export function useEmailSegments() {
	return useQuery(emailListOptions.segments({ limit: 100 }));
}

/**
 * Mutaciones genéricas del módulo: cualquier cambio invalida las cuatro
 * listas (el módulo es pequeño; la precisión de invalidación no paga).
 */
function useResourceMutations<TCreate, TUpdate>(api: {
	create: (b: TCreate) => Promise<unknown>;
	update: (id: string, b: TUpdate) => Promise<unknown>;
	remove: (id: string) => Promise<unknown>;
}) {
	const qc = useQueryClient();
	const invalidate = () =>
		void qc.invalidateQueries({ queryKey: emailKeys.all });
	return {
		create: useMutation({
			mutationKey: emailKeys.all,
			mutationFn: (b: TCreate) => api.create(b),
			onSuccess: invalidate,
		}),
		update: useMutation({
			mutationKey: emailKeys.all,
			mutationFn: ({ id, body }: { id: string; body: TUpdate }) =>
				api.update(id, body),
			onSuccess: invalidate,
		}),
		remove: useMutation({
			mutationKey: emailKeys.all,
			mutationFn: (id: string) => api.remove(id),
			onSuccess: invalidate,
		}),
	};
}

export const useComponentMutations = () =>
	useResourceMutations({
		create: emailApi.createComponent,
		update: emailApi.updateComponent,
		remove: emailApi.removeComponent,
	});
export const useTemplateMutations = () =>
	useResourceMutations({
		create: emailApi.createTemplate,
		update: emailApi.updateTemplate,
		remove: emailApi.removeTemplate,
	});
export const useSegmentMutations = () => {
	const qc = useQueryClient();
	const invalidate = () =>
		void qc.invalidateQueries({ queryKey: emailKeys.all });
	const base = useResourceMutations({
		create: emailApi.createSegment,
		update: emailApi.updateSegment,
		remove: emailApi.removeSegment,
	});
	const setUsers = useMutation({
		mutationKey: emailKeys.all,
		mutationFn: ({ id, user_ids }: { id: string; user_ids: string[] }) =>
			emailApi.setSegmentUsers(id, user_ids),
		onSuccess: invalidate,
		onError: (err) => toast.error(err.message),
	});
	return { ...base, setUsers };
};

/** Miembros actuales de un segmento estático. */
export function useSegmentUsers(segmentId: string | null) {
	return useQuery({
		queryKey: ["email", "segments", segmentId, "users"],
		queryFn: () => emailApi.getSegmentUsers(segmentId ?? ""),
		enabled: Boolean(segmentId),
	});
}

export function useSetSegmentUsers() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, user_ids }: { id: string; user_ids: string[] }) =>
			emailApi.setSegmentUsers(id, user_ids),
		onSuccess: () => void qc.invalidateQueries({ queryKey: ["email"] }),
		onError: (err) => toast.error(err.message),
	});
}

/** Error de mutación → toast. Pura y sin closure: vive a nivel módulo. */
function notifyMutationError(err: Error) {
	toast.error(err.message);
}

export function useCampaignMutations() {
	const qc = useQueryClient();
	const invalidate = () =>
		void qc.invalidateQueries({ queryKey: emailKeys.all });

	return {
		create: useMutation({
			mutationKey: emailKeys.all,
			mutationFn: (b: CreateCampaignDto) => emailApi.createCampaign(b),
			onSuccess: () => {
				toast.success("Campaña creada");
				invalidate();
			},
			onError: notifyMutationError,
		}),
		update: useMutation({
			mutationKey: emailKeys.all,
			mutationFn: ({ id, body }: { id: string; body: UpdateCampaignDto }) =>
				emailApi.updateCampaign(id, body),
			onSuccess: () => {
				toast.success("Campaña actualizada");
				invalidate();
			},
			onError: notifyMutationError,
		}),
		test: useMutation({
			mutationKey: emailKeys.all,
			mutationFn: ({ id, emails }: { id: string; emails: string[] }) =>
				emailApi.testCampaign(id, { emails }),
			onSuccess: invalidate,
			onError: notifyMutationError,
		}),
		send: useMutation({
			mutationKey: emailKeys.all,
			mutationFn: (id: string) => emailApi.sendCampaign(id),
			onSuccess: (res) => {
				toast.success(
					`Enviando a ${res.total_recipients} destinatarios — el progreso se ve en la lista`,
				);
				invalidate();
			},
			onError: notifyMutationError,
		}),
		cancel: useMutation({
			mutationKey: emailKeys.all,
			mutationFn: (id: string) => emailApi.cancelCampaign(id),
			onSuccess: () => {
				toast.success("Envío cancelado");
				invalidate();
			},
			onError: notifyMutationError,
		}),
		remove: useMutation({
			mutationKey: emailKeys.all,
			mutationFn: (id: string) => emailApi.removeCampaign(id),
			onSuccess: () => {
				toast.success("Campaña eliminada");
				invalidate();
			},
			onError: notifyMutationError,
		}),
	};
}

/** Alcance real de una campaña (bajo demanda). */
export function useAudience() {
	// react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- on-demand POST read, result used directly, no cached query goes stale
	return useMutation({
		mutationFn: (id: string) => emailApi.audience(id),
	});
}

export function useTestTemplate() {
	return useMutation({
		mutationFn: ({ id, emails }: { id: string; emails: string[] }) =>
			emailApi.testTemplate(id, emails),
	});
}

/** Preview bajo demanda (botón, no automático). */
export function usePreview(kind: "template" | "campaign") {
	return useMutation({
		mutationFn: (id: string) =>
			kind === "template"
				? emailApi.renderTemplate(id)
				: emailApi.previewCampaign(id),
	});
}
