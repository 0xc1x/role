import { api } from "./client";
import { toSearchParams } from "./http";

export function createResourceApi<
	TDto,
	TCreateDto,
	TUpdateDto,
	TListQuery extends Record<string, unknown>,
	TPaginated,
>(basePath: string) {
	return {
		list: (query?: TListQuery) =>
			api.get<TPaginated>(`${basePath}${toSearchParams(query)}`),
		create: (body: TCreateDto) => api.post<TDto>(basePath, body),
		update: (id: string, body: TUpdateDto) =>
			api.patch<TDto>(`${basePath}/${id}`, body),
		remove: (id: string) => api.delete<TDto>(`${basePath}/${id}`),
	};
}
