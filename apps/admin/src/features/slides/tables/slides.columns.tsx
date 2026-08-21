import type { SlideDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { ActiveCell } from "@/components/data-table/cells/active-cell";
import { ImageCell } from "@/components/data-table/cells/image-cell";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import {
	useUpdateSlide,
	useUploadImage,
} from "@/features/slides/queries/slides.queries";
import { SlideEditDrawer } from "../components/slide-edit-drawer";

const ActiveCellWrapper = ({ row }: { row: { original: SlideDto } }) => {
	const updateMutation = useUpdateSlide();
	return (
		<ActiveCell
			active={row.original.active}
			onToggle={(checked) =>
				updateMutation.mutate({
					id: row.original.id,
					body: { active: checked },
				})
			}
			isPending={updateMutation.isPending}
			label="Slide"
		/>
	);
};

const ImageCellWrapper = ({ row }: { row: { original: SlideDto } }) => {
	const uploadMutation = useUploadImage();
	const updateMutation = useUpdateSlide();

	const handleSave = async (file: File | null) => {
		if (file) {
			const { url } = await uploadMutation.mutateAsync(file);
			await updateMutation.mutateAsync({
				id: row.original.id,
				body: { image_url: url },
			});
		}
	};

	return (
		<ImageCell
			imageUrl={row.original.image_url}
			name={row.original.title}
			onSave={handleSave}
		/>
	);
};

export const columns: ColumnDef<SlideDto>[] = [
	{
		accessorKey: "image_url",
		header: "Imagen",
		enableSorting: false,
		cell: ({ row }) => <ImageCellWrapper row={row} />,
	},
	{
		accessorKey: "title",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Nombre" />
		),
	},
	{
		accessorKey: "caption",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Caption" />
		),
	},
	{
		accessorKey: "badge",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Badge" />
		),
		cell: ({ row }) => <Badge>{row.getValue("badge_text")}</Badge>,
	},
	{
		accessorKey: "cta",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Call to action" />
		),
	},
	{
		accessorKey: "redirect_url",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="URL Redirecion" />
		),
	},
	{
		accessorKey: "color",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Color" />
		),
	},
	{
		accessorKey: "buttom-color",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Color del boton" />
		),
	},
	{
		accessorKey: "type",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Tipo" />
		),
	},
	{
		accessorKey: "priority",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Prioridad" />
		),
	},
	{
		accessorKey: "active",
		header: "Estado",
		cell: ({ row }) => <ActiveCellWrapper row={row} />,
	},
	{
		accessorKey: "start_at",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Empieza" />
		),
	},
	{
		accessorKey: "end_at",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Termina" />
		),
	},
	{
		id: "actions",
		header: "",
		enableSorting: false,
		cell: ({ row }) => <SlideEditDrawer slide={row.original} />,
	},
];
