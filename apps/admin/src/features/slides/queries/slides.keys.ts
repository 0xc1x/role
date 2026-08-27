import type { ListSlideQuery } from "@0xc1x/role-commons";
import { createListOnlyKeys } from "@/lib/query/keys";

export const slidesKeys = createListOnlyKeys<ListSlideQuery>("slides");
