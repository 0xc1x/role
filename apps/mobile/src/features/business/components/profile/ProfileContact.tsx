import { Pressable, StyleSheet, View } from "react-native";
import {
	Clock,
	Globe,
	Mail,
	MapPin,
	Phone,
	type LucideIcon,
} from "lucide-react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import type { BusinessProfileDetail } from "@/src/features/business/domain/business";
import { BusinessLocationMap } from "@/src/features/business/components/BusinessLocationMap";
import { openMaps, openUrl } from "./maps";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * Contacto, con el mapa adentro.
 *
 * El mapa estaba en una card propia al final de la pantalla y repetía la
 * dirección que la fila de acá ya muestra. Ahora baja dentro de esta card, que
 * es donde se lee la dirección: deja de ser un bloque suelto al pie y pasa a
 * ser la forma de esa misma dirección.
 *
 * La fila conservó su "Indicaciones →", así que el botón de la card vieja —que
 * hacía exactamente lo mismo— se fue con ella: dos controles que abren el mapa
 * en la misma pantalla es una decisión que le toca a quien lee, no una que se
 * ofrezca dos veces.
 *
 * CONTRAÍBLE PERO ABIERTA, que no es lo mismo que las otras dos. Horarios y
 * reseñas arrancan cerrados porque son consulta: casi nadie que abre un perfil
 * está ahí para leer el horario de los domingos. Acá es al revés —la dirección
 * es lo que se viene a buscar, y con el mapa adentro la card ocupa más que
 * ninguna—, pero quien ya leyó lo que necesitaba vuelve a esperar al slider de
 * ofertas de abajo y el pliegue le sirve igual. Se pliega con el mismo gesto que
 * los otros dos para que el pulgar no tenga que aprender dos patrones.
 *
 * El chevron lo pone `AccordionTrigger`; no se agrega a mano.
 */
export function ContactInfoCard({
	profile,
}: {
	profile: BusinessProfileDetail;
}) {
	const { colors } = useTheme();
	const business = profile.business;
	const hasCoords = profile.latitude != null && profile.longitude != null;
	const openInMaps = () => {
		const lat = profile.latitude;
		const lng = profile.longitude;
		if (lat != null && lng != null) void openMaps(lat, lng);
	};
	return (
		<Card style={[styles.card, { boxShadow: `0px 4px 12px ${colors.shadow}` }]}>
			<Accordion type="single" collapsible defaultValue="business-contact">
				<AccordionItem value="business-contact" className="border-b-0">
					<CardHeader>
						<AccordionTrigger
							className="py-0"
							accessibilityLabel={strings.businessProfile.contactInfo}
						>
							<AppText variant="labelMedium" weight="bold">
								{strings.businessProfile.contactInfo}
							</AppText>
						</AccordionTrigger>
					</CardHeader>
					<AccordionContent className="p-0">
						<CardContent>
							<InfoRow
								icon={MapPin}
								label={strings.businessProfile.address}
								text={profile.address ?? strings.businessProfile.notAvailable}
								trailing={
									hasCoords ? (
										<Pressable onPress={openInMaps}>
											<AppText weight="bold" style={{ color: colors.primary }}>
												{strings.businessProfile.directions}
											</AppText>
										</Pressable>
									) : null
								}
							/>

							{business.phone?.length ? (
								<>
									<View style={{ height: spacing.md }} />
									<InfoRow
										icon={Phone}
										label={strings.businessProfile.phone}
										text={business.phone}
										onPress={() => void openUrl(`tel:${business.phone}`)}
										isLink
									/>
								</>
							) : null}

							{business.email?.length ? (
								<>
									<View style={{ height: spacing.md }} />
									<InfoRow
										icon={Mail}
										label={strings.businessProfile.email}
										text={business.email}
										onPress={() => void openUrl(`mailto:${business.email}`)}
										isLink
									/>
								</>
							) : null}

							{business.website?.length ? (
								<>
									<View style={{ height: spacing.md }} />
									<InfoRow
										icon={Globe}
										label={strings.businessProfile.website}
										text={business.website}
										onPress={() => {
											const site = business.website;
											if (!site) return;
											const url = site.startsWith("http")
												? site
												: `https://${site}`;
											void openUrl(url);
										}}
										isLink
									/>
								</>
							) : null}

							{/* El mapa es la última cosa de la card porque es la que contesta
				    "cómo llego", que es lo que se viene a buscar después de leer
				    la dirección. Sin coordenadas no se dibuja: un mapa en blanco
				    con el negocio en el medio del océano es peor que nada.
				    El `&&` con el null-check está repetido a propósito: es lo que
				    narrowea el tipo hasta `number` sin un `as`. */}
							{hasCoords &&
							profile.latitude != null &&
							profile.longitude != null ? (
								<>
									<View style={{ height: spacing.lg }} />
									<BusinessLocationMap
										latitude={profile.latitude}
										longitude={profile.longitude}
										onPress={openInMaps}
									/>
								</>
							) : null}
						</CardContent>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</Card>
	);
}

