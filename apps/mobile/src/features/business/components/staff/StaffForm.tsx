import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
	BusinessMemberAliasSchema,
	type BusinessLocation,
	type StaffAliasWarningCode,
} from "@0xc1x/role-commons";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { strings } from "@/src/core/i18n/strings";
import { AppText, TextField } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { aliasWarnings as computeAliasWarnings } from "@/src/features/business/data/staff";

/**
 * Lo que el formulario entrega al API.
 *
 * El alias es OPCIONAL y su ausencia es un dato: vacío significa que lo
 * propone el servidor (`{código}@{slug}.role.ec`), y mandarlo vacío sería
 * mandarle un alias que no existe. En la EDICIÓN el alias nunca falta: lo
 * tiene el acceso, y un acceso sin alias es un acceso con el que nadie entra.
 *
 * El `label` viaja en la interfaz compartida, pero en modo EDICIÓN es de SOLO
 * LECTURA: el nombre se muestra y no se renombra (§8), y es la pantalla la que
 * arma el cuerpo de tres campos del `PATCH` —sin `label`—. Aquí va para que el
 * alta y la edición compartan el mismo tipo de salida.
 */
export interface StaffFormValues {
	label: string;
	role: "manager" | "staff";
	business_location_ids: string[];
	session_ttl_hours: number;
	alias?: string;
}

/**
 * Los valores con los que el formulario llega PINTADO en modo edición.
 *
 * El `label` viene porque el formulario lo muestra —como texto, no como un
 * campo: ninguna de las nueve rutas del §8 renombra a nadie—, pero la pantalla
 * NO lo manda en el `PATCH`: el `UpdateBusinessMemberSchema` es estricto y no
 * acepta un `label` que nadie pidió cambiar.
 */
export interface StaffFormInitial {
	/** El nombre con el que el dueño lo presentó. Se MUESTRA, no se edita. */
	label: string;
	role: "manager" | "staff";
	business_location_ids: string[];
	session_ttl_hours: number;
	alias: string;
}

/**
 * Las horas de la sesión POR TURNOS (§9.2).
 *
 * Es el valor por defecto de todo acceso que no es del equipo propio: la
 * sesión caduca y el empleado vuelve a entrar. La otra mitad del par es el
 * `0` —«sin expiración»—, que sólo existe para el gerente.
 */
const SHIFT_SESSION_TTL_HOURS = 24;

/**
 * La prosa de cada aviso del §9.4.
 *
 * Los códigos son del CONTRATO (`StaffAliasWarningCode`) y la prosa es de la
 * app: un código sin su frase sería un aviso que no dice nada, y una frase
 * sin su código sería una verdad que nadie puede leer.
 */
const ALIAS_WARNING_COPY: Record<StaffAliasWarningCode, string> = {
	alias_domain_can_receive_mail: strings.business.staff.aliasWarning,
};

/**
 * El formulario del alta de un acceso (§9.2) y de su edición (§9.2).
 *
 * ─── POR QUÉ EL AVISO DEL DOMINIO LO CONTESTA COMMONS ─────────────────────────
 *
 * Porque la pregunta «¿este dominio tiene una bandeja detrás?» tiene una sola
 * respuesta en todo el sistema, y esa respuesta vive en
 * `businessMemberAliasWarnings`. Este archivo la CONSUME —a través del
 * envoltorio `aliasWarnings` del módulo de los accesos— y no la reimplementa:
 * dos verdades sobre la misma regla son dos reglas que algún día dejan de
 * coincidir.
 *
 * ─── Y POR QUÉ EN LA EDICIÓN EL AVISO LO CONTESTA EL API ─────────────────────
 *
 * Porque en la edición el alias YA EXISTE: lo que se está a punto de guardar es
 * una decisión del servidor —que además cambia el correo de `auth.users`—, y la
 * respuesta de `PATCH …/alias` trae su propio `alias_warnings`. Calcularlo en
 * el cliente sería dar la misma respuesta con una regla que puede derivar de la
 * del API sin que nadie se entere: el aviso del ALTA se anticipa, el de la
 * EDICIÓN se cuenta. Por eso el formulario pinta en modo edición SÓLO los
 * códigos que le pasa quien pinta la pantalla.
 *
 * ─── Y POR QUÉ EL MODO PERSISTENTE SÓLO EXISTE PARA EL GERENTE ───────────────
 *
 * Porque lo dice el §9.2 y porque el API lo rechaza: `assertPersistentSessionIsAllowed`
 * no permite un acceso sin expiración para un empleado. Ofrecerlo y que el
 * servidor lo rechace sería mandar a la persona a leer un 422 por una opción
 * que la propia aplicación le ofreció.
 */
