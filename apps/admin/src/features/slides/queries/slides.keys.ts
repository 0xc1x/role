import type { ListSlideQuery } from "@0xc1x/role-commons"

export const slidesKeys = {
    all: ["slides"] as const,
    lists: () => [...slidesKeys.all, "list"] as const,
    list: (params?: ListSlideQuery) =>
        [...slidesKeys.lists(), params] as const
}