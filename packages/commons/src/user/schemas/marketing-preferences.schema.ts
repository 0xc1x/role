import { z } from "zod";
import { MARKETING_CATEGORIES } from "../../email/enums/email.enum";
import { TimestamptzSchema, UuidSchema } from "../../_common/schemas/common";

/**
 * The marketing categories a preference row can name.
 *
 * Same union, same source, as `CampaignSchema.category` and
 * `CreateSegmentSchema.category`: `EmailMarketingRepository.findSubscribedRecipients`
 * resolves recipients with `arrayContains(marketing_preferences.categories,
 * [category])` where `category` is the campaign's own, so a value outside this
 * union can never match a campaign and is therefore a preference the user
 * believes they hold and that does nothing. Declaring it here is what turns
 * that from a stored lie into a 400.
 */
export const MarketingCategorySchema = z.enum(MARKETING_CATEGORIES);

/**
 * `public.marketing_preferences`, the CONSUMER row.
 *
 * NOT the same table as `consumer_notification_preferences` (which
 * `GET /me/notification-preferences` already serves) and not the same table as
 * `business_notification_preferences` (the business-side counterpart of that
 * one). This row is about CAMPAIGN SUBSCRIPTION — whether marketing email and
 * push campaigns may reach this person — and it is the only one of the three
 * with a compliance-visible unsubscribe timestamp.
 *
 * There is no `created_at`: the column does not exist on the table, and the
 * earliest evidence this row has is `unsubscribed_at`.
 */
export const MarketingPreferencesSchema = z.object({
	user_id: UuidSchema,
	is_subscribed: z.boolean(),
	/**
	 * Declared as the union rather than `z.string()` on purpose — see
	 * {@link MarketingCategorySchema}. The read side filters values outside the
	 * union (a row written straight through PostgREST by mobile can hold one),
	 * so a response never carries a category the platform cannot deliver.
	 */
	categories: z.array(MarketingCategorySchema),
	/**
	 * WHEN the person unsubscribed, not merely that they did. Stamped by the
	 * server: see `UpdateMyMarketingPreferencesSchema`.
	 */
	unsubscribed_at: TimestamptzSchema.nullable(),
	/**
	 * Provenance of the current state: `seed` (the migration backfill), `app`
	 * (this API) or `email_link` (the footer unsubscribe link). Read-only —
	 * a caller cannot claim a source, because the whole point of the column is
	 * that it is written by whoever actually performed the change.
	 */
	source: z.string().nullable(),
	updated_at: TimestamptzSchema,
});

/**
 * `PATCH /me/marketing-preferences` — the two columns a person owns.
 *
 * Three columns are STRUCTURALLY ABSENT, each for its own reason, and each of
 * them is the reason a `marketing_preferences` write through this API is
 * better than the same write through PostgREST:
 *
 *  - `user_id`. The row is keyed by the token subject. The API connects as the
 *    table's owner and is therefore exempt from this table's RLS policies, so
 *    the only thing keeping a caller inside its own row is the `where user_id =
 *    caller` in the repository plus this omission.
 *  - `unsubscribed_at`. THE SERVER STAMPS IT, and it is the strongest position
 *    available: the column is the compliance-visible half of an unsubscribe, so
 *    a caller-supplied timestamp is a caller-supplied audit record. Every
 *    existing writer in this codebase agrees — `EmailMarketingRepository.unsubscribe`
 *    and `AuthAccountRepository`'s account anonymisation both set it to
 *    `new Date()`. The consequence is stated in the spec so the behaviour is
 *    pinned rather than implied.
 *  - `source`. Provenance. The server writes `'app'`; accepting it from a body
 *    would let a caller label their own unsubscribe as something it was not,
 *    and the only other two values in the column's history (`seed`, `email_link`)
 *    are written by the migration and by the footer link respectively.
 *
 * `is_subscribed` and `categories` are independently optional: the first
 * answers "may campaigns reach me" and the second "which of them", and a
 * client that only renders a master switch must not have to restate the list.
 */
export const UpdateMyMarketingPreferencesSchema = z.object({
	is_subscribed: z.boolean().optional(),
	/**
	 * Bounded by the size of the union, which is the real limit: three
	 * categories exist, so a longer array is a client bug and would write a
	 * `text[]` no dispatch can ever match.
	 */
	categories: z
		.array(MarketingCategorySchema)
		.max(MARKETING_CATEGORIES.length)
		.optional(),
});

/**
 * The standalone `GET`/`PATCH`, wrapped in the same key shape the rest of `/me`
 * uses, so a client decoding this resource and the aggregate account snapshot
 * has one decoder. See `MePreferencesSchema` for why the wrapper exists at all
 * (a handler returning a bare `null` produces an empty 200 body).
 */
export const MeMarketingPreferencesSchema = z.object({
	marketing_preferences: MarketingPreferencesSchema.nullable(),
});