export function StaffForm({
	locations,
	initial,
	aliasWarnings,
	aliasWarningsFor,
	submitting,
	error,
	onSubmit,
}: {
	/** Las sucursales del negocio: el alcance que se puede marcar. */
	locations: BusinessLocation[];
	/**
	 * Los valores con los que el formulario llega pintado.
	 *
	 * Su presencia es lo que hace que el formulario sea de EDICIÓN: el nombre
	 * deja de editarse, el alias deja de poder quedar vacío y el aviso del
	 * dominio deja de calcularse en el cliente.
	 */
	initial?: StaffFormInitial;
	/**
	 * Los avisos del §9.4 que CONTESTÓ EL API.
	 *
	 * Sólo se usan en modo edición: en el alta el aviso se anticipa con la
	 * regla del contrato, y lo que el servidor responda después es la
	 * autoridad.
	 */
	aliasWarnings?: StaffAliasWarningCode[];
	/**
	 * El alias con el que el servidor CONTESTÓ esos avisos.
	 *
	 * Los avisos son de UN alias: si la persona escribe otro, el aviso ya no
	 * habla de lo que hay escrito, y mostrarlo sería mentarle. Sin este
	 * alias no hay aviso que pintar.
	 */
	aliasWarningsFor?: string;
	/** El alta está en vuelo: el botón no se vuelve a tocar. */
	submitting: boolean;
	/** El motivo del fallo, con la prosa que el API ya escribió. */
	error: string | null;
	onSubmit: (values: StaffFormValues) => void;
}) {
	const { colors } = useTheme();
	const isEdit = initial !== undefined;
	const [label, setLabel] = useState(initial?.label ?? "");
	const [role, setRole] = useState<"manager" | "staff">(
		initial?.role ?? "staff",
	);
	const [alias, setAlias] = useState(initial?.alias ?? "");
	const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>(
		initial?.business_location_ids ?? [],
	);
	// El `0` del acceso es «sin expiración»: el interruptor empieza dado
	// cuando el valor con el que llega es ese. Un valor CUALQUIERA —24, 8—
	// es la política de por turnos, con el interruptor apagado.
	const [persistentSession, setPersistentSession] = useState(
		initial !== undefined &&
			initial.role === "manager" &&
			initial.session_ttl_hours === 0,
	);

	const trimmedAlias = alias.trim();
	const labelValid = label.trim().length > 0;
	// En el ALTA el alias vacío es válido —lo propone el servidor—; en la
	// EDICIÓN no: un acceso sin alias es un acceso con el que nadie entra, y
	// «vacío = lo propone el servidor» es una regla del alta, no de la
	// edición.
	const aliasValid = isEdit
		? BusinessMemberAliasSchema.safeParse(trimmedAlias).success
		: trimmedAlias === "" ||
			BusinessMemberAliasSchema.safeParse(trimmedAlias).success;
	// En el ALTA el alcance es obligatorio: un acceso sin sucursales no tiene
	// dónde trabajar. En la EDICIÓN NO: el alcance ya existe y puede estar
	// vacío —§5.1: sin filas no se alcanza ningún recurso—, y obligar a
	// marcar una sería REGALAR una sucursal como efecto secundario de cambiar
	// el rol. Un permiso que se concede sin que nadie lo pidiera es un
	// permiso que no se pidió.
	const locationsValid = isEdit || selectedLocationIds.length > 0;
	const canSubmit = labelValid && aliasValid && locationsValid && !submitting;

	// El modo persistente sólo existe para el gerente: si el rol baja a empleado,
	// la política vuelve a ser la de por turnos aunque el interruptor siga dado.
	const sessionTtlHours =
		role === "manager" && persistentSession ? 0 : SHIFT_SESSION_TTL_HOURS;

	// El aviso del §9.4: en el ALTA se anticipa con la regla del contrato,
	// mientras se escribe —el dueño ve la consecuencia de lo que está
	// tecleando antes de guardarlo—; en la EDICIÓN lo cuenta el API, y lo
	// único que se pinta es lo que él devolvió PARA EL ALIAS QUE HAY ESCRITO.
	const serverWarnings =
		isEdit &&
		aliasWarningsFor !== undefined &&
		trimmedAlias === aliasWarningsFor
			? (aliasWarnings ?? [])
			: [];
	const warningCodes: StaffAliasWarningCode[] = isEdit
		? serverWarnings
		: trimmedAlias !== ""
			? computeAliasWarnings(trimmedAlias)
			: [];

	// El alcance vacío en la EDICIÓN es una verdad que se dice, no un error:
	// el acceso ya existe y puede no alcanzar ninguna sucursal (§5.1). En el
	// ALTA no cabe —un acceso sin sucursales no tiene dónde trabajar—, y por
	// eso el aviso se pinta sólo en modo edición.
	const showsNoLocationsWarning =
		isEdit && locations.length > 0 && selectedLocationIds.length === 0;

	const toggleLocation = (locationId: string) => {
		setSelectedLocationIds((current) =>
			current.includes(locationId)
				? current.filter((id) => id !== locationId)
				: [...current, locationId],
		);
	};

	const submit = () => {
		if (!canSubmit) return;
		onSubmit({
			label: label.trim(),
			role,
			business_location_ids: selectedLocationIds,
			session_ttl_hours: sessionTtlHours,
			// La clave se OMITE cuando el alias está vacío: mandarla vacía es
			// mandar un alias, y el servidor no propone uno para un valor vacío.
			...(trimmedAlias === "" ? {} : { alias: trimmedAlias }),
		});
	};

	return (
		<View style={styles.container}>
			<Card>
				<CardHeader>
					<AppText variant="labelSmall" weight="bold">
						{strings.business.staff.identityTitle}
					</AppText>
				</CardHeader>
				<CardContent>
					{isEdit ? (
						// El nombre NO se edita: ninguna de las nueve rutas del §8
						// renombra a nadie, y un campo editable aquí sería una
						// puerta por donde entra un cambio que el API ni
						// siquiera acepta.
						<View style={styles.identity}>
							<AppText
								variant="labelSmall"
								weight="semiBold"
								style={{ color: colors.mutedForeground }}
							>
								{strings.business.staff.nameLabel}
							</AppText>
							<AppText variant="bodyMedium" weight="semiBold">
								{label}
							</AppText>
							<AppText
								variant="bodySmall"
								style={{ color: colors.mutedForeground }}
							>
								{strings.business.staff.nameReadOnly}
							</AppText>
						</View>
					) : (
						<TextField
							label={strings.business.staff.nameLabel}
							value={label}
							onChangeText={setLabel}
							hint={strings.business.staff.nameHint}
							error={
								label.length > 0 && !labelValid
									? strings.business.staff.nameRequired
									: null
							}
						/>
					)}
					<View style={styles.spaced}>
						<TextField
							label={strings.business.staff.aliasLabel}
							value={alias}
							onChangeText={setAlias}
							placeholder={strings.business.staff.aliasPlaceholder}
							autoCapitalize="none"
							autoCorrect={false}
							keyboardType="email-address"
							error={
								isEdit
									? trimmedAlias === ""
										? strings.business.staff.aliasRequired
										: !aliasValid
											? strings.business.staff.aliasInvalid
											: null
									: trimmedAlias !== "" && !aliasValid
										? strings.business.staff.aliasInvalid
										: null
							}
						/>
						{warningCodes.map((code) => (
							<AppText
								key={code}
								variant="bodySmall"
								style={{ color: colors.destructive }}
							>
								{ALIAS_WARNING_COPY[code]}
							</AppText>
						))}
					</View>
				</CardContent>
				<CardFooter>
					{/* El recordatorio del «vacío = lo propone el servidor» es del
					    ALTA: en la edición el alias ya existe y no puede quedar
					    vacío, así que la frase sería una regla que no aplica. */}
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground }}
					>
						{isEdit
							? strings.business.staff.aliasEditHint
							: strings.business.staff.aliasHint}
					</AppText>
				</CardFooter>
			</Card>

			<Card>
				<CardHeader>
					<AppText variant="labelSmall" weight="bold">
						{strings.business.staff.roleLabel}
					</AppText>
				</CardHeader>
				<CardContent>
					{/* El grupo: el lector de pantalla anuncia las dos opciones
					    como una sola pregunta, y no como dos botones sueltos. */}
					<View accessibilityRole="radiogroup">
						<RoleOption
							label={strings.business.staff.roleManager}
							selected={role === "manager"}
							onPress={() => setRole("manager")}
						/>
						<View style={styles.spaced}>
							<RoleOption
								label={strings.business.staff.roleStaff}
								selected={role === "staff"}
								onPress={() => setRole("staff")}
							/>
						</View>
					</View>
				</CardContent>
				<CardFooter>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground }}
					>
						{strings.business.staff.roleHint}
					</AppText>
				</CardFooter>
			</Card>

			<Card>
				<CardHeader>
					<AppText variant="labelSmall" weight="bold">
						{strings.business.staff.locationsLabel}
					</AppText>
				</CardHeader>
				<CardContent>
					{locations.map((location, index) => (
						<View
							key={location.id}
							style={index === 0 ? undefined : styles.spaced}
						>
							<LocationOption
								location={location}
								checked={selectedLocationIds.includes(location.id)}
								onPress={() => toggleLocation(location.id)}
							/>
						</View>
					))}
				</CardContent>
				<CardFooter>
					{/* El pie dice el alcance EFECTIVO: en el alta, marcar al
					    menos una es obligatorio; en la edición, un alcance vacío
					    es una verdad que se avisa, no un error que impide
					    guardar. */}
					<AppText
						variant="bodySmall"
						style={{
							color: showsNoLocationsWarning
								? colors.destructive
								: colors.mutedForeground,
						}}
					>
						{locations.length === 0
							? strings.business.staff.locationsEmpty
							: selectedLocationIds.length === 0
								? isEdit
									? strings.business.staff.noLocationsWarning
									: strings.business.staff.locationsRequired
								: strings.business.staff.locationsHint}
					</AppText>
				</CardFooter>
			</Card>

			<Card>
				<CardHeader>
					<AppText variant="labelSmall" weight="bold">
						{strings.business.staff.sessionPolicy}
					</AppText>
				</CardHeader>
				<CardContent>
					{role === "manager" ? (
						<View style={styles.sessionRow}>
							<View style={styles.flex1}>
								<AppText variant="bodyMedium" weight="semiBold">
									{strings.business.staff.sessionNever}
								</AppText>
							</View>
							<Switch
								checked={persistentSession}
								onCheckedChange={setPersistentSession}
							/>
						</View>
					) : (
						<AppText variant="bodyMedium" weight="semiBold">
							{strings.business.staff.sessionShifts}
						</AppText>
					)}
				</CardContent>
				<CardFooter>
					{/* El pie dice la política EFECTIVA, no una explicación fija:
					    con el modo persistente dado, decir «la sesión dura 24
					    horas» sería mentirle a la persona sobre lo que acaba de
					    elegir. */}
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground }}
					>
						{role === "manager" && persistentSession
							? strings.business.staff.sessionPersistentHint
							: strings.business.staff.sessionShiftsHint}
					</AppText>
				</CardFooter>
			</Card>

			{error ? (
				<AppText variant="bodySmall" style={{ color: colors.destructive }}>
					{error}
				</AppText>
			) : null}

			<Button
				fullWidth
				loading={submitting}
				disabled={!canSubmit}
				onPress={submit}
			>
				{isEdit
					? strings.business.staff.saveChanges
					: strings.business.staff.createAccess}
			</Button>
		</View>
	);
}

