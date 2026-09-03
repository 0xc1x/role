import { z } from 'zod';
import { CreateContactSchema } from '../schemas/contact.schema';

export type CreateContactDto = z.infer<typeof CreateContactSchema>;
