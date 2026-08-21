import type { CategoryDto } from "@0xc1x/role-commons";
import { useIsMutating } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
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
	const FORM_ID = "update-category-drawer-form";
	const isMutating = useIsMutating({ mutationKey: categoriesKeys.all }) > 0;

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			swipeDirection="right"
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Categoría</DrawerTitle>
					<DrawerDescription>
						Actualiza una categoría existente
					</DrawerDescription>
				</DrawerHeader>

				<div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
					<CategoryForm
						formId={FORM_ID}
						category={category}
						onSuccess={onClose}
					/>
				</div>

				<DrawerFooter>
					<Button type="submit" form={FORM_ID} disabled={isMutating}>
						{isMutating ? (
							<>
								<Spinner /> Actualziando categoria
							</>
						) : (
							"Actualizar Categoria"
						)}
					</Button>
					<DrawerClose>
						<Button variant="outline" className="w-full">
							Cancelar
						</Button>
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
