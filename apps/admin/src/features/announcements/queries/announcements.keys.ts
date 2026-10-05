import type { AnnouncementListQuery } from "@0xc1x/role-commons";
import { createResourceKeys } from "@/lib/query/keys";

export const announcementsKeys =
	createResourceKeys<AnnouncementListQuery>("announcements");
