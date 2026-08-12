import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto'
import {
    CreateSlideSchema,
    ListSlidesQuerySchema,
    PatchSlideSchema,
    SlideListResponseSchema,
    SlideSchema,
    UpdateSlideSchema,
    ViewSlideSchema
} from '../schemas/slide.schema'

export type SlideDto = z.infer<typeof SlideSchema>;

export type CreateSlideDto = z.infer<typeof CreateSlideSchema>;
export type UpdateSlideDto = z.infer<typeof UpdateSlideSchema>;
export type ViewSlideDto = z.infer<typeof ViewSlideSchema>;
export type PatchSlideDto = z.infer<typeof PatchSlideSchema>;
export type ListSlideQuery = z.infer<typeof ListSlidesQuerySchema>;

export type SlideListResponse = z.infer<typeof SlideListResponseSchema>;

export type SlidePaginatedData = PaginatedData<SlideDto>;