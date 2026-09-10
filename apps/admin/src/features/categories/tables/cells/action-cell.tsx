import type { CategoryDto } from "@0xc1x/role-commons";
import type { Row } from "@tanstack/react-table";
import { ResourceActionCell } from "@/components/data-table/resource-action-cell";
import { CategoryUpdateDrawer, useDeleteCategory } from "@/features/categories";

export function ActionCell({ row }: { row: Row<CategoryDto> }) {
	return (
		<ResourceActionCell
			row={row}
			entityName="categoría"
			displayName={(c) => c.name}
			editLabel="Editar Categoría"
			deleteTitle="¿Eliminar categoría?"
			deleteDescription={(name) => (
				<>
					Esta acción no se puede deshacer. Se eliminará permanentemente la
					categoría <span className="font-medium text-foreground">{name}</span>.
				</>
			)}
			useDelete={useDeleteCategory}
			renderEditor={(category, onClose) =>
				category && (
					<CategoryUpdateDrawer
						category={category}
						isOpen={true}
						onClose={onClose}
					/>
				)
			}
		/>
	);
}
