import {
	type AnnouncementDto,
	type AudienceKind,
	CreateAnnouncementSchema,
} from "@0xc1x/role-commons";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { useReportDrawerPending } from "@/components/resource/resource-drawer";
import { StatusSwitch } from "@/components/status-switch";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { directoryBusinessesOptions } from "@/features/directory";
import { IdPicker } from "@/features/email/components/id-picker";
import { formatApiError } from "@/lib/api/notify";
import { negociosSinDueño } from "../api/announcements.errors";
import {
	useActiveRequiredAnnouncements,
	useCreateAnnouncement,
	useUpdateAnnouncement,
} from "../queries/announcements.queries";

/**
 * El formulario de un aviso. Tres cosas acá NO son validación, y por eso no
 * están en el contrato:
 *
 *  1. Un `specific` con las dos listas vacías lo rechaza la API (400). El panel
 *     lo avisa y deja que el servidor conteste: la regla es del service, y
 *     duplicarla acá haría que un borrador a medio pensar no se pueda guardar.
 *  2. Un `specific` que elige negocios SÍ llega: al publicar, la API resuelve
 *     cada `business_id` a su `owner_id` y suma los dueños a `user_ids`
 *     (`announcements.service.ts`, `resolverDuenosDeNegocios`). No hay nada que
 *     avisar antes de publicar. Lo único que puede salir mal —un negocio sin
 *     dueño— lo rechaza el servidor con un 400 que lo nombra, y ese error sale
 *     accionable junto a la lista de negocios (`negociosSinDueño`).
 *  3. Publicar un `required` encima de otro `required` activo apila modales
 *     obligatorios (D10). Avisa; no impide.
 *
 * El `validators.onSubmit` es el schema de `commons` tal cual, sin `omit` ni
 * `extend`: `CreateAnnouncementSchema` ya trae los defaults de la base y el
 * refine de la ventana invertida, y zod no deja quitarle campos a un schema con
 * refinamientos.
 */
const SEVERITY_OPTIONS = [
	{ value: "info", label: "Informativo" },
	{ value: "required", label: "Obligatorio" },
] as const;

const AUDIENCE_OPTIONS = [
	{ value: "all", label: "Todo el mundo" },
	{ value: "consumers", label: "Consumidoras" },
	{ value: "businesses", label: "Negocios" },
	{ value: "specific", label: "Personas específicas" },
] as const;

const AVISO_SIN_DESTINO = "Este aviso no tiene a quién llegar";
const AVISO_SIN_DESTINO_DETALLE =
	"Un aviso para audiencia específica necesita al menos una consumidora o un negocio. El servidor rechaza la publicación con las dos listas vacías.";

const AVISO_AUDIENCIA_OCULTA = "La audiencia de este aviso no se puede mostrar";
const AVISO_AUDIENCIA_OCULTA_DETALLE =
	"La lista de consumidoras y la de negocios no vienen en la lectura, a propósito. Si elegís a alguien se AGREGAN a la lista guardada —no la reemplazan—; si guardás sin elegir a nadie, se conserva la que ya estaba.";
const AVISO_APILADO = "Este aviso se apila con otro obligatorio";

type AnnouncementFormValues = z.input<typeof CreateAnnouncementSchema>;

interface AnnouncementFormProps {
	formId: string;
	onSuccess?: () => void;
	announcement?: AnnouncementDto;
}

/**
 * Qué dice el panel sobre la audiencia elegida. No es validación y NO frena
 * nada: los dos casos que quedan son información que el operador lee mientras
 * compone. El único motivo real por el que un aviso dirigido no llega —un
 * negocio sin dueño— no se decide acá, y por eso no vive en este tipo: es un
 * error del servidor, y se pinta con el error de la mutación.
 */
interface AvisoDeAudiencia {
	titulo: string | null;
	detalle: string;
}

const SIN_AVISO_DE_AUDIENCIA: AvisoDeAudiencia = {
	titulo: null,
	detalle: "",
};

