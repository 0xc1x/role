import type {
	PushNotificationPaginatedData,
	PushTemplatePaginatedData,
	PushTokenPaginatedData,
} from "@0xc1x/role-commons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEmailSegments } from "@/features/email/queries/emails.queries";
import { pushApi } from "../api/push.api";
import { pushKeys } from "./push.keys";

type ListQ = Record<string, string | number | boolean | null | undefined>;

// ─── listas ────────────────────────────────────────────────────────────

export const pushListOptions = {
	history: (q?: ListQ) => ({
		queryKey: pushKeys.list("history", q),
		queryFn: () => pushApi.listHistory(q),
	}),
	templates: (q?: ListQ) => ({
		queryKey: pushKeys.list("templates", q),
		queryFn: () => pushApi.listTemplates(q),
	}),
	tokens: (q?: ListQ) => ({
		queryKey: pushKeys.list("tokens", q),
		queryFn: () => pushApi.listTokens(q),
	}),
};

export function usePushHistory(q?: ListQ) {
	return useQuery<PushNotificationPaginatedData>(pushListOptions.history(q));
}
export function usePushTemplates(q?: ListQ) {
	return useQuery<PushTemplatePaginatedData>(pushListOptions.templates(q));
}
export function usePushTokens(q?: ListQ) {
	return useQuery<PushTokenPaginatedData>(pushListOptions.tokens(q));
}

/** Segmentos compartidos con el módulo de correos (misma tabla). */
export { useEmailSegments };

// ─── mutaciones de plantillas ──────────────────────────────────────────

export function usePushTemplateMutations() {
	const qc = useQueryClient();
	const invalidate = () =>
		void qc.invalidateQueries({ queryKey: pushKeys.all });
	const onError = (err: Error) => toast.error(err.message);

	return {
		create: useMutation({
			mutationFn: (b: unknown) => pushApi.createTemplate(b),
			onSuccess: () => {
				toast.success("Plantilla creada");
				invalidate();
			},
			onError,
		}),
		update: useMutation({
			mutationFn: ({ id, body }: { id: string; body: unknown }) =>
				pushApi.updateTemplate(id, body),
			onSuccess: () => {
				toast.success("Plantilla actualizada");
				invalidate();
			},
			onError,
		}),
		remove: useMutation({
			mutationFn: (id: string) => pushApi.removeTemplate(id),
			onSuccess: () => {
				toast.success("Plantilla eliminada");
				invalidate();
			},
			onError,
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
