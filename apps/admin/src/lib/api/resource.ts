import { api } from "./client";
import { toSearchParams } from "./http";

export function createResourceApi<
	TDto,
	TCreateDto,
	TUpdateDto,
	TListQuery extends Record<string, unknown>,
	TPaginated,
>(basePath: string, listPath = basePath) {
	return {
		list: (query?: TListQuery) =>
			api.get<TPaginated>(`${listPath}${toSearchParams(query)}`),
		create: (body: TCreateDto) => api.post<TDto>(basePath, body),
		update: (id: string, body: TUpdateDto) =>
			api.patch<TDto>(`${basePath}/${id}`, body),
		remove: (id: string) => api.delete<TDto>(`${basePath}/${id}`),
	};
}