/**
 * Una de las dos opciones de rol.
 *
 * El rol se elige con un radio y no con un desplegable porque son DOS y
 * ninguna es la que está por defecto: el dueño tiene que ver las dos para
 * saber que el cajero no administra al equipo.
 */
function RoleOption({
	label,
	selected,
	onPress,
}: {
	label: string;
	selected: boolean;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="radio"
			accessibilityState={{ checked: selected }}
			style={[
				styles.option,
				{
					borderColor: selected ? colors.primary : colors.borderSolid,
					backgroundColor: selected
						? withAlpha(colors.primary, 0.051)
						: colors.card,
				},
			]}
		>
			<AppText
				variant="bodyMedium"
				weight={selected ? "bold" : "medium"}
				style={{ color: selected ? colors.primary : colors.foreground }}
			>
				{label}
			</AppText>
		</Pressable>
	);
}

/**
 * Una sucursal que el acceso puede alcanzar.
 *
 * La casilla es la que el §9.2 pide —«sucursales (casillas)»— y su estado
 * vive en el formulario: la lista de alcance es lo que se manda.
 */
function LocationOption({
	location,
	checked,
	onPress,
}: {
	location: BusinessLocation;
	checked: boolean;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="checkbox"
			accessibilityState={{ checked }}
			style={styles.locationRow}
		>
			{/* La fila es el control —un checkbox con su nombre— y la casilla
			    de dentro es sólo el dibujo: sin `accessible={false}` el
			    VoiceOver anunciaría una casilla suelta al lado de la fila que
			    ya dice lo mismo. */}
			<Checkbox
				checked={checked}
				onCheckedChange={onPress}
				accessible={false}
			/>
			<AppText variant="bodyMedium" style={{ color: colors.foreground }}>
				{location.name}
			</AppText>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: { gap: spacing.md },
	spaced: { marginTop: spacing.lg },
	identity: { gap: 2 },
	flex1: { flex: 1, gap: 2 },
	option: {
		borderRadius: radii.md,
		borderWidth: 1,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.lg,
	},
	locationRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.sm,
	},
	sessionRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
});
