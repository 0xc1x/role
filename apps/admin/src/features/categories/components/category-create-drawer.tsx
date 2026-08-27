import { categoriesKeys } from "@/features/categories";
import { ResourceCreateDrawer } from "@/components/resource/resource-drawer";
import { CategoryForm } from "../forms/category.form";

export function CategoryCreateDrawer() {
	return (
		<ResourceCreateDrawer
			formId="create-category-drawer-form"
			mutationKey={categoriesKeys.all}
			title="Categoría"
			description="Crear una nueva categoría"
			triggerLabel="Crear Categoría"
			submitLabel="Crear Categoria"
			creatingLabel="Creando categoria"
		>
			{({ formId, onSuccess }) => (
				<CategoryForm formId={formId} onSuccess={onSuccess} />
			)}
		</ResourceCreateDrawer>
	);
}
