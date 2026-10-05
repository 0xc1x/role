import type { TipDto } from "@0xc1x/role-commons";
import type { Row } from "@tanstack/react-table";
import { ResourceActionCell } from "@/components/data-table/resource-action-cell";
import { TipUpdateDrawer, useDeleteTip } from "@/features/tips";

export function ActionCell({ row }: { row: Row<TipDto> }) {
	return (
		<ResourceActionCell
			row={row}
			entityName="consejo"
			displayName={(t) => t.content}
			editLabel="Editar consejo"
			deleteTitle="¿Desactivar consejo?"
			// `deleteVerb` porque el `DELETE` de tips es `softDelete`
			// (`deleted_at` + `active = false`): la fila no se borra, y el verbo
			// "Eliminar" del menú —en rojo destructivo— hacía creer lo contrario.
			deleteVerb="Desactivar"
			deleteDescription={(name) => (
				<>
					El consejo <span className="font-medium text-foreground">{name}</span>{" "}
					deja de mostrarse en la app. La fila se conserva y no hay forma de
					reactivarla desde el panel.
				</>
			)}
			useDelete={useDeleteTip}
			renderEditor={(tip, onClose) =>
				tip && <TipUpdateDrawer tip={tip} isOpen={true} onClose={onClose} />
			}
		/>
	);
}
