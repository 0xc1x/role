import type {
	CreateSlideDto,
	ListSlideQuery,
	SlideDto,
	SlidePaginatedData,
	UpdateSlideDto,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { createResourceApi } from "@/lib/api/resource";

const base = createResourceApi<
	SlideDto,
	CreateSlideDto,
	UpdateSlideDto,
	ListSlideQuery,
	SlidePaginatedData
>("/slides");

export const slidesApi = {
	...base,
	uploadImage: (file: File, folder: string, bucket: string = "images") => {
		const formData = new FormData();
		formData.append("file", file);
		formData.append("folder", folder);
		formData.append("bucket", bucket);
		return api.post<{ url: string }>("/upload/image", undefined, { formData });
	},
};
