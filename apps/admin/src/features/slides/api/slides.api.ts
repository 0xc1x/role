import type { CreateSlideDto, SlideDto, SlidePaginatedData, ListSlideQuery, UpdateSlideDto } from "@0xc1x/role-commons"
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

export const slidesApi = {
    create: (body: CreateSlideDto) => api.post<SlideDto>("/slides", body),
    list: (query?: ListSlideQuery) =>
        api.get<SlidePaginatedData>(
            `/slides${toSearchParams(query as Record<string, string | number | boolean | undefined>)}`,
        ),
    update: (id: string, body: UpdateSlideDto) =>
        api.patch<SlideDto>(`/slides/${id}`, body),
    remove: (id: string) => api.delete<SlideDto>(`/slides/${id}`),
    uploadImage: (file: File, folder: string, bucket: string = "images",) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", folder);
        formData.append("bucket", bucket);
        return api.post<{ url: string }>("/upload/image", undefined, { formData });
    },
}
