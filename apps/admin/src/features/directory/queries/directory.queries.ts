import { queryOptions, useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { directoryApi } from "../api/directory.api";
import { directoryKeys } from "./directory.keys";

export interface PickerOption {
	id: string;
	label: string;
}

export const directoryProfilesOptions = (
	search: string,
	subscribedTo?: string,
	withPushToken?: boolean,
) =>
	queryOptions({
		queryKey: directoryKeys.profiles({
			limit: 10,
			search: search || undefined,
			subscribed_to: subscribedTo,
			has_active_push_token: withPushToken || undefined,
		}),
		queryFn: () =>
			directoryApi.profiles({
				limit: 10,
				search: search || undefined,
				subscribed_to: subscribedTo,
				has_active_push_token: withPushToken || undefined,
			}),
		staleTime: 30_000,
	});

export const directoryBusinessesOptions = (search: string) =>
	queryOptions({
		queryKey: directoryKeys.businesses({
			limit: 10,
			search: search || undefined,
			is_active: true,
		}),
		queryFn: () =>
			directoryApi.businesses({
				limit: 10,
				search: search || undefined,
				is_active: true,
			}),
		staleTime: 30_000,
	});

export function useDirectory(
	kind: "usuarios" | "negocios",
	search: string,
	subscribedTo?: string,
	withPushToken?: boolean,
): { options: PickerOption[]; isLoading: boolean } {
	const debounced = useDebounce(search);
	const profiles = useQuery({
		...directoryProfilesOptions(debounced, subscribedTo, withPushToken),
		enabled: kind === "usuarios",
	});
	const businesses = useQuery({
		...directoryBusinessesOptions(debounced),
		enabled: kind === "negocios",
	});

	if (kind === "usuarios") {
		return {
			options: (profiles.data?.data ?? []).map((p) => ({
				id: p.id,
				label: `${p.full_name ?? "Sin nombre"} · ${p.email}`,
			})),
			isLoading: profiles.isFetching,
		};
	}
	return {
		options: (businesses.data?.data ?? []).map((b) => ({
			id: b.id,
			label: b.name,
		})),
		isLoading: businesses.isFetching,
	};
}
