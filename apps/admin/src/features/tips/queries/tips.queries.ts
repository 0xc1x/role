import type {
	CreateTipDto,
	ListTipsQuery,
	UpdateTipDto,
} from "@0xc1x/role-commons";
import { useQuery } from "@tanstack/react-query";
import {
	createListOptions,
	createUseCreate,
	createUseDelete,
	createUseUpdate,
} from "@/lib/query/resource-helpers";
import { tipsApi } from "../api/tips.api";
import { tipsKeys } from "./tips.keys";

export const tipsListOptions = createListOptions(tipsKeys, tipsApi.list);

export function useTipsList(params?: ListTipsQuery) {
	return useQuery(tipsListOptions(params));
}

export const useCreateTip = createUseCreate<
	CreateTipDto,
	Awaited<ReturnType<typeof tipsApi.create>>
>(tipsKeys, tipsApi.create);

export const useUpdateTip = createUseUpdate<
	UpdateTipDto,
	Awaited<ReturnType<typeof tipsApi.update>>
>(tipsKeys, tipsApi.update);

export const useDeleteTip = createUseDelete(tipsKeys, tipsApi.remove);
