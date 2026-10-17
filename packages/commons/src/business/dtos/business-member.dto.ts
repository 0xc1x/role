import type { z } from "zod";
import type {
	BusinessMemberDeliveryCardSchema,
	BusinessMemberSchema,
	CreateBusinessMemberSchema,
	RotateBusinessMemberPinSchema,
	UpdateBusinessMemberAliasResponseSchema,
	UpdateBusinessMemberAliasSchema,
	UpdateBusinessMemberSchema,
} from "../schemas/business-member.schema";

export type BusinessMemberDto = z.infer<typeof BusinessMemberSchema>;
export type CreateBusinessMemberDto = z.infer<
	typeof CreateBusinessMemberSchema
>;
export type UpdateBusinessMemberDto = z.infer<
	typeof UpdateBusinessMemberSchema
>;
export type UpdateBusinessMemberAliasDto = z.infer<
	typeof UpdateBusinessMemberAliasSchema
>;
export type RotateBusinessMemberPinDto = z.infer<
	typeof RotateBusinessMemberPinSchema
>;
export type BusinessMemberDeliveryCardDto = z.infer<
	typeof BusinessMemberDeliveryCardSchema
>;
export type UpdateBusinessMemberAliasResponseDto = z.infer<
	typeof UpdateBusinessMemberAliasResponseSchema
>;
