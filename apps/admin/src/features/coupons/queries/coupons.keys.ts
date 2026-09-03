import type { ListCouponsQuery } from "@0xc1x/role-commons";
import { createResourceKeys } from "@/lib/query/keys";

export const couponsKeys = createResourceKeys<ListCouponsQuery>("coupons");
