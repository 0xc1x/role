import type { ListTipsQuery } from "@0xc1x/role-commons";

export const tipsKeys = {
	all: ["tips"] as const,
	lists: () => [...tipsKeys.all, "list"] as const,
	list: (params?: ListTipsQuery) =>
		[...tipsKeys.lists(), params ?? {}] as const,
	details: () => [...tipsKeys.all, "detail"] as const,
	detail: (id: string) => [...tipsKeys.details(), id] as const,
};
