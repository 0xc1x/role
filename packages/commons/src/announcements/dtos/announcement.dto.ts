import type { z } from "zod";
import type { PaginatedData } from "../../_common/dtos/api.dto";
import { PaginatedDataSchema } from "../../_common/schemas/api.schema";
import { AnnouncementSchema } from "../schemas/announcement.schema";
import type {
	AnnouncementListQuerySchema,
	CreateAnnouncementSchema,
	PatchAnnouncementSchema,
	UpdateAnnouncementSchema,
} from "../schemas/announcement.schema";

/** Wire DTO for an announcement resource (matches {@link AnnouncementSchema}). */
export type AnnouncementDto = z.infer<typeof AnnouncementSchema>;

export type CreateAnnouncementDto = z.infer<typeof CreateAnnouncementSchema>;
export type UpdateAnnouncementDto = z.infer<typeof UpdateAnnouncementSchema>;
export type PatchAnnouncementDto = z.infer<typeof PatchAnnouncementSchema>;
export type AnnouncementListQuery = z.infer<typeof AnnouncementListQuerySchema>;

/**
 * Canonical list response for the admin table:
 * `{ data: Announcement[], meta: PaginationMeta }`.
 *
 * Vive acá y no junto a los demás schemas porque es el contrato de SALIDA que
 * la API arma y el panel valida: lo necesitaban los dos como valor, no solo
 * como tipo.
 */
export const PaginatedAnnouncementsSchema =
	PaginatedDataSchema(AnnouncementSchema);

export type PaginatedAnnouncements = PaginatedData<AnnouncementDto>;
