import type {
	CreatePushTemplateDto,
	ListPushNotificationsQuery,
	ListPushTemplatesQuery,
	ListPushTokensQuery,
	UpdatePushTemplateDto,
} from "@0xc1x/role-commons";
import {
	keepPreviousData,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useEmailSegments } from "@/features/email/queries/emails.queries";
import { pushApi } from "../api/push.api";
import { pushKeys } from "./push.keys";

// ─── listas ────────────────────────────────────────────────────────────

export const pushListOptions = {
	history: (q?: ListPushNotificationsQuery) =>
		queryOptions({
			queryKey: pushKeys.list("history", q),
			queryFn: () => pushApi.listHistory(q),
			staleTime: 30_000,
			placeholderData: keepPreviousData,
		}),
	templates: (q?: ListPushTemplatesQuery) =>
		queryOptions({
			queryKey: pushKeys.list("templates", q),
			queryFn: () => pushApi.listTemplates(q),
			staleTime: 30_000,
		}),
	tokens: (q?: ListPushTokensQuery) =>
		queryOptions({
			queryKey: pushKeys.list("tokens", q),
			queryFn: () => pushApi.listTokens(q),
			staleTime: 30_000,
			placeholderData: keepPreviousData,
		}),
};

export function usePushHistory(q?: ListPushNotificationsQuery) {
	return useQuery(pushListOptions.history(q));
}
export function usePushTemplates(q?: ListPushTemplatesQuery) {
	return useQuery(pushListOptions.templates(q));
}
export function usePushTokens(q?: ListPushTokensQuery) {
	return useQuery(pushListOptions.tokens(q));
}

/** Segmentos compartidos con el módulo de correos (misma tabla). */
export { useEmailSegments };

// ─── mutaciones de plantillas ──────────────────────────────────────────

/** Error de mutación → toast. Pura y sin closure: vive a nivel módulo. */
function notifyMutationError(err: Error) {
	toast.error(err.message);
}

export function usePushTemplateMutations() {
	const qc = useQueryClient();
	const invalidate = () =>
		void qc.invalidateQueries({ queryKey: pushKeys.all });

	return {
		create: useMutation({
			mutationFn: (b: CreatePushTemplateDto) => pushApi.createTemplate(b),
			onSuccess: () => {
				toast.success("Plantilla creada");
				invalidate();
			},
			onError: notifyMutationError,
		}),
		update: useMutation({
			mutationFn: ({ id, body }: { id: string; body: UpdatePushTemplateDto }) =>
				pushApi.updateTemplate(id, body),
			onSuccess: () => {
				toast.success("Plantilla actualizada");
				invalidate();
			},
			onError: notifyMutationError,
		}),
		remove: useMutation({
			mutationFn: (id: string) => pushApi.removeTemplate(id),
			onSuccess: () => {
				toast.success("Plantilla eliminada");
				invalidate();
			},
			onError: notifyMutationError,
		}),
	};
}

// ─── envío ─────────────────────────────────────────────────────────────

export function usePushSend() {
	const qc = useQueryClient();
	const invalidate = () =>
		void qc.invalidateQueries({ queryKey: pushKeys.all });
	return useMutation({
		mutationFn: (b: Parameters<typeof pushApi.send>[0]) => pushApi.send(b),
		onSuccess: (res) => {
			if (res.sent === 0 && res.failed === 0) {
				toast.warning(
					"Nadie recibió la notificación: sin tokens activos, push apagado o en horario de silencio",
				);
			} else {
				toast.success(
					`Notificación enviada a ${res.sent} dispositivo(s)${res.failed > 0 ? ` — ${res.failed} fallido(s)` : ""}`,
				);
			}
			invalidate();
		},
		onError: (err: Error) => toast.error(err.message),
	});
}

export function usePushTest() {
	return useMutation({
		mutationFn: (b: Parameters<typeof pushApi.test>[0]) => pushApi.test(b),
		onError: (err: Error) => toast.error(err.message),
	});
}

export function usePushTestTemplate() {
	return useMutation({
		mutationFn: ({
			id,
			body,
		}: {
			id: string;
			body: Parameters<typeof pushApi.testTemplate>[1];
		}) => pushApi.testTemplate(id, body),
		onError: (err: Error) => toast.error(err.message),
	});
}

export function usePushAudience() {
	// react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- on-demand POST read, result used directly, no cached query goes stale
	return useMutation({
		mutationFn: (b: Parameters<typeof pushApi.audience>[0]) =>
			pushApi.audience(b),
		onError: (err: Error) => toast.error(err.message),
	});
}

// ─── dispositivos ──────────────────────────────────────────────────────

export function useUpdatePushToken() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
			pushApi.updateToken(id, { is_active }),
		onSuccess: () => {
			toast.success("Dispositivo actualizado");
			void qc.invalidateQueries({ queryKey: pushKeys.lists() });
		},
		onError: (err: Error) => toast.error(err.message),
	});
}
