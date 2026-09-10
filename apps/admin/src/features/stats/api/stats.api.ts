import type { PlatformStats } from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";

export const statsApi = {
	platform: () => api.get<PlatformStats>("/stats/platform"),
};