/*
 * LO QUE SE RETIRÓ DE ACÁ, Y POR QUÉ — no reintroducirlo sin leer esto.
 *
 * Para un `specific` con SOLO negocios, este form tenía una advertencia que decía
 * que esos negocios no lo iban a ver, y una casilla de confirmación que OBLIGABA
 * a marcar antes de publicar ("Entiendo que este aviso se publica y no lo va a
 * ver nadie"). Existía porque la policy de select solo mira
 * `user_ids @> array[auth.uid()]` y el panel no resolvía los negocios a sus
 * dueños: un aviso dirigido a negocios se publicaba y no lo veía nadie, así que
 * el panel frenaba la publicación para que el operador no publicara eso.
 *
 * La API ya resuelve: al publicar, cada `business_id` se resuelve a su `owner_id`
 * y se suma a `user_ids` (`announcements.service.ts`, `resolverDuenosDeNegocios`,
 * commit `ac74273`). El aviso dirigido a negocios LLEGA, así que la advertencia
 * era una falsedad y la casilla era un gate que frenaba publicaciones correctas:
 * el operador tenía que acknowledgear que nadie lo iba a ver para publicar un
 * aviso que sí veían sus dueños.
 *
 * Lo que la reemplazó no es otra advertencia previa sino el error REAL, que es
 * del servidor y solo existe cuando existe: un negocio sin dueño se rechaza con
 * un 400 que lo nombra, y el form lo muestra con el negocio nombrado junto a la
 * lista de negocios (`negociosSinDueño`). Antes de esta resolución, una
 * advertencia previa era el ÚNICO momento en que el panel podía avisar algo; hoy
 * no, porque no hay nada que avisar: o llega, o el servidor lo rechaza diciendo por
 * qué.
 */
function avisoDeAudiencia(
	audienceKind: AudienceKind,
	userIds: readonly string[],
	businessIds: readonly string[],
	isNew: boolean,
): AvisoDeAudiencia {
	if (audienceKind !== "specific") return SIN_AVISO_DE_AUDIENCIA;
	if (userIds.length > 0) return SIN_AVISO_DE_AUDIENCIA;

	// En el ALTA, elegir negocios le DA destino al aviso: cada uno se resuelve a
	// sus dueños al publicar. Este era el caso que abría la advertencia y la
	// casilla, y hoy no hay nada que avisar (ver el bloque de arriba).
	if (isNew && businessIds.length > 0) return SIN_AVISO_DE_AUDIENCIA;

	// Sin ninguna de las dos, el aviso depende de lo que YA esté guardado, y eso
	// el panel no lo sabe: la fila publicada no trae la audiencia.
	return {
		titulo: isNew ? AVISO_SIN_DESTINO : AVISO_AUDIENCIA_OCULTA,
		detalle: isNew ? AVISO_SIN_DESTINO_DETALLE : AVISO_AUDIENCIA_OCULTA_DETALLE,
	};
}

function obligatoriosActivos(cuantos: number): string {
	return cuantos === 1
		? "Hay 1 aviso obligatorio activo"
		: `Hay ${cuantos} avisos obligatorios activos`;
}

function detalleDeApilado(otros: number): string {
	return `${obligatoriosActivos(otros)}. Cada uno vuelve en cada apertura de la app hasta que la persona lo entienda, así que publicar este los deja ${otros + 1} en fila. Si querés que lo reemplace, desactivá el otro.`;
}

function avisoDeApilado(otros: number): string {
	return `Aviso obligatorio apilado: ahora hay ${otros + 1} en fila y la persona tiene que entenderlos todos.`;
}

/**
 * Las tres son cosas que el operador tiene que ver ANTES de publicar, y un aviso
 * que aparece por debajo del pliegue del drawer no se lee — por eso las tres son
 * live regions `role="status"` (polite: espera su turno).
 *
 * NO hay ningún aviso asertivo (`role="alert"`) en este form, y es deliberado. El
 * único que lo era era el de los negocios que no llegaban, que además frenaba la
 * publicación con una casilla de confirmación; con la resolución de dueños en el
 * servidor ese caso no existe (ver el bloque de `avisoDeAudiencia`). Lo que sí
 * hay que interrumpir —un error de la mutación— se pinta con el `FieldError` del
 * panel, que ya es `role="alert"`: la asertividad no se pierde, pasa del
 * primitivo que ya la tenía en vez de inventar una segunda.
 */
function Notice({ titulo, children }: { titulo: string; children: ReactNode }) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: `<output>` es el resultado de un cálculo del formulario y además es contenido de frase, así que no podría llevar los dos `<p>` que estructuran el aviso. El `role` va explícito para que se lea en el JSX.
		<div role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
			<p className="font-medium">{titulo}</p>
			<p className="mt-1 text-muted-foreground">{children}</p>
		</div>
	);
}

