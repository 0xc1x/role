import { describe, expect, it } from "bun:test";
import {
	ChangeEmailRequestSchema,
	ForgotPasswordRequestSchema,
	ForgotPasswordResponseSchema,
	LoginRequestSchema,
	PasswordSchema,
	RefreshRequestSchema,
	RegisterRequestSchema,
	ResetPasswordRequestSchema,
	StaffSessionStateSchema,
} from "../schemas/auth.schema";

describe("LoginRequestSchema", () => {
	it("accepts valid credentials", () => {
		expect(
			LoginRequestSchema.safeParse({ email: "a@b.com", password: "secret" })
				.success,
		).toBe(true);
	});

	it("rejects short password", () => {
		expect(
			LoginRequestSchema.safeParse({ email: "a@b.com", password: "12345" })
				.success,
		).toBe(false);
	});
});

describe("RegisterRequestSchema", () => {
	it("accepts valid registration", () => {
		expect(
			RegisterRequestSchema.safeParse({
				email: "a@b.com",
				password: "password1",
				full_name: "Ana López",
			}).success,
		).toBe(true);
	});

	it("rejects password shorter than 8", () => {
		expect(
			RegisterRequestSchema.safeParse({
				email: "a@b.com",
				password: "short",
				full_name: "Ana",
			}).success,
		).toBe(false);
	});
});

describe("RefreshRequestSchema", () => {
	it("requires refresh_token", () => {
		expect(RefreshRequestSchema.safeParse({}).success).toBe(false);
		expect(
			RefreshRequestSchema.safeParse({ refresh_token: "tok" }).success,
		).toBe(true);
	});
});

describe("the password policy is one rule, not two", () => {
	it("register and reset accept the same passwords", () => {
		// The recovery flow must not be stricter or laxer than signup: the user
		// is choosing a password they already use everywhere else, and a
		// difference in either direction is a bug with a support ticket behind
		// it. Sharing one constant is what makes that a structural property.
		for (const password of ["1234567", "12345678", "una-clave-larga"]) {
			expect(
				RegisterRequestSchema.safeParse({
					email: "a@b.com",
					password,
					full_name: "Ana",
				}).success,
			).toBe(PasswordSchema.safeParse(password).success);
			expect(
				ResetPasswordRequestSchema.safeParse({
					access_token: "tok",
					password,
				}).success,
			).toBe(PasswordSchema.safeParse(password).success);
		}
	});

	it("rejects a password under 8 on both paths", () => {
		expect(
			RegisterRequestSchema.safeParse({
				email: "a@b.com",
				password: "corto",
				full_name: "Ana",
			}).success,
		).toBe(false);
		expect(
			ResetPasswordRequestSchema.safeParse({
				access_token: "tok",
				password: "corto",
			}).success,
		).toBe(false);
	});
});

describe("ForgotPasswordRequestSchema", () => {
	it("takes an address and nothing else", () => {
		// No captcha token, and above all no caller-supplied redirect: on an
		// unauthenticated route a caller-chosen redirect target is a phishing
		// primitive.
		expect(
			ForgotPasswordRequestSchema.safeParse({ email: "a@b.com" }).success,
		).toBe(true);
		expect(ForgotPasswordRequestSchema.safeParse({}).success).toBe(false);
		expect(
			ForgotPasswordRequestSchema.safeParse({
				email: "a@b.com",
				redirect_to: "https://evil.example",
			}).success,
		).toBe(true);
		expect(
			Object.keys(
				ForgotPasswordRequestSchema.parse({
					email: "a@b.com",
					redirect_to: "https://evil.example",
				}),
			),
		).toEqual(["email"]);
	});
});

describe("the forgot-password body is the same for both branches", () => {
	it("is a single { message } and carries no branch marker", () => {
		const known = ForgotPasswordResponseSchema.parse({
			message: "If that address matches an account, a link is on its way.",
		});
		const unknown = ForgotPasswordResponseSchema.parse({
			message: "If that address matches an account, a link is on its way.",
		});

		// A status, a message, a key or a nullable field that differs is the
		// oracle. The schema is the smallest object that can hold the honest
		// answer, so there is nowhere for a branch to leak into.
		expect(known).toEqual(unknown);
		expect(Object.keys(known)).toEqual(["message"]);
		expect(
			ForgotPasswordResponseSchema.safeParse({
				message: "x",
				account_exists: true,
			}).success,
		).toBe(true);
		expect(Object.keys(known)).toEqual(["message"]);
	});
});

