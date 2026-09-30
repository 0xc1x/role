import type { z } from "zod";
import type { CreateContactSchema } from "../schemas/contact.schema";

export type CreateContactDto = z.infer<typeof CreateContactSchema>;