/** Shell de `Field` + rótulo + error, igual que el resto de los forms del panel. */
function FieldShell({
	name,
	label,
	description,
	errors,
	isInvalid,
	children,
}: {
	name: string;
	label: string;
	description?: string;
	errors: Array<{ message?: string } | undefined>;
	isInvalid: boolean;
	children: ReactNode;
}) {
	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor={name}>{label}</FieldLabel>
			{children}
			{description ? <FieldDescription>{description}</FieldDescription> : null}
			{isInvalid ? <FieldError errors={errors} /> : null}
		</Field>
	);
}

function announcementDefaults(
	announcement?: AnnouncementDto,
): AnnouncementFormValues {
	return {
		title: announcement?.title ?? "",
		body: announcement?.body ?? "",
		severity: announcement?.severity ?? "info",
		audience_kind: announcement?.audience_kind ?? "all",
		priority: announcement?.priority ?? 0,
		active: announcement?.active ?? true,
		start_at: announcement?.start_at ?? null,
		end_at: announcement?.end_at ?? null,
		// La audiencia dirigida NO se precarga: la fila publicada no la trae, a
		// propósito. Precargarla vacía y mandarla en el PATCH borraría el
		// destinatario de un aviso que alguien puede estar leyendo, así que una
		// lista vacía no viaja (ver `toAnnouncementPayload`).
		user_ids: [],
		business_ids: [],
	};
}

/**
 * El mismo payload sirve para el alta y para el PATCH, con una regla: las listas
 * de audiencia viajan SOLO si el operador eligió a alguien.
 *
 * En el alta, omitirlas es lo mismo que mandarlas vacías —el insert escribe el
 * default `'{}'` de la columna—, y en la edición es lo que evita el daño: un
 * `PATCH` con `user_ids: []` borra el destinatario de un aviso publicado.
 */
function toAnnouncementPayload(value: AnnouncementFormValues) {
	const dirigida = value.audience_kind === "specific";
	return {
		title: value.title,
		body: value.body,
		severity: value.severity,
		audience_kind: value.audience_kind,
		priority: value.priority ?? 0,
		active: value.active ?? true,
		start_at: value.start_at ?? null,
		end_at: value.end_at ?? null,
		...(dirigida && value.user_ids?.length ? { user_ids: value.user_ids } : {}),
		...(dirigida && value.business_ids?.length
			? { business_ids: value.business_ids }
			: {}),
	};
}

