import type {
	CreateCouponDto,
	ListCouponsQuery,
	UpdateCouponDto,
} from "@0xc1x/role-commons";
import { useQuery } from "@tanstack/react-query";
import {
	createListOptions,
	createUseCreate,
	createUseDelete,
	createUseUpdate,
} from "@/lib/query/resource-helpers";
import { couponsApi } from "../api/coupons.api";
import { couponsKeys } from "./coupons.keys";

export const couponsListOptions = createListOptions(
	couponsKeys,
	couponsApi.list,
);

export function useCouponsList(params?: ListCouponsQuery) {
	return useQuery(couponsListOptions(params));
}

export const useCreateCoupon = createUseCreate<
	CreateCouponDto,
	Awaited<ReturnType<typeof couponsApi.create>>
>(couponsKeys, couponsApi.create);

export const useUpdateCoupon = createUseUpdate<
	UpdateCouponDto,
	Awaited<ReturnType<typeof couponsApi.update>>
>(couponsKeys, couponsApi.update);

export const useDeleteCoupon = createUseDelete(couponsKeys, couponsApi.remove);
