import { z } from "zod";
import {
	AddressTypeSchema,
	TimestamptzSchema,
	UuidSchema,
} from "../../_common/schemas/common";

export const SavedAddressSchema = z.object({
	id: UuidSchema,
	user_id: UuidSchema,
	label: z.string().min(1),
	address: z.string().min(1),
	latitude: z.number(),
	longitude: z.number(),
	is_default: z.boolean(),
	type: AddressTypeSchema,
	references: z.string().nullable(),
	housing_type: z.string().nullable(),
	created_at: TimestamptzSchema,
	updated_at: TimestamptzSchema,
});

export const CreateSavedAddressSchema = z.object({
	user_id: UuidSchema,
	label: z.string().min(1),
	address: z.string().min(1),
	latitude: z.number(),
	longitude: z.number(),
	is_default: z.boolean().optional(),
	type: AddressTypeSchema.optional(),
	references: z.string().nullable().optional(),
	housing_type: z.string().nullable().optional(),
});

/**
 * Body for saving one of my addresses.
 *
 * `user_id` is absent ON PURPOSE, while {@link CreateSavedAddressSchema} keeps it:
 * that schema mirrors the table row (and is what a service-level insert is built
 * from), whereas this one is a public request body. The owner of an address is
 * always the authenticated caller, so accepting it from the wire would only
 * create a way to write into someone else's address book.
 *
 * `is_default` stays optional on the wire because its effective value is an
 * application rule and not a column default: the first address a user saves has
 * to become their default, or the book would start with no default at all. See
 * `SavedAddressesService.create` — the API is the only place that rule lives.
 */
export const AddSavedAddressRequestSchema = CreateSavedAddressSchema.omit({
	user_id: true,
});

/**
 * Body for editing one of my addresses. Already safe to expose: it is the
 * {@link CreateSavedAddressSchema} partial, so it never carried `user_id`.
 */
export const UpdateSavedAddressSchema = CreateSavedAddressSchema.partial().omit(
	{
		user_id: true,
	},
);
