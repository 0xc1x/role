import { ListContactMessagesQuerySchema } from "@0xc1x/role-commons";
import { createFileRoute } from "@tanstack/react-router";
import { ContactInboxList } from "@/features/contact-inbox";
import { contactInboxListOptions } from "@/features/contact-inbox/queries/contact-inbox.queries";

/**
 * Bandeja de los mensajes que deja el formulario público de contacto.
 *
 * SIN botón de exportar a CSV, a diferencia de Comisiones: el contenido de esta
 * tabla es PII de personas que escribieron desde la landing (nombre, correo,
 * ciudad, IP de origen) y un CSV es la forma más fácil de que eso termine en
 * una bandeja de entrada ajena al panel. Si alguna vez hace falta, tiene que
 * ser una descarga auditada en el servidor, no un botón en el cliente.
 */
export const Route = createFileRoute("/_layout/contactos")({
	validateSearch: (raw) => ListContactMessagesQuerySchema.parse(raw),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(contactInboxListOptions(deps)),
	component: RouteComponent,
	head: () => ({
		meta: [
			{ title: "Contactos | Rolé" },
			{
				name: "description",
				content: "Mensajes que enviaron personas desde la landing de Rolé",
			},
		],
	}),
});

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<div className="px-6 py-4">
			<header className="flex items-center">
				<h1 className="font-bold text-xl">Contactos</h1>
			</header>
			<p className="mt-1 text-muted-foreground text-sm">
				Mensajes enviados desde el formulario de la landing. La columna "Estado"
				es el del correo de aviso: "Entrega pendiente" significa que el aviso
				todavía no se entregó, no que el mensaje esté sin leer.
			</p>
			<div className="mt-4">
				<ContactInboxList
					page={search.page}
					limit={search.limit}
					status={search.status}
					onPageChange={(page) => navigate({ search: { ...search, page } })}
					onStatusChange={(status) =>
						navigate({
							search: {
								...search,
								status: status as typeof search.status,
								page: 1,
							},
						})
					}
				/>
			</div>
		</div>
	);
}
