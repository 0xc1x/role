import type { z } from "zod";
import type {
	RestoreBusinessOwnershipResponseSchema,
	RestoreBusinessOwnershipSchema,
	TransferBusinessOwnershipResponseSchema,
	TransferBusinessOwnershipSchema,
} from "../schemas/business-ownership.schema";

export type TransferBusinessOwnershipDto = z.infer<
	typeof TransferBusinessOwnershipSchema
>;
export type TransferBusinessOwnershipResponseDto = z.infer<
	typeof TransferBusinessOwnershipResponseSchema
>;
export type RestoreBusinessOwnershipDto = z.infer<
	typeof RestoreBusinessOwnershipSchema
>;
export type RestoreBusinessOwnershipResponseDto = z.infer<
	typeof RestoreBusinessOwnershipResponseSchema
>;
