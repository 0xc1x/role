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
			deleteTitle="¿Eliminar consejo?"
			deleteDescription={(name) => (
				<>
					Esta acción no se puede deshacer. Se eliminará permanentemente el
					consejo <span className="font-medium text-foreground">{name}</span>.
				</>
			)}
			useDelete={useDeleteTip}
			renderEditor={(tip, onClose) =>
				tip && <TipUpdateDrawer tip={tip} isOpen={true} onClose={onClose} />
			}
		/>
	);
}