export function AnnouncementForm({
	formId,
	onSuccess,
	announcement,
}: AnnouncementFormProps) {
	const createMutation = useCreateAnnouncement();
	const updateMutation = useUpdateAnnouncement();
	const obligatorios = useActiveRequiredAnnouncements();
	useReportDrawerPending(
		announcement ? updateMutation.isPending : createMutation.isPending,
	);

	// El aviso del formulario se cuenta a sí mismo en el total del servidor, así
	// que editar el único `required` vigente no se anuncia como un apilamiento.
	const cuentaPropia =
		announcement?.severity === "required" && announcement.active;
	const otrosObligatorios = Math.max(
		0,
		(obligatorios.data?.meta.total ?? 0) - (cuentaPropia ? 1 : 0),
	);

	const form = useForm({
		defaultValues: announcementDefaults(announcement),
		validators: { onSubmit: CreateAnnouncementSchema },
		onSubmit: async ({ value }) => {
			const payload = toAnnouncementPayload(value);
			try {
				if (announcement) {
					await updateMutation.mutateAsync({
						id: announcement.id,
						body: payload,
					});
				} else {
					await createMutation.mutateAsync(payload);
				}
			} catch {
				// El error se pinta arriba del form y, si es el del negocio sin
				// dueño, junto a la lista de negocios. Dejarlo propagar sería un
				// rejection sin nada que mostrar (mismo criterio que
				// `business.form.tsx`).
				return;
			}

			// El aviso de apilado se ve mientras se compone, pero el drawer se
			// cierra al guardar: el toast es lo que sobrevive a esa vuelta y
			// dice, ya con el aviso publicado, cuántos quedan en fila.
			if (
				value.severity === "required" &&
				(value.active ?? true) &&
				otrosObligatorios > 0
			) {
				toast.warning(avisoDeApilado(otrosObligatorios));
			}
			onSuccess?.();
		},
	});

	// `useStore` y no `form.state`: leer el estado completo re-renderizaría el
	// form con cada tecla del cuerpo, y lo que se necesita acá es el encabezado —
	// audiencia, severidad y las dos listas—, que cambia en un clic.
	const audienceKind = useStore(form.store, (s) => s.values.audience_kind);
	const userIds = useStore(form.store, (s) => s.values.user_ids);
	const businessIds = useStore(form.store, (s) => s.values.business_ids);
	const severity = useStore(form.store, (s) => s.values.severity);
	const active = useStore(form.store, (s) => s.values.active ?? true);

	const aviso = avisoDeAudiencia(
		audienceKind,
		userIds ?? [],
		businessIds ?? [],
		!announcement,
	);
	const apila = severity === "required" && active && otrosObligatorios > 0;

	const formError = createMutation.error ?? updateMutation.error;
	// Los negocios sin dueño que nombró el servidor en su 400. Es el error que
	// reemplaza la casilla que se retiró: no una advertencia previa, sino el
	// motivo real, con los negocios en la pantalla.
	const sinDueño = negociosSinDueño(formError);

	// El directorio de negocios que el `IdPicker` de abajo ya está trayendo: es la
	// MISMA clave de query, así que no es una request extra. Solo se pide con
	// audiencia dirigida, que es cuando el picker existe y cuando hay ids que
	// nombrar; en cualquier otro caso sería un request inútil.
	const directorio = useQuery({
		...directoryBusinessesOptions(""),
		enabled: audienceKind === "specific",
	});

	/**
	 * El nombre del negocio para un id del 400, o el id solo cuando el directorio
	 * no lo conoce. El id nunca se oculta: es lo que el servidor nombró a
	 * propósito —`business_ownership` no tiene el nombre del negocio— y alcanza
	 * para ir a buscarlo, así que un nombre de menos no deja al operador sin
	 * salida.
	 */
	const nombreDeNegocio = (id: string): string => {
		const nombre = directorio.data?.data.find((b) => b.id === id)?.name;
		return nombre ? `${nombre} · ${id}` : id;
	};

	return (
		<form
			id={formId}
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="space-y-4"
		>
			{formError ? (
				<p className="text-destructive text-sm">
					{formatApiError(formError, "No se pudo guardar el aviso")}
				</p>
			) : null}

			{apila ? (
				<Notice titulo={AVISO_APILADO}>
					{detalleDeApilado(otrosObligatorios)}
				</Notice>
			) : null}

			<form.Field name="title">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<FieldShell
							name={field.name}
							label="Título"
							errors={field.state.meta.errors}
							isInvalid={isInvalid}
						>
							<Input
								id={field.name}
								name={field.name}
								placeholder="Mantenimiento del sábado"
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								aria-invalid={isInvalid}
							/>
						</FieldShell>
					);
				}}
			</form.Field>

			<form.Field name="body">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<FieldShell
							name={field.name}
							label="Cuerpo"
							description="Es el texto que ve la persona en la app."
							errors={field.state.meta.errors}
							isInvalid={isInvalid}
						>
							<Textarea
								id={field.name}
								name={field.name}
								placeholder="No hay ofertas nuevas entre las 3 y las 5."
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								aria-invalid={isInvalid}
							/>
						</FieldShell>
					);
				}}
			</form.Field>

			<form.Field name="severity">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<FieldShell
							name={field.name}
							label="Severidad"
							errors={field.state.meta.errors}
							isInvalid={isInvalid}
						>
							<Select
								value={field.state.value}
								onValueChange={(v) => {
									if (v === "info" || v === "required") field.handleChange(v);
									field.handleBlur();
								}}
							>
								<SelectTrigger
									id={field.name}
									className="w-full"
									aria-label="Severidad"
									aria-invalid={isInvalid}
								>
									<SelectValue>
										{SEVERITY_OPTIONS.find((o) => o.value === field.state.value)
											?.label ?? "Informativo"}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{SEVERITY_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FieldShell>
					);
				}}
			</form.Field>

			<form.Field name="audience_kind">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<FieldShell
							name={field.name}
							label="Audiencia"
							errors={field.state.meta.errors}
							isInvalid={isInvalid}
						>
							<Select
								value={field.state.value}
								onValueChange={(v) => {
									if (
										v === "all" ||
										v === "consumers" ||
										v === "businesses" ||
										v === "specific"
									)
										field.handleChange(v);
									field.handleBlur();
								}}
							>
								<SelectTrigger
									id={field.name}
									className="w-full"
									aria-label="Audiencia"
									aria-invalid={isInvalid}
								>
									<SelectValue>
										{AUDIENCE_OPTIONS.find((o) => o.value === field.state.value)
											?.label ?? "Todo el mundo"}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{AUDIENCE_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FieldShell>
					);
				}}
			</form.Field>

			{audienceKind === "specific" ? (
				<section className="space-y-3">
					{aviso.titulo ? (
						<Notice titulo={aviso.titulo}>{aviso.detalle}</Notice>
					) : null}

					<form.Field name="user_ids">
						{(field) => (
							<FieldShell
								name={field.name}
								label="Consumidoras"
								errors={field.state.meta.errors}
								isInvalid={false}
							>
								<IdPicker
									label="Consumidoras"
									kind="usuarios"
									selectedIds={field.state.value ?? []}
									onChange={field.handleChange}
								/>
							</FieldShell>
						)}
					</form.Field>

					<form.Field name="business_ids">
						{(field) => (
							<FieldShell
								name={field.name}
								label="Negocios"
								errors={field.state.meta.errors}
								isInvalid={false}
							>
								<IdPicker
									label="Negocios"
									kind="negocios"
									selectedIds={field.state.value ?? []}
									onChange={field.handleChange}
								/>
							</FieldShell>
						)}
					</form.Field>

					{sinDueño.length > 0 ? (
						/*
						 * El 400 del negocio sin dueño, con los negocios NOMBRADOS. Es
						 * lo que reemplaza la casilla que se retiró: no una advertencia
						 * previa —la resolución del servidor volvió innecesaria— sino el
						 * error real, cuando ocurre, diciendo a quién hay que darle
						 * dueño.
						 *
						 * Va acá y no solo en el párrafo de arriba porque la respuesta del
						 * operador es sobre ESTA lista, y porque el `FieldError` del panel
						 * ya es `role="alert"`: un fallo de la mutación hay que
						 * interrumpirlo, a diferencia de los avisos que aparecen al
						 * componer. El párrafo de arriba no se saca —es el mensaje del
						 * servidor con su `requestId`, que es lo único que lo correlaciona
						 * con el log `announcements_business_without_owner`—, así que las
						 * frases se repiten: el de arriba es el parte del servidor y este la
						 * guía de qué corregir.
						 */
						<FieldError
							errors={[
								{
									message:
										"No se puede publicar: hay negocios sin dueño asignado y el aviso no le llegaría a nadie. Asignale un dueño a cada uno en su ficha, o sacalos de la lista y volvé a publicar:",
								},
								...sinDueño.map((id) => ({ message: nombreDeNegocio(id) })),
							]}
						/>
					) : null}
				</section>
			) : null}

			<form.Field name="priority">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;
					return (
						<FieldShell
							name={field.name}
							label="Prioridad"
							description="Ordena los avisos entre sí. Un número más alto va primero."
							errors={field.state.meta.errors}
							isInvalid={isInvalid}
						>
							<Input
								id={field.name}
								name={field.name}
								type="number"
								step="1"
								value={String(field.state.value ?? 0)}
								onBlur={field.handleBlur}
								onChange={(e) =>
									field.handleChange(
										e.target.value === "" ? 0 : Number(e.target.value),
									)
								}
								aria-invalid={isInvalid}
							/>
						</FieldShell>
					);
				}}
			</form.Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<form.Field name="start_at">
					{(field) => {
						const isInvalid =
							field.state.meta.isTouched && !field.state.meta.isValid;
						return (
							<FieldShell
								name={field.name}
								label="Vigente desde"
								description="Sin fecha, el aviso empieza ya."
								errors={field.state.meta.errors}
								isInvalid={isInvalid}
							>
								<DateTimePicker
									value={field.state.value ?? ""}
									onChange={(v) => field.handleChange(v === "" ? null : v)}
									placeholder="Sin fecha de inicio"
								/>
							</FieldShell>
						);
					}}
				</form.Field>

				<form.Field name="end_at">
					{(field) => {
						const isInvalid =
							field.state.meta.isTouched && !field.state.meta.isValid;
						return (
							<FieldShell
								name={field.name}
								label="Vigente hasta"
								description="Sin fecha, el aviso no se retira solo."
								errors={field.state.meta.errors}
								isInvalid={isInvalid}
							>
								<DateTimePicker
									value={field.state.value ?? ""}
									onChange={(v) => field.handleChange(v === "" ? null : v)}
									placeholder="Sin fecha de fin"
								/>
							</FieldShell>
						);
					}}
				</form.Field>
			</div>

			{announcement ? (
				<form.Field name="active">
					{(field) => (
						<Field>
							<FieldLabel>Estado</FieldLabel>
							<StatusSwitch
								checked={field.state.value ?? true}
								onCheckedChange={(checked) => field.handleChange(checked)}
							/>
						</Field>
					)}
				</form.Field>
			) : null}
		</form>
	);
}
