import * as Clipboard from "expo-clipboard";
import { Share, StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { toast } from "sonner-native";

import type { BusinessMemberDeliveryCardDto } from "@0xc1x/role-commons";
import { Button } from "@/components/ui/button";
import { strings } from "@/src/core/i18n/strings";
import { AppText, BottomSheetModal } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";

/**
 * La tarjeta de entrega (§9.2).
 *
 * ─── POR QUÉ EL PIN SE MUESTRA UNA SÓLO VEZ ───────────────────────────────────
 *
 * Porque el PIN no se guarda en ningún sitio —ni en el dispositivo, ni en el
 * caché, ni en un log— y el servidor tampoco lo puede devolver: la única
 * manera de recuperarlo es ROTARLO, que es dejar de valer el anterior. Por eso
 * el aviso está SIEMPRE visible en la tarjeta, y no en un diálogo al cerrar:
 * un diálogo se puede descartar sin leer y el PIN se pierde igual.
 *
 * ─── Y POR QUÉ EL AVISO ESTÁ EN LA TARJETA Y NO EN EL CIERRE ──────────────────
 *
 * Porque el cierre no es el momento del aviso: el aviso es de la TARJETA, que
 * es lo que el dueño se lleva. El botón de cerrar dice «Listo, ya lo entregué»
 * —una puerta, no una pregunta— y lo que advierte es lo que está escrito
 * arriba, siempre a la vista.
 */
export function DeliveryCardSheet({
	card,
	onClose,
}: {
	/** La respuesta del API: el alias, el PIN y los avisos del dominio. */
	card: BusinessMemberDeliveryCardDto;
	/** Cierra la hoja: quien la monta decide a dónde lleva. */
	onClose: () => void;
}) {
	const { colors } = useTheme();

	// El alias y el PIN JUNTOS: por separado hay que transcribir los dos, y el
	// que se transcribe de largo es el PIN, que es el irrecuperable.
	const payload = `${card.alias}\n${strings.business.staff.deliveryPinLabel}: ${card.pin}`;

	const copy = async () => {
		await Clipboard.setStringAsync(payload);
		toast.success(strings.business.staff.deliveryCopied);
	};

	const share = () => {
		// Compartir se puede CANCELAR: el diálogo del sistema se cierra sin
		// compartir y su promesa se rechaza. Sin este `catch` el rechazo queda
		// suelto y la app reporta un error que la persona no produjo.
		void Share.share({ message: payload }).catch(() => {});
	};

	return (
		<BottomSheetModal
			title={strings.business.staff.deliveryTitle}
			onClose={onClose}
			footer={
				<Button fullWidth onPress={onClose}>
					{strings.business.staff.deliveryClose}
				</Button>
			}
		>
			<View style={styles.card}>
				{/* El QR codifica el ALIAS en claro: es lo que el empleado teclea
				    al entrar, y cualquier cámara lo lee sin una app aparte. */}
				<View
					style={[
						styles.qrBox,
						{
							borderColor: colors.borderSolid,
							backgroundColor: colors.qrBackground,
						},
					]}
				>
					<QRCode
						value={card.alias}
						size={176}
						color={colors.qrForeground}
						backgroundColor={colors.qrBackground}
					/>
				</View>

				<AppText
					variant="bodySmall"
					style={{ color: colors.mutedForeground, textAlign: "center" }}
				>
					{strings.business.staff.deliveryQrHint}
				</AppText>

				<View style={styles.field}>
					<AppText
						variant="labelSmall"
						weight="semiBold"
						style={{ color: colors.mutedForeground }}
					>
						{strings.business.staff.deliveryAliasLabel}
					</AppText>
					<AppText variant="bodyMedium" weight="semiBold">
						{card.alias}
					</AppText>
				</View>

				<View style={styles.field}>
					<AppText
						variant="labelSmall"
						weight="semiBold"
						style={{ color: colors.mutedForeground }}
					>
						{strings.business.staff.deliveryPinLabel}
					</AppText>
					<AppText variant="h3" weight="bold" style={styles.pin}>
						{card.pin}
					</AppText>
				</View>

				{card.alias_warnings.includes("alias_domain_can_receive_mail") ? (
					<AppText variant="bodySmall" style={{ color: colors.destructive }}>
						{strings.business.staff.aliasWarning}
					</AppText>
				) : null}

				{/* El aviso del PIN irrecuperable: SIEMPRE visible, porque el
				    momento de leerlo es ahora y no después de cerrar. */}
				<AppText variant="bodySmall" weight="semiBold">
					{strings.business.staff.deliveryPinWarning}
				</AppText>

				<View style={styles.actions}>
					<Button
						variant="outline"
						style={styles.action}
						onPress={() => void copy()}
					>
						{strings.business.staff.deliveryCopy}
					</Button>
					<Button variant="outline" style={styles.action} onPress={share}>
						{strings.business.staff.deliveryShare}
					</Button>
				</View>
			</View>
		</BottomSheetModal>
	);
}

const styles = StyleSheet.create({
	card: { gap: spacing.md },
	qrBox: {
		alignSelf: "center",
		padding: spacing.md,
		borderRadius: radii.lg,
		borderWidth: 1,
	},
	field: { gap: 2 },
	pin: { letterSpacing: 4 },
	actions: { flexDirection: "row", gap: spacing.sm },
	action: { flex: 1 },
});
