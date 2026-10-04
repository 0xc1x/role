import {
	type AnnouncementDto,
	type AudienceKind,
	CreateAnnouncementSchema,
} from "@0xc1x/role-commons";
import { useForm, useStore } from "@tanstack/react-form";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { useReportDrawerPending } from "@/components/resource/resource-drawer";
import { StatusSwitch } from "@/components/status-switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { IdPicker } from "@/features/email/components/id-picker";
import { formatApiError } from "@/lib/api/notify";
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
 *  2. Un `specific` con SOLO negocios la API lo acepta y NO LO VE NADIE: la
 *     policy de select solo mira `user_ids`. La migración sellada difiere la
 *     salida a propósito. Acá no se decide —se hace visible—.
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

/**
 * EL NEGOCIO DE LA LISTA NO LLEGA, Y LAS PERSONAS GUARDADAS SIGUEN.
 *
 * La redacción dice exactamente eso, y no "nadie va a ver este aviso", porque
 * sería FALSO en el caso más común. El service hace MERGE de la audiencia, no
 * reemplazo: `body.user_ids ?? existing.user_ids` (`announcements.service.ts`),
 * y el mapper solo escribe la lista que viene definida. Elegir negocios encima
 * de una fila que ya tenía consumidoras NO las borra: sigue llegándoles.
 *
 * El escenario que obliga a esta redacción: se publica un `specific` para Ana,
 * días después se abre para corregir una errata y se eligen dos negocios
 * creyendo que se agrega audiencia; con la redacción anterior el panel
 * obligaba a acknowledgear que nadie lo vería, y Ana lo seguía viendo. Un aviso
 * cuyo trabajo es que el operador no publique algo que no llega no puede
 * afirmar que algo no llega cuando sí.
 *
 * Y el aviso se especifica por lista, no por fila: la policy de select solo mira
 * `user_ids @> array[auth.uid()]`, así que de los negocios elegidos no lee
 * nadie. Esa parte sigue sin resolverse —la migración sellada difiere la
 * salida a propósito— y por eso el aviso sigue ahí, diciendo la verdad.
 */
const AVISO_NEGOCIOS_NO_ENTREGAN = "Los negocios que elegiste no lo van a ver";
const AVISO_NEGOCIOS_NO_ENTREGAN_ALTA =
	"La regla de entrega solo reconoce a las personas de la lista de consumidoras. Elegir únicamente negocios deja el aviso publicado y sin mostrarse en ninguna app: es una limitación conocida y sin resolver.";
const AVISO_NEGOCIOS_NO_ENTREGAN_AL_EDITAR =
	"La regla de entrega solo reconoce a las personas de la lista de consumidoras, así que de los negocios que agregaste no lee nadie. Si este aviso ya tenía consumidoras apuntadas, SEGUEN RECIBIÉNDOLO: el panel no puede mostrarte esa lista, pero no la borra al guardar.";

/** Lo que se acknowledgea: el alcance del aviso, no un "nadie lo ve". */
const CONFIRMAR_NEGOCIOS =
	"Entiendo que los negocios de esta lista no van a ver este aviso";
const CONFIRMAR_NEGOCIOS_AL_EDITAR =
	"Entiendo que los negocios que agregué no lo van a ver, y que las personas que ya estaban apuntadas lo siguen recibiendo";
const ERROR_CONFIRMAR_NEGOCIOS =
	"Confirmá que sabés a quién no le va a llegar este aviso antes de publicarlo.";

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
 * Qué dice el panel sobre la audiencia elegida. No es una validación: la
 * `requiereConfirmacion` solo aparece en el caso que la API deja pasar y que
 * produce un aviso invisible.
 */
interface AvisoDeAudiencia {
	titulo: string | null;
	detalle: string;
	/** El texto de la casilla que hay que marcar antes de publicar. */
	confirmacion: string;
	requiereConfirmacion: boolean;
}

const SIN_AVISO_DE_AUDIENCIA: AvisoDeAudiencia = {
	titulo: null,
	detalle: "",
	confirmacion: "",
	requiereConfirmacion: false,
};

