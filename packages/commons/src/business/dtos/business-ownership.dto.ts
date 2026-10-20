import type { z } from "zod";
import type {
	TransferBusinessOwnershipResponseSchema,
	TransferBusinessOwnershipSchema,
} from "../schemas/business-ownership.schema";

export type TransferBusinessOwnershipDto = z.infer<
	typeof TransferBusinessOwnershipSchema
>;
export type TransferBusinessOwnershipResponseDto = z.infer<
	typeof TransferBusinessOwnershipResponseSchema
>;
