import type {
	AnnouncementListQuery,
	CreateAnnouncementDto,
	UpdateAnnouncementDto,
} from "@0xc1x/role-commons";
import { useQuery } from "@tanstack/react-query";
import {
	createListOptions,
	createUseCreate,
	createUseDelete,
	createUseUpdate,
} from "@/lib/query/resource-helpers";
import { announcementsApi } from "../api/announcements.api";
import { announcementsKeys } from "./announcements.keys";

export const announcementsListOptions = createListOptions(
	announcementsKeys,
	announcementsApi.list,
);

export function useAnnouncementsList(params?: AnnouncementListQuery) {
	return useQuery(announcementsListOptions(params));
}

export const useCreateAnnouncement = createUseCreate<
	CreateAnnouncementDto,
	Awaited<ReturnType<typeof announcementsApi.create>>
>(announcementsKeys, announcementsApi.create);

export const useUpdateAnnouncement = createUseUpdate<
	UpdateAnnouncementDto,
	Awaited<ReturnType<typeof announcementsApi.update>>
>(announcementsKeys, announcementsApi.update);

export const useDeleteAnnouncement = createUseDelete(
	announcementsKeys,
	announcementsApi.remove,
);

/**
 * Los avisos obligatorios que están vigentes, que es lo que el formulario usa
 * para avisar del apilado (D10).
 *
 * El aviso vive en el PANEL y no en `packages/commons` por una razón concreta:
 * "ya hay otro `required`" es un hecho sobre el mundo, no una forma de fila. El
 * contrato describe qué es un anuncio; cuántos hay publicados es una consulta, y
 * meterla en el schema ampliaría el read path —que mobile, landing y API
 * comparten— para algo que ningún consumidor necesita.
 *
 * `limit: 100` es el tope del contrato y no un capricho: el conteo sale de
 * `meta.total` del servidor, así que la página no se recorta y el aviso puede
 * decir cuántos hay sin paginar. Si someday hay más de 100 obligatorios
 * vigentes, el aviso va a decir 100: es un caso patológico —100 modales
 * obligatorios apilados no lo va a publicar un humano— y del lado conservador.
 */
export function useActiveRequiredAnnouncements() {
	return useQuery(
		announcementsListOptions({
			page: 1,
			limit: 100,
			active: true,
			severity: "required",
		}),
	);
}
