import { z } from "zod";
import { ConsumerNotificationPreferencesSchema } from "./consumer-notification-preferences.schema";
import { CreateDeviceTokenSchema } from "./device-token.schema";
import { ProfileSchema } from "./profile.schema";
import { ConsentTypeSchema, UserConsentSchema } from "./user-consent.schema";
import {
	UpdateUserPreferencesSchema,
	UserPreferencesSchema,
} from "./user-preferences.schema";

/**
 * Self-service profile edit.
 *
 * `role` IS STRUCTURALLY ABSENT, not stripped: it is not a key of this object, so
 * a body carrying it parses into a value that has nowhere to put it, and there is
 * no code path — controller, service or repository — that receives a role from a
 * self-service caller. The API connects as the `postgres` pooler role, which is
 * the owner of `profiles` and therefore bypasses both RLS and the column-level
 * grants, so the database cannot stop this service from writing `role` either;
 * the allowlist has to live here. The `handle_new_user` trigger keeps the same
 * allowlist for the same reason.
 *
 * Deliberately NOT `.strict()`: the requirement is that `role` cannot change the
 * role, and a strict object would turn a body that carries one into a 400
 * instead. A silent no-op on an unknown key is the same behaviour the admin
 * surface already has, and it keeps this schema a subset-shaped allowlist.
 *
 * `email` is the one field that IS in the schema and is still refused. It is
 * here so the service can answer with a named, actionable error instead of
 * dropping the field the way a plain strip would: a caller who asks to change
 * their address and gets a 200 has been lied to. See `MeService.updateProfile`.
 *
 * The refusal is about THIS endpoint, not about the platform: the change lives
 * at `POST /auth/change-email`, which drives the GoTrue confirmation round-trip
 * and lets the `auth.users` trigger sync `profiles.email` when it lands. A
 * client that talks to Supabase directly can also do it with
 * `supabase.auth.updateUser({ email })` (ADR-0002). What cannot happen either
 * way is a PATCH on this route writing the column on its own.
 */
export const UpdateMyProfileSchema = z.object({
	full_name: z.string().nullable().optional(),
	/**
	 * A URL, never an upload: the consumer has no image upload path in this API
	 * (`POST /upload/image` is admin-only), so this field stores a link the
	 * client already has. Validated as a URL so a client cannot store a file
	 * path or a data URI and have every other surface treat it as fetchable.
	 */
	avatar_url: z.url().nullable().optional(),
	phone: z.string().nullable().optional(),
	city: z.string().nullable().optional(),
	email: z.email().optional(),
});

/**
 * Extends the shared preferences contract instead of restating it, so a field
 * added there cannot be silently missing here. The two overrides are the ones
 * this surface owns:
 *
 *  - the radius is bounded (1..200 km). A negative or absurd radius is not a
 *    display value, it is a number the dispatch query will compare distances
 *    against.
 *  - the category list is bounded so a single request cannot write an
 *    arbitrarily long `text[]`. The CATALOG BOUND is the real limit and it is
 *    enforced against the categories catalog in `MeService`, which is the only
 *    place that knows what a category is.
 */
export const UpdateMyPreferencesSchema = UpdateUserPreferencesSchema.extend({
	notification_radius_km: z
		.number()
		.int()
		.min(1)
		.max(200)
		.nullable()
		.optional(),
	favorite_categories: z.array(z.string()).max(100).nullable().optional(),
});

/**
 * `PUT /me/consents` is keyed on the DECLARED consent union, not on a free
 * string: `user_consents.consent_type` has no CHECK constraint in the database,
 * so an unvalidated type would write a row that nothing ever reads. `granted` is
 * required — the whole point of a PUT on this collection is to set the state of
 * one consent, and "absent" is not a third state.
 */
export const UpsertMyConsentSchema = z.object({
	consent_type: ConsentTypeSchema,
	granted: z.boolean(),
});

/**
 * A device registration is `{ token, platform, device_info }` and nothing else.
 *
 * `user_id` is omitted so the owner is structurally the token subject: a body
 * carrying it parses into nothing and cannot redirect the write. `is_active` is
 * omitted because registering IS the assertion that the device wants pushes —
 * a client that does not is expected to call DELETE.
 */
export const RegisterMyDeviceSchema = CreateDeviceTokenSchema.omit({
	user_id: true,
	is_active: true,
});

/**
 * `DELETE /me/devices` identifies the device by its token, never by row id: the
 * token IS the client's identity for a push registration (the provider issues
 * it, the row id is internal), so a client that kept the row id would have to
 * keep a server-side id it never asked for.
 *
 * It arrives as a QUERY PARAMETER rather than a path segment because a push
 * token is an opaque, high-entropy string: APNs and FCM tokens have carried
 * base64 and provider-specific alphabets, and a token containing `/` or a
 * stray `%` would not survive path routing.
 */
export const RevokeMyDeviceQuerySchema = z.object({
	token: z.string().min(1).max(512),
});

/**
 * The whole signed-in account in one payload: profile, preferences, consumer
 * notification preferences and consents.
 *
 * The three settings sub-objects are NULLABLE on purpose. They are seeded by
 * the `handle_new_user` trigger chain and by `UserDefaultsService`, but this API
 * never wrote them, so a missing row is a state the caller must be able to read
 * without a 404 — the profile still exists and the caller still needs it.
 * `consents` is a LIST rather than a nullable object for the same reason: an
 * account with no consent rows has zero of them, not one missing one.
 */
export const MeAccountSchema = z.object({
	profile: ProfileSchema,
	preferences: UserPreferencesSchema.nullable(),
	notification_preferences: ConsumerNotificationPreferencesSchema.nullable(),
	consents: z.array(UserConsentSchema),
});

/**
 * The standalone `GET`/`PATCH` of each settings resource, wrapped in the same key
 * the aggregate uses.
 *
 * The wrapper is not decoration. A handler that returns a bare `null` gets an
 * EMPTY 200 body from Nest, so a client decoding JSON sees `{}` and cannot tell
 * "this account has no preferences row" from "a preferences object with nothing
 * in it". Returning the key with an explicit `null` makes the answer
 * self-describing and gives the client one decoder for the aggregate and the
 * sub-resource.
 *
 * Derived by `pick` from {@link MeAccountSchema} so the key names and their
 * nullability have exactly one definition.
 */
export const MePreferencesSchema = MeAccountSchema.pick({
	preferences: true,
});

export const MeNotificationPreferencesSchema = MeAccountSchema.pick({
	notification_preferences: true,
});
