import type { OfferWithBusiness } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, PowerOff } from "lucide-react";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Spinner } from "@/components/ui/spinner";
import {
	useActivateOffer,
	useDeactivateOffer,
} from "@/features/offers/queries/offers.queries";
import type { CsvColumn } from "@/lib/csv";
import { formatBusinessDate } from "@/lib/dates";

function OfferStateBadge({ isActive }: { isActive: boolean }) {
	return (
		<Badge variant={isActive ? "success" : "secondary"}>
			{isActive ? "Activa" : "Inactiva"}
		</Badge>
	);
}

const windowFmt = new Intl.DateTimeFormat("es-EC", {
	dateStyle: "short",
	timeStyle: "short",
});

function PickupWindowCell({ offer }: { offer: OfferWithBusiness }) {
	const closed = new Date(offer.pickup_end).getTime() < Date.now();
	return (
		<span
			className={
				closed ? "text-sm text-destructive" : "text-sm text-muted-foreground"
			}
		>
			{windowFmt.format(new Date(offer.pickup_start))} →{" "}
			{windowFmt.format(new Date(offer.pickup_end))}
		</span>
	);
}

/**
 * Moderación de una oferta. Desactivar la saca del marketplace al instante y
 * deja sin surtido a quien ya la tenía reservada: por eso la confirmación nombra
 * el negocio y la oferta (el mismo criterio que la confirmación de pagos) y
 * nunca se dispara sola.
 */
function OfferActionsCell({ offer }: { offer: OfferWithBusiness }) {
	const [confirming, setConfirming] = useState(false);
	const deactivate = useDeactivateOffer();

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
					<span className="sr-only">Abrir menú</span>
					<MoreHorizontal className="h-4 w-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuGroup>
						<DropdownMenuLabel>Acciones</DropdownMenuLabel>
						<DropdownMenuItem
							disabled={deactivate.isPending}
							onClick={() => setConfirming(true)}
						>
							{deactivate.isPending ? <Spinner /> : <PowerOff />} Desactivar
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog
				open={confirming}
				onOpenChange={(open) => !open && setConfirming(false)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>¿Desactivar la oferta?</AlertDialogTitle>
						<AlertDialogDescription>
							<span className="font-medium text-foreground">{offer.title}</span>{" "}
							de{" "}
							<span className="font-medium text-foreground">
								{offer.business.name}
							</span>{" "}
							dejará de aparecer en el marketplace y los consumidores que la
							tengan reservada se quedan sin ella. Si la oferta no es correcta,
							conviene contactar al negocio en vez de publicarla.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deactivate.isPending}>
							Cancelar
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deactivate.isPending}
							onClick={() => {
								deactivate.mutate(offer.id, {
									onSettled: () => setConfirming(false),
								});
							}}
						>
							{deactivate.isPending ? <Spinner /> : null} Desactivar
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

/** Reactivar es reversible y no destructivo: no pide confirmación. */
function ReactivateButton({ offer }: { offer: OfferWithBusiness }) {
	const activate = useActivateOffer();
	if (offer.is_active) return null;
	return (
		<Button
			size="sm"
			variant="outline"
			disabled={activate.isPending}
			onClick={() => activate.mutate(offer.id)}
		>
			{activate.isPending ? <Spinner /> : null} Reactivar
		</Button>
	);
}

export const offersColumns: ColumnDef<OfferWithBusiness>[] = [
	{
		accessorKey: "title",
		header: "Oferta",
		cell: ({ row }) => (
			<div className="font-medium max-w-64 truncate">{row.original.title}</div>
		),
	},
	{
		// El negocio es la fila: sin él, moderar una oferta es adivinar de quién es.
		id: "business",
		accessorFn: (offer) => offer.business.name,
		header: "Negocio",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{row.original.business.name}
			</span>
		),
	},
	{
		accessorKey: "discounted_price",
		header: "Precio",
		cell: ({ row }) => (
			<div className="text-right">
				<div className="font-medium">
					${row.original.discounted_price.toFixed(2)}
				</div>
				<div className="text-xs text-muted-foreground line-through">
					${row.original.original_price.toFixed(2)}
				</div>
			</div>
		),
	},
	{
		accessorKey: "stock",
		header: "Stock",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{row.original.stock} / {row.original.initial_stock}
			</span>
		),
	},
	{
		accessorFn: (offer) => offer.pickup_end,
		id: "pickup_window",
		header: "Ventana de pickup",
		cell: ({ row }) => <PickupWindowCell offer={row.original} />,
	},
	{
		accessorKey: "is_active",
		header: "Estado",
		cell: ({ row }) => <OfferStateBadge isActive={row.original.is_active} />,
	},
	{
		accessorKey: "created_at",
		header: "Creada",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{formatBusinessDate(row.original.created_at)}
			</span>
		),
	},
	{
		id: "actions",
		header: "Acciones",
		enableHiding: false,
		cell: ({ row }) => (
			<div className="flex items-center justify-end gap-2">
				<ReactivateButton offer={row.original} />
				{row.original.is_active && <OfferActionsCell offer={row.original} />}
			</div>
		),
	},
];

/**
 * Exportación de ofertas, en el mismo orden que las columnas de arriba.
 *
 * El precio original se exporta en su propia columna, no junto al precio final
 * como en pantalla: pegados, la hoja solo puede leer uno de los dos.
 */
export const offersCsvColumns: CsvColumn<OfferWithBusiness>[] = [
	{ label: "Oferta", value: (o) => o.title },
	{ label: "Negocio", value: (o) => o.business.name },
	{ label: "Precio", value: (o) => o.discounted_price },
	{ label: "Precio original", value: (o) => o.original_price },
	{ label: "Stock", value: (o) => o.stock },
	{ label: "Stock inicial", value: (o) => o.initial_stock },
	{ label: "Pickup desde", value: (o) => o.pickup_start },
	{ label: "Pickup hasta", value: (o) => o.pickup_end },
	{ label: "Estado", value: (o) => (o.is_active ? "Activa" : "Inactiva") },
	{ label: "Creada", value: (o) => o.created_at },
];