export function InfoRow({
	icon: Icon,
	label,
	text,
	onPress,
	isLink,
	trailing,
}: {
	icon: LucideIcon;
	label: string;
	text: string;
	onPress?: () => void;
	isLink?: boolean;
	trailing?: React.ReactNode;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.infoRow}>
			<Icon size={18} color={colors.primary} style={{ marginTop: 2 }} />
			<View style={{ width: spacing.sm }} />
			<View style={{ flex: 1 }}>
				<AppText style={{ color: colors.mutedForeground, fontSize: 12 }}>
					{label}
				</AppText>
				<Pressable onPress={onPress} disabled={!isLink}>
					<AppText
						weight={isLink ? "bold" : undefined}
						style={{
							color: isLink ? colors.primary : colors.foreground,
							marginTop: 2,
						}}
					>
						{text}
					</AppText>
					{trailing ? <View style={{ marginTop: 4 }}>{trailing}</View> : null}
				</Pressable>
			</View>
		</View>
	);
}

/**
 * Horarios, contraíbles.
 *
 * Arranca contraído porque es información de consulta: casi nadie que abre el
 * perfil de una panadería está ahí para leer el horario de los domingos, y
 * desplegado tapaba las secciones que sí se vienen a ver. El mismo molde que
 * los pasos de retiro del detalle del pedido, que es el otro caso de "está
 * ahí, no es lo que viniste a buscar".
 */
export function HoursCard({
	hours,
}: {
	hours: BusinessProfileDetail["hours"];
}) {
	const { colors } = useTheme();
	return (
		<Card style={[styles.card, { boxShadow: `0px 4px 12px ${colors.shadow}` }]}>
			<Accordion type="single" collapsible>
				<AccordionItem value="business-hours" className="border-b-0">
					<CardHeader>
						<AccordionTrigger
							className="py-0"
							accessibilityLabel={strings.businessProfile.businessHours}
						>
							<View style={styles.hoursTitleRow}>
								<Clock size={20} color={colors.primary} />
								<View style={{ width: spacing.sm }} />
								<AppText weight="semiBold">
									{strings.businessProfile.businessHours}
								</AppText>
							</View>
						</AccordionTrigger>
					</CardHeader>
					<AccordionContent className="p-0">
						<CardContent>
							{hours.map((h) => {
								const closed =
									h.hoursDisplay === strings.businessProfile.closed;
								return (
									<View
										key={h.dayRange}
										style={[
											styles.hoursRow,
											{ borderBottomColor: colors.border },
										]}
									>
										<AppText weight="medium">{h.dayRange}</AppText>
										<AppText
											style={{
												color: closed
													? colors.destructive
													: colors.mutedForeground,
											}}
										>
											{h.hoursDisplay}
										</AppText>
									</View>
								);
							})}
						</CardContent>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</Card>
	);
}

const styles = StyleSheet.create({
	card: {
		width: "100%",
		padding: spacing.sm,
		borderRadius: radii.xl,
		backgroundColor: "transparent",
	},
	infoRow: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	hoursTitleRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	hoursRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: spacing.sm,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
});
