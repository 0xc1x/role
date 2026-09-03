import type { ListAppConfigQuery } from "@0xc1x/role-commons";
import { createListOnlyKeys } from "@/lib/query/keys";

export const appConfigKeys =
	createListOnlyKeys<ListAppConfigQuery>("app-config");