describe("ResetPasswordRequestSchema", () => {
	it("requires the token and the new password", () => {
		expect(
			ResetPasswordRequestSchema.safeParse({ password: "nueva-clave" }).success,
		).toBe(false);
		expect(
			ResetPasswordRequestSchema.safeParse({ access_token: "tok" }).success,
		).toBe(false);
		expect(
			ResetPasswordRequestSchema.safeParse({
				access_token: "tok",
				password: "nueva-clave",
			}).success,
		).toBe(true);
	});

	it("has no role key, so a body cannot carry one", () => {
		// The API writes `profiles` as the table owner, so nothing below the
		// schema would stop a role change. The allowlist is the schema.
		const parsed = ResetPasswordRequestSchema.parse({
			access_token: "tok",
			password: "nueva-clave",
			role: "admin",
		});
		expect("role" in parsed).toBe(false);
	});
});

describe("ChangeEmailRequestSchema", () => {
	it("takes the requested address and nothing else", () => {
		expect(
			ChangeEmailRequestSchema.safeParse({ new_email: "nuevo@b.com" }).success,
		).toBe(true);
		expect(ChangeEmailRequestSchema.safeParse({}).success).toBe(false);
		expect(
			ChangeEmailRequestSchema.safeParse({ email: "nuevo@b.com" }).success,
		).toBe(false);
		const parsed = ChangeEmailRequestSchema.parse({
			new_email: "nuevo@b.com",
			role: "admin",
			email: "otro@b.com",
		});
		expect(Object.keys(parsed)).toEqual(["new_email"]);
	});
});

describe("StaffSessionStateSchema", () => {
	const ids = ["e2000000-0000-4000-8000-000000000001"];
	const locationIds = ["e3000000-0000-4000-8000-000000000001"];

	it("knows the six reasons the database returns", () => {
		// The list is the RPC's, and this is the assertion that the schema has all
		// of it. A seventh reason in the database would have to be added HERE — the
		// schema is the copy that is wrong, and narrowing the enum instead would
		// silently drop the value and render "you were paused" at whoever it was
		// describing.
		for (const reason of [
			"ok",
			"no_membership",
			"multiple_businesses",
			"disabled",
			"session_expired",
			"session_never_stamped",
		]) {
			expect(
				StaffSessionStateSchema.safeParse({
					role: null,
					location_ids: [],
					expires_at: null,
					reason,
					business_ids: ids,
				}).success,
				reason,
			).toBe(true);
		}
	});

	it("rejects a reason nobody defined", () => {
		expect(
			StaffSessionStateSchema.safeParse({
				role: null,
				location_ids: [],
				expires_at: null,
				reason: "banned_for_being_rude",
				business_ids: ids,
			}).success,
		).toBe(false);
	});

	it("`role: null` is an answer, not a broken row", () => {
		// §9.3: a person with several businesses is `multiple_businesses`, not
		// `ok`, and a null role is exactly why the panel asks which business rather
		// than guessing one. A schema that required a role would make the exit the
		// panel has to explain unrepresentable.
		const parsed = StaffSessionStateSchema.parse({
			role: null,
			location_ids: [],
			expires_at: null,
			reason: "multiple_businesses",
			business_ids: [...ids, "e2000000-0000-4000-8000-000000000002"],
		});
		expect(parsed.role).toBeNull();
		expect(parsed.business_ids).toHaveLength(2);
	});

	it("an `ok` carries the role, the scope and no expiry date", () => {
		// `session_ttl_hours = 0` produces exactly this: a live session with no
		// expiration, which is not the same as an expired one.
		const parsed = StaffSessionStateSchema.parse({
			role: "owner",
			location_ids: locationIds,
			expires_at: null,
			reason: "ok",
			business_ids: ids,
		});
		expect(parsed.expires_at).toBeNull();
		expect(parsed.location_ids).toEqual(locationIds);
	});

	it("a session that did expire says so with a date", () => {
		const parsed = StaffSessionStateSchema.parse({
			role: "staff",
			location_ids: locationIds,
			expires_at: "2026-10-16T09:00:00+00:00",
			reason: "session_expired",
			business_ids: ids,
		});
		expect(parsed.reason).toBe("session_expired");
	});

	it("an unknown role is rejected rather than cast to null", () => {
		expect(
			StaffSessionStateSchema.safeParse({
				role: "admin",
				location_ids: [],
				expires_at: null,
				reason: "ok",
				business_ids: ids,
			}).success,
		).toBe(false);
	});
});
