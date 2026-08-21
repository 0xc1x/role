import type {
	CreateSlideDto,
	ListSlideQuery,
	UpdateSlideDto,
} from "@0xc1x/role-commons";
import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { slidesApi } from "../api/slides.api";
import { slidesKeys } from "./slides.keys";
export const slidesListOptions = (params?: ListSlideQuery) =>
	queryOptions({
		queryKey: slidesKeys.list(params),
		queryFn: () => slidesApi.list(params),
		staleTime: 30_000,
	});

export function useSlideList(params?: ListSlideQuery) {
	return useQuery(slidesListOptions(params));
}

export function useUpdateSlide() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: slidesKeys.all,
		mutationFn: ({ id, body }: { id: string; body: UpdateSlideDto }) =>
			slidesApi.update(id, body),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: slidesKeys.lists() });
		},
	});
}

export function useUploadImage() {
	return useMutation({
		mutationFn: (file: File) => slidesApi.uploadImage(file, "slides"),
	});
}

export function useCreateSlide() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: slidesKeys.all,
		mutationFn: (body: CreateSlideDto) => slidesApi.create(body),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: slidesKeys.lists() });
		},
	});
}
