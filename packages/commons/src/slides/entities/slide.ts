import type { z } from 'zod';
import type { SlideSchema } from '../schemas/slide.schema';

/** Row shape for `public.slides` — derivado del schema Zod (SSOT). */
export type Slide = z.infer<typeof SlideSchema>;
