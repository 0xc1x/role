import { z } from 'zod';
import { CONTACT_ROLES } from '../enums/contact.enum';

export const CreateContactSchema = z
  .object({
    name: z.string().trim().max(120).optional().default(''),
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(CONTACT_ROLES),
    city: z.string().trim().min(1).max(100),
    city_other: z.string().trim().min(1).max(100).optional(),
    message: z.string().trim().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.city === 'Otra' && !v.city_other) {
      ctx.addIssue({
        code: 'custom',
        path: ['city_other'],
        message: 'Indica la ciudad',
      });
    }
  });
