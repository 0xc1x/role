import type { z } from "zod";
import type {
	AuthResponseSchema,
	AuthUserSchema,
	ChangeEmailRequestSchema,
	ChangeEmailResponseSchema,
	ForgotPasswordRequestSchema,
	ForgotPasswordResponseSchema,
	InviteBusinessRequestSchema,
	LoginRequestSchema,
	LogoutRequestSchema,
	RefreshRequestSchema,
	RegisterRequestSchema,
	ResetPasswordRequestSchema,
	ResetPasswordResponseSchema,
} from "../schemas/auth.schema";

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;
export type ForgotPasswordResponse = z.infer<
	typeof ForgotPasswordResponseSchema
>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponseSchema>;
export type ChangeEmailRequest = z.infer<typeof ChangeEmailRequestSchema>;
export type ChangeEmailResponse = z.infer<typeof ChangeEmailResponseSchema>;
export type InviteBusinessRequest = z.infer<typeof InviteBusinessRequestSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
