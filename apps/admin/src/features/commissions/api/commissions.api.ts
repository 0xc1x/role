import type {
	CommissionDto,
	CommissionPaginatedData,
	ListCommissionsQuery,
	UpdateCommissionDto,
} from "@0xc1x/role-commons";
import { createResourceApi } from "@/lib/api/resource";

export const commissionsApi = createResourceApi<
	CommissionDto,
	never,
	UpdateCommissionDto,
	ListCommissionsQuery,
	CommissionPaginatedData
>("/commissions");
