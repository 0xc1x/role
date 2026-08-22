import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { emailApi } from "../api/emails.api";

type ListQ = Parameters<typeof emailApi.listComponents>[0];

const keys = {
	all: ["email"] as const,
	list: (resource: string, q?: Record<string, unknown>) =>
		[...keys.all, resource, q] as const,
};

// ─── listas ────────────────────────────────────────────────────────────
export const emailListOptions = {
	components: (q?: ListQ) =>
		queryOptions({
			queryKey: keys.list("components", q),
			queryFn: () => emailApi.listComponents(q),
		}),
	templates: (q?: ListQ) =>
		queryOptions({
			queryKey: keys.list("templates", q),
			queryFn: () => emailApi.listTemplates(q),
		}),
	segments: (q?: ListQ) =>
		queryOptions({
			queryKey: keys.list("segments", q),
			queryFn: () => emailApi.listSegments(q),
		}),
	campaigns: (q?: ListQ) =>
		queryOptions({
			queryKey: keys.list("campaigns", q),
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
function useResourceMutations(
	resource: "components" | "templates" | "segments",
) {
	const qc = useQueryClient();
	const invalidate = () => void qc.invalidateQueries({ queryKey: keys.all });
	// ponytail: firma común explícita para poder unir los tres recursos
	const api = {
		components: {
			create: emailApi.createComponent,
			update: emailApi.updateComponent,
			remove: emailApi.removeComponent,
		},
		templates: {
			create: emailApi.createTemplate,
			update: emailApi.updateTemplate,
			remove: emailApi.removeTemplate,
		},
		segments: {
			create: emailApi.createSegment,
			update: emailApi.updateSegment,
			remove: emailApi.removeSegment,
		},
	}[resource] as {
		create: (b: unknown) => Promise<unknown>;
		update: (id: string, body: unknown) => Promise<unknown>;
		remove: (id: string) => Promise<unknown>;
	};
	return {
		create: useMutation({
			mutationFn: (b: unknown) => api.create(b),
			onSuccess: invalidate,
		}),
		update: useMutation({
			mutationFn: ({ id, body }: { id: string; body: unknown }) =>
				api.update(id, body),
			onSuccess: invalidate,
		}),
		remove: useMutation({
			mutationFn: (id: string) => api.remove(id),
			onSuccess: invalidate,
		}),
	};
}

export const useComponentMutations = () => useResourceMutations("components");
export const useTemplateMutations = () => useResourceMutations("templates");
export const useSegmentMutations = () => {
	const qc = useQueryClient();
	const invalidate = () => void qc.invalidateQueries({ queryKey: keys.all });
	const base = useResourceMutations("segments");
	const setUsers = useMutation({
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

export function useCampaignMutations() {
	const qc = useQueryClient();
	const invalidate = () => void qc.invalidateQueries({ queryKey: keys.all });
	const onError = (err: Error) => toast.error(err.message);

	return {
		create: useMutation({
			mutationFn: (b: unknown) => emailApi.createCampaign(b),
			onSuccess: () => {
				toast.success("Campaña creada");
				invalidate();
			},
			onError,
		}),
		update: useMutation({
			mutationFn: ({ id, body }: { id: string; body: unknown }) =>
				emailApi.updateCampaign(id, body),
			onSuccess: () => {
				toast.success("Campaña actualizada");
				invalidate();
			},
			onError,
		}),
		test: useMutation({
			mutationFn: ({ id, emails }: { id: string; emails: string[] }) =>
				emailApi.testCampaign(id, { emails }),
			onSuccess: invalidate,
			onError,
		}),
		send: useMutation({
			mutationFn: (id: string) => emailApi.sendCampaign(id),
			onSuccess: (res) => {
				toast.success(
					`Enviando a ${res.total_recipients} destinatarios — el progreso se ve en la lista`,
				);
				invalidate();
			},
			onError,
		}),
		cancel: useMutation({
			mutationFn: (id: string) => emailApi.cancelCampaign(id),
			onSuccess: () => {
				toast.success("Envío cancelado");
				invalidate();
			},
			onError,
		}),
		remove: useMutation({
			mutationFn: (id: string) => emailApi.removeCampaign(id),
			onSuccess: () => {
				toast.success("Campaña eliminada");
				invalidate();
			},
			onError,
		}),
	};
}

/** Alcance real de una campaña (bajo demanda). */
export function useAudience() {
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