function avisoDeAudiencia(
	audienceKind: AudienceKind,
	userIds: readonly string[],
	businessIds: readonly string[],
	isNew: boolean,
): AvisoDeAudiencia {
	if (audienceKind !== "specific") return SIN_AVISO_DE_AUDIENCIA;
	if (userIds.length > 0) return SIN_AVISO_DE_AUDIENCIA;

	if (businessIds.length > 0) {
		return {
			titulo: AVISO_NEGOCIOS_NO_ENTREGAN,
			// El texto cambia con el alta y la edición porque el hecho es distinto:
			// en el alta la lista guardada está vacía y el aviso no lo ve nadie;
			// en la edición puede haber personas que lo siguen recibiendo.
			detalle: isNew
				? AVISO_NEGOCIOS_NO_ENTREGAN_ALTA
				: AVISO_NEGOCIOS_NO_ENTREGAN_AL_EDITAR,
			confirmacion: isNew ? CONFIRMAR_NEGOCIOS : CONFIRMAR_NEGOCIOS_AL_EDITAR,
			requiereConfirmacion: true,
		};
	}

	// Sin ninguna de las dos, el aviso depende de lo que YA esté guardado, y eso
	// el panel no lo sabe: la fila publicada no trae la audiencia.
	return {
		titulo: isNew ? AVISO_SIN_DESTINO : AVISO_AUDIENCIA_OCULTA,
		detalle: isNew ? AVISO_SIN_DESTINO_DETALLE : AVISO_AUDIENCIA_OCULTA_DETALLE,
		confirmacion: "",
		requiereConfirmacion: false,
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
 * live regions. Lo que cambia con `alerta` es la ASERTIVIDAD, no el estilo:
 *
 *  - `role="alert"` (asertivo, interrumpe) solo para la audiencia que no llega.
 *    Es la única que cambia lo que el operador va a hacer: sin confirmar, no se
 *    publica.
 *  - `role="status"` (polite, espera su turno) para las otras dos. El aviso de
 *    que falta audiencia y el de `required` apilado son información que se lee
 *    cuando se llega; interrumpir la lectura de pantalla con ellos por el solo
 *    hecho de abrir el drawer es hacer que el operador se habitúe a ignorar los
 *    avisos, que es justo lo que vuelve inútil el único que importa.
 */
function Notice({
	titulo,
	children,
	alerta = false,
}: {
	titulo: string;
	children: ReactNode;
	alerta?: boolean;
}) {
	return (
		<div
			role={alerta ? "alert" : "status"}
			className={
				alerta
					? "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
					: "rounded-md border bg-muted/40 p-3 text-sm"
			}
		>
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

	// El aviso de audiencia invisible se confirma una vez por composición: si la
	// selección cambia, la confirmación anterior deja de ser la que el operador
	// está aceptando.
	const [confirmado, setConfirmado] = useState(false);
	const [errorDeAudiencia, setErrorDeAudiencia] = useState<string | null>(null);

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
			const aviso = avisoDeAudiencia(
				value.audience_kind,
				value.user_ids ?? [],
				value.business_ids ?? [],
				!announcement,
			);
			if (aviso.requiereConfirmacion && !confirmado) {
				setErrorDeAudiencia(ERROR_CONFIRMAR_NEGOCIOS);
				return;
			}
			setErrorDeAudiencia(null);

			const payload = toAnnouncementPayload(value);
			if (announcement) {
				await updateMutation.mutateAsync({
					id: announcement.id,
					body: payload,
				});
			} else {
				await createMutation.mutateAsync(payload);
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

	useEffect(() => {
		if (aviso.requiereConfirmacion) return;
		setConfirmado(false);
		setErrorDeAudiencia(null);
	}, [aviso.requiereConfirmacion]);

	const formError = createMutation.error ?? updateMutation.error;

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
						<Notice titulo={aviso.titulo} alerta={aviso.requiereConfirmacion}>
							{aviso.detalle}
						</Notice>
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

					{aviso.requiereConfirmacion ? (
						// `div` y no `label` envolvente: el control de un `<label>`
						// labelable recibe un click ADICIONAL al del label, y el
						// checkbox se desmarcaba solo. Es el mismo criterio que los
						// `IdPicker` y las listas de segmentos de campaigns.
						<div className="flex items-start gap-2 text-sm">
							<Checkbox
								checked={confirmado}
								onCheckedChange={(checked) => {
									setConfirmado(checked === true);
									// El error de "falta confirmar" se borra al marcar, no
									// cuando cambia la audiencia: si no, queda un `FieldError`
									// rojo al lado de una casilla ya marcada, y el operador
									// ve que la confirmación "no took".
									if (checked === true) setErrorDeAudiencia(null);
								}}
								aria-label={aviso.confirmacion}
								className="mt-0.5"
							/>
							<span>{aviso.confirmacion}</span>
						</div>
					) : null}

					{errorDeAudiencia ? (
						<FieldError>{errorDeAudiencia}</FieldError>
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
