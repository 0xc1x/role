import type {
	AnnouncementDto,
	AnnouncementListQuery,
	CreateAnnouncementDto,
	PaginatedAnnouncements,
	UpdateAnnouncementDto,
} from "@0xc1x/role-commons";
import { createResourceApi } from "@/lib/api/resource";

/**
 * El listado del panel es `/announcements/admin` y no el público: el público lo
 * lee la app con la sesión de quien pregunta y la policy decide la audiencia.
 * Un panel que pidiera el público vería solo los avisos que le tocan a un
 * anónimo, que no es la lista que el operador administra.
 */
export const announcementsApi = createResourceApi<
	AnnouncementDto,
	CreateAnnouncementDto,
	UpdateAnnouncementDto,
	AnnouncementListQuery,
	PaginatedAnnouncements
>("/announcements", "/announcements/admin");
