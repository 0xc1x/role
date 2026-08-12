import type { ColumnDef } from "@tanstack/react-table";
import type { CategoryDto } from "@0xc1x/role-commons";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { ActiveCell } from "@/components/data-table/cells/active-cell";
import { ImageCell } from "@/components/data-table/cells/image-cell";
import { ActionCell } from "@/features/categories/tables/cells/action-cell";
import { useUpdateCategory, useUploadImage } from "@/features/categories/queries/categories.queries";

const ActiveCellWrapper = ({ row }: { row: { original: CategoryDto } }) => {
    const updateMutation = useUpdateCategory();
    return (
        <ActiveCell
            active={row.original.active}
            onToggle={(checked) => updateMutation.mutate({ id: row.original.id, body: { active: checked } })}
            isPending={updateMutation.isPending}
            label="Categoría"
        />
    );
};

const ImageCellWrapper = ({ row }: { row: { original: CategoryDto } }) => {
    const uploadMutation = useUploadImage();
    const updateMutation = useUpdateCategory();

    const handleSave = async (file: File | null) => {
        if (file) {
            const { url } = await uploadMutation.mutateAsync(file);
            await updateMutation.mutateAsync({ id: row.original.id, body: { image_url: url } });
        } else {
            await updateMutation.mutateAsync({ id: row.original.id, body: { image_url: null } });
        }
    };

    return (
        <ImageCell
            imageUrl={row.original.image_url}
            name={row.original.name}
            onSave={handleSave}
        />
    );
};

export const columns: ColumnDef<CategoryDto>[] = [
    {
        accessorKey: "image_url",
        header: "Imagen",
        enableSorting: false,
        cell: ({ row }) => <ImageCellWrapper row={row} />,
    },
    {
        accessorKey: "name",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Nombre" />
        ),
        cell: ({ row }) => {
            const emoji = row.original.emoji;
            return (
                <div className="flex items-center gap-2 font-medium">
                    {emoji && <span>{emoji}</span>}
                    <span>{row.getValue("name")}</span>
                </div>
            );
        },
    },
    {
        accessorKey: "description",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Descripción" />
        ),
        cell: ({ row }) => (
            <span className="text-muted-foreground line-clamp-1">
                {row.getValue("description") ?? "—"}
            </span>
        ),
    },
    {
        accessorKey: "slug",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Slug" />
        ),
        cell: ({ row }) => (
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {row.getValue("slug")}
            </code>
        ),
    },
    {
        accessorKey: "active",
        header: "Estado",
        cell: ({ row }) => <ActiveCellWrapper row={row} />,
    },
    {
        id: "actions",
        header: "Acciones",
        enableHiding: false,
        cell: ({ row }) => <ActionCell row={row} />,
    },
];
