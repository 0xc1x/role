import type {
	CreateTipDto,
	ListTipsQuery,
	TipDto,
	TipPaginatedData,
	UpdateTipDto,
} from "@0xc1x/role-commons";
import { createResourceApi } from "@/lib/api/resource";

export const tipsApi = createResourceApi<
	TipDto,
	CreateTipDto,
	UpdateTipDto,
	ListTipsQuery,
	TipPaginatedData
>("/tips");
