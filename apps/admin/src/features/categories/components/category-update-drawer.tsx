import type { CategoryDto } from "@0xc1x/role-commons";
import { ResourceUpdateDrawer } from "@/components/resource/resource-drawer";
import { categoriesKeys } from "@/features/categories";
import { CategoryForm } from "../forms/category.form";

export interface CategoryUpdateDrawerProps {
	category: CategoryDto;
	isOpen: boolean;
	onClose: () => void;
}

export function CategoryUpdateDrawer({
	category,
	isOpen,
	onClose,
}: CategoryUpdateDrawerProps) {
	return (
		<ResourceUpdateDrawer
			formId="update-category-drawer-form"
			mutationKey={categoriesKeys.all}
			title="Categoría"
			description="Actualiza una categoría existente"
			isOpen={isOpen}
			onClose={onClose}
			submitLabel="Actualizar Categoria"
			updatingLabel="Actualziando categoria"
		>
			<CategoryForm
				formId="update-category-drawer-form"
				category={category}
				onSuccess={onClose}
			/>
		</ResourceUpdateDrawer>
	);
}
