import type { ListTipsQuery } from "@0xc1x/role-commons";
import { createResourceKeys } from "@/lib/query/keys";

export const tipsKeys = createResourceKeys<ListTipsQuery>("tips");
