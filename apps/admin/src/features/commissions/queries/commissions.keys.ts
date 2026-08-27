import type { ListCommissionsQuery } from "@0xc1x/role-commons";
import { createResourceKeys } from "@/lib/query/keys";

export const commissionsKeys = createResourceKeys<ListCommissionsQuery>("commissions");
