import type { PushNotificationDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TypeBadge = ({ type }: { type: string }) => {
	const colors: Record<string, string> = {
		announcement: "bg-blue-500/10 text-blue-600 border-blue-200",
		promo: "bg-amber-500/10 text-amber-600 border-amber-200",
		system: "bg-purple-500/10 text-purple-600 border-purple-200",
	};
	return <Badge className={colors[type] ?? ""}>{type}</Badge>;
};

const StatusBadge = ({ status }: { status: string }) => {
	const map: Record<string, string> = {
		sent: "bg-green-500/10 text-green-600 border-green-200",
		partial: "bg-amber-500/10 text-amber-600 border-amber-200",
		failed: "bg-red-500/10 text-red-600 border-red-200",
	};
	return <Badge className={map[status] ?? ""}>{status}</Badge>;
};

/** Drawer con el detalle completo del envío registrado. */
function DetailDrawer(props: {
	item: PushNotificationDto;
	onClose: () => void;
}) {
	const i = props.item;
	return (
		<Drawer open onOpenChange={(o) => !o && props.onClose()}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>{i.title}</DrawerTitle>
				</DrawerHeader>
				<div className="space-y-4 overflow-y-auto p-4 text-sm">
					<p className="text-muted-foreground">{i.body}</p>
					<div className="grid grid-cols-3 gap-2">
						<div className="rounded-lg border p-2">
							<p className="text-xs text-muted-foreground">Alcance</p>
							<p className="font-medium">{i.total_targeted}</p>
						</div>
						<div className="rounded-lg border p-2">
							<p className="text-xs text-muted-foreground">Enviados</p>
							<p className="font-medium">{i.sent_count}</p>
						</div>
						<div className="rounded-lg border p-2">
							<p className="text-xs text-muted-foreground">Fallidos</p>
							<p className="font-medium">{i.failed_count}</p>
						</div>
					</div>
					<div>
						<p className="mb-1 text-xs font-medium text-muted-foreground">
							Audiencia
						</p>
						<p className="text-xs">
							{i.segment_ids.length} segmento(s) · {i.include_user_ids.length}{" "}
							usuario(s) incluidos · {i.exclude_user_ids.length} excluido(s)
						</p>
					</div>
					{Object.keys(i.data).length > 0 ? (
						<pre className="max-h-40 overflow-auto rounded-lg bg-muted p-2 font-mono text-xs">
							{JSON.stringify(i.data, null, 2)}
						</pre>
					) : null}
					<p className="text-xs text-muted-foreground">
						{new Date(i.created_at).toLocaleString("es-EC")}
					</p>
				</div>
				<DrawerFooter>
					<DrawerClose>
						<Button variant="outline" className="w-full">
							Cerrar
						</Button>
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

export const historyColumns: ColumnDef<PushNotificationDto>[] = [
	{
		accessorKey: "created_at",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Fecha" />
		),
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{new Date(row.getValue("created_at") as string).toLocaleString("es-EC")}
			</span>
		),
	},
	{
		accessorKey: "title",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Título" />
		),
		cell: ({ row }) => (
			<span className="line-clamp-1 max-w-64 text-sm font-medium">
				{row.getValue("title")}
			</span>
		),
	},
	{
		accessorKey: "type",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Tipo" />
		),
		cell: ({ row }) => <TypeBadge type={row.getValue("type")} />,
	},
	{
		accessorKey: "status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Estado" />
		),
		cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
	},
	{
		id: "entregas",
		header: "Entregas",
		cell: ({ row }) => (
			<span className="text-sm">
				{row.original.sent_count}/{row.original.total_targeted}
				{row.original.failed_count > 0 ? (
					<span className="text-red-600">
						{" "}
						· {row.original.failed_count} fall.
					</span>
				) : null}
			</span>
		),
	},
	{
		id: "actions",
		header: "Acciones",
		enableHiding: false,
		cell: ({ row }) => <HistoryActionCell item={row.original} />,
	},
];

function HistoryActionCell({ item }: { item: PushNotificationDto }) {
	const [detail, setDetail] = useState(false);
	return (
		<>
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
							onClick={() => navigator.clipboard.writeText(item.id)}
						>
							Copiar ID
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => setDetail(true)}>
							<Eye /> Ver detalle
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			{detail ? (
				<DetailDrawer item={item} onClose={() => setDetail(false)} />
			) : null}
		</>
	);
}
