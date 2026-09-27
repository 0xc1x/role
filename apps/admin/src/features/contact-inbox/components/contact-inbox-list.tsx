import type { ContactMessageListItemDto } from "@0xc1x/role-commons";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactMessageDrawer } from "@/features/contact-inbox/components/contact-message-drawer";
import { useContactInboxList } from "@/features/contact-inbox/queries/contact-inbox.queries";
import { createContactInboxColumns } from "@/features/contact-inbox/tables/contact-inbox.columns";
import { formatApiError } from "@/lib/api/notify";
import { contactMessageStatusLabel } from "@/lib/labels";

/**
 * Listado de la bandeja con filtro por estado.
 *
 * La columna se llama "Estado" y sus valores son "Entrega pendiente" /
 * "Notificado" / "Error" a propósito. El `status` de `app_store` lo mueve el
 * camino público cuando se entrega el correo de aviso, no cuando alguien lee el
 * mensaje: etiquetarlo "Pendiente" / "Procesado" haría que el operador lo
 * leyera como "sin leer" y construyera sobre eso una urgencia que no existe.
 */
export function ContactInboxList({
	page = 1,
	limit = 20,
	status,
	onPageChange,
	onStatusChange,
}: {
	page?: number;
	limit?: number;
	status?: string;
	onPageChange: (page: number) => void;
	onStatusChange: (status?: string) => void;
}) {
	const { data, isLoading, isError, error } = useContactInboxList({
		page,
		limit,
		status: status as never,
	});
	const [abierto, setAbierto] = useState<ContactMessageListItemDto | null>(
		null,
	);

	const columnas = useMemo(() => createContactInboxColumns(setAbierto), []);

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-8 w-48" />
				{[1, 2, 3, 4, 5].map((n) => (
					<Skeleton key={n} className="h-12 w-full" />
				))}
			</div>
		);
	}

	if (isError) {
		return (
			<div className="space-y-4">
				<p className="text-destructive">{formatApiError(error, "Error")}</p>
				<Button variant="outline" onClick={() => onPageChange(1)}>
					Reintentar
				</Button>
			</div>
		);
	}

	const filas = data?.data ?? [];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-end">
				<Select
					value={status ?? "all"}
					onValueChange={(v) =>
						onStatusChange(!v || v === "all" ? undefined : v)
					}
				>
					<SelectTrigger className="w-52">
						<SelectValue placeholder="Estado" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Todos los estados</SelectItem>
						{["PENDIENTE", "PROCESADO", "ERROR"].map((s) => (
							<SelectItem key={s} value={s}>
								{contactMessageStatusLabel(s)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{filas.length === 0 ? (
				<p className="text-muted-foreground py-8 text-center text-sm">
					No hay mensajes de contacto con este filtro.
				</p>
			) : (
				<DataTable
					columns={columnas}
					data={filas}
					meta={data?.meta}
					onPageChange={onPageChange}
					onLimitChange={() => onPageChange(1)}
				/>
			)}

			<ContactMessageDrawer
				id={abierto?.id ?? null}
				isOpen={abierto !== null}
				onClose={() => setAbierto(null)}
			/>
		</div>
	);
}
