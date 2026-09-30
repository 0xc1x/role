import type { BusinessDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { ActiveCell } from "@/components/data-table/cells/active-cell";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { useUpdateBusiness } from "@/features/businesses/queries/businesses.queries";
import { ActionCell } from "@/features/businesses/tables/cells/action-cell";
import { VerificationBadge } from "@/features/businesses/tables/cells/verification-badge";
import type { CsvColumn } from "@/lib/csv";
import { businessVerificationLabel } from "@/lib/labels";

const ActiveCellWrapper = ({ row }: { row: { original: BusinessDto } }) => {
	const updateMutation = useUpdateBusiness();
	return (
		<ActiveCell
			active={row.original.is_active}
			onToggle={(checked) =>
				updateMutation.mutate({
					id: row.original.id,
					body: { is_active: checked },
				})
			}
			isPending={updateMutation.isPending}
			label="Negocio"
		/>
	);
};

export const columns: ColumnDef<BusinessDto>[] = [
	{
		accessorKey: "name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Negocio" />
		),
		cell: ({ row }) => (
			<div className="font-medium">{row.getValue("name")}</div>
		),
	},
	{
		// El correo es la vía de contacto real: sin él, verificar es un sello.
		accessorKey: "email",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Correo" />
		),
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{row.getValue("email") ?? "—"}
			</span>
		),
	},
	{
		accessorKey: "phone",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Teléfono" />
		),
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{row.getValue("phone") ?? "—"}
			</span>
		),
	},
	{
		accessorKey: "type",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Tipo" />
		),
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{row.getValue("type")}
			</span>
		),
	},
	{
		accessorKey: "verification_status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Estado" />
		),
		cell: ({ row }) => (
			<VerificationBadge status={row.getValue("verification_status")} />
		),
	},
	{
		accessorKey: "is_active",
		header: "Activo",
		cell: ({ row }) => <ActiveCellWrapper row={row} />,
	},
	{
		accessorKey: "created_at",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Creado" />
		),
		cell: ({ row }) => {
			const v = row.getValue("created_at") as string;
			return (
				<span className="text-sm text-muted-foreground">
					{new Date(v).toLocaleDateString("es-EC")}
				</span>
			);
		},
	},
	{
		id: "actions",
		header: "Acciones",
		enableHiding: false,
		cell: ({ row }) => <ActionCell row={row} />,
	},
];

/**
 * Exportación del padrón de negocios, en el mismo orden que las columnas de
 * arriba. Los estados van traducidos igual que en pantalla: un `approved` suelto
 * en la hoja obliga a mirar el otro lado del archivo para saber qué significa.
 *
 * `created_at` sale en ISO y no en `es-EC` como la tabla: la hoja lo usa para
 * ordenar y filtrar, y el formato regional depende de la máquina de quien abre.
 */
export const businessesCsvColumns: CsvColumn<BusinessDto>[] = [
	{ label: "Negocio", value: (b) => b.name },
	{ label: "Correo", value: (b) => b.email },
	{ label: "Teléfono", value: (b) => b.phone },
	{ label: "Tipo", value: (b) => b.type },
	{
		label: "Estado de verificación",
		value: (b) => businessVerificationLabel(b.verification_status),
	},
	{ label: "Activo", value: (b) => (b.is_active ? "Sí" : "No") },
	{
		// La API la guarda como fracción (0.15). Se exporta en puntos para que
		// coincida con la columna de comisiones y no Invite a multiplicar por 100.
		label: "Comisión (%)",
		value: (b) => (b.commission_rate === null ? "" : b.commission_rate * 100),
	},
	{ label: "Creado", value: (b) => b.created_at },
];
