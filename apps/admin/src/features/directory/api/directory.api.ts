import type {
	BusinessDto,
	PaginatedData,
	ProfileDto,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

export type DirectoryProfilesQuery = {
	limit?: number;
	search?: string;
	subscribed_to?: string;
	has_active_push_token?: boolean;
};

export type DirectoryBusinessesQuery = {
	limit?: number;
	search?: string;
	is_active?: boolean;
};

export const directoryApi = {
	profiles: (query: DirectoryProfilesQuery) =>
		api.get<PaginatedData<ProfileDto>>(`/profiles${toSearchParams(query)}`),
	businesses: (query: DirectoryBusinessesQuery) =>
		api.get<PaginatedData<BusinessDto>>(`/businesses${toSearchParams(query)}`),
};
