import type { PushTokenDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { ActiveCell } from "@/components/data-table/cells/active-cell";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUpdatePushToken } from "../queries/push.queries";

const PlatformBadge = ({ platform }: { platform: string }) => {
	const colors: Record<string, string> = {
		ios: "bg-gray-500/10 text-gray-700 border-gray-200",
		android: "bg-green-500/10 text-green-600 border-green-200",
		web: "bg-blue-500/10 text-blue-600 border-blue-200",
	};
	return <Badge className={colors[platform] ?? ""}>{platform}</Badge>;
};

function TokenActions({ item }: { item: PushTokenDto }) {
	const update = useUpdatePushToken();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button variant="ghost" className="h-8 w-8 p-0" />}
			>
				<span className="sr-only">Abrir menú</span>
				<MoreHorizontal className="size-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Acciones</DropdownMenuLabel>
					<DropdownMenuItem
						onClick={() => navigator.clipboard.writeText(item.user_id)}
					>
						Copiar ID usuario
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onClick={() =>
							update.mutate(
								{ id: item.id, is_active: !item.is_active },
								{
									onError: (err) =>
										toast.error(
											err instanceof Error ? err.message : "Error inesperado",
										),
								},
							)
						}
					>
						{item.is_active ? "Desactivar token" : "Reactivar token"}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export const tokenColumns: ColumnDef<PushTokenDto>[] = [
	{
		accessorKey: "user_email",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Usuario" />
		),
		cell: ({ row }) => (
			<div className="max-w-56">
				<p className="truncate text-sm font-medium">
					{row.original.user_full_name ?? "Sin nombre"}
				</p>
				<p className="truncate text-xs text-muted-foreground">
					{row.original.user_email ?? row.original.user_id}
				</p>
			</div>
		),
	},
	{
		accessorKey: "platform",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Plataforma" />
		),
		cell: ({ row }) => <PlatformBadge platform={row.getValue("platform")} />,
	},
	{
		accessorKey: "token",
		header: "Token",
		cell: ({ row }) => (
			<span className="font-mono text-xs text-muted-foreground">
				{row.original.token.slice(0, 18)}…
			</span>
		),
	},
	{
		accessorKey: "is_active",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Activo" />
		),
		cell: ({ row }) => <TokenActiveCell item={row.original} />,
	},
	{
		accessorKey: "updated_at",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Actualizado" />
		),
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{new Date(row.getValue("updated_at") as string).toLocaleString("es-EC")}
			</span>
		),
	},
	{
		id: "actions",
		header: "Acciones",
		enableHiding: false,
		cell: ({ row }) => <TokenActions item={row.original} />,
	},
];

function TokenActiveCell({ item }: { item: PushTokenDto }) {
	const update = useUpdatePushToken();
	return (
		<ActiveCell
			active={item.is_active}
			onToggle={(checked) =>
				update.mutate(
					{ id: item.id, is_active: checked },
					{
						onError: (err) =>
							toast.error(
								err instanceof Error ? err.message : "Error inesperado",
							),
					},
				)
			}
			isPending={update.isPending}
			label="Token"
		/>
	);
}
