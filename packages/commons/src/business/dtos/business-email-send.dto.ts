import type { z } from "zod";
import type { BusinessEmailSendSchema } from "../schemas/business-email-send.schema";

export type BusinessEmailSendDto = z.infer<typeof BusinessEmailSendSchema>;
