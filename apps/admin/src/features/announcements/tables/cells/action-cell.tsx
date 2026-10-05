import type { AnnouncementDto } from "@0xc1x/role-commons";
import type { Row } from "@tanstack/react-table";
import { ResourceActionCell } from "@/components/data-table/resource-action-cell";
import { AnnouncementUpdateDrawer } from "@/features/announcements/components/announcement-update-drawer";
import { useDeleteAnnouncement } from "@/features/announcements/queries/announcements.queries";

/**
 * El `DELETE` de announcements es un soft delete: `active = false`. El diálogo
 * lo dice, porque el texto por defecto de `ResourceActionCell` —"se eliminará
 * permanentemente"— sería falso acá y haría que el operador tema perder un aviso
 * que puede volver a activar.
 *
 * Es además la única vía para bajar un `specific` sin destino: el PATCH lo
 * rechaza el service, y esta acción no pasa por el predicado de audiencia.
 */
export function ActionCell({ row }: { row: Row<AnnouncementDto> }) {
	return (
		<ResourceActionCell
			row={row}
			entityName="aviso"
			displayName={(a) => a.title}
			editLabel="Editar aviso"
			deleteTitle="¿Desactivar este aviso?"
			// El `DELETE` de announcements es un soft delete (`active = false`), así
			// que el verbo del menú —que venía hardcodeado como "Eliminar", en rojo
			// destructivo— decía una cosa y el diálogo otra.
			deleteVerb="Desactivar"
			deleteDescription={(name) => (
				<>
					<span className="font-medium text-foreground">{name}</span> deja de
					mostrarse en la app. No se borra nada: la fila se conserva y podés
					volver a activarla desde la edición.
				</>
			)}
			useDelete={useDeleteAnnouncement}
			renderEditor={(announcement, onClose) =>
				announcement && (
					<AnnouncementUpdateDrawer
						announcement={announcement}
						isOpen={true}
						onClose={onClose}
					/>
				)
			}
		/>
	);
}
