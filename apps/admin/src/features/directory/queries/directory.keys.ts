import type {
	DirectoryBusinessesQuery,
	DirectoryProfilesQuery,
} from "../api/directory.api";

export const directoryKeys = {
	all: ["directory"] as const,
	profiles: (params?: DirectoryProfilesQuery) =>
		[...directoryKeys.all, "profiles", (params ?? {}) as object] as const,
	businesses: (params?: DirectoryBusinessesQuery) =>
		[...directoryKeys.all, "businesses", (params ?? {}) as object] as const,
};
