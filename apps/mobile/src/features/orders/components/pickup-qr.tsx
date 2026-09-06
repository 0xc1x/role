import { StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";

/** Valor escaneable del QR de recogida (contrato con el escáner del negocio). */
export function pickupQrValue(orderId: string, pickupCode: string): string {
	return `role://order/${orderId}/${pickupCode}`;
}

/**
 * QR del pickup code compartido por el detalle del pedido y el ticket
 * post-checkout. Colores fijos (qrForeground/qrBackground): el escáner
 * necesita contraste estable en cualquier tema.
 */
export function PickupQr({
	orderId,
	pickupCode,
}: {
	orderId: string;
	pickupCode: string;
}) {
	const { colors } = useTheme();
	return (
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
				value={pickupQrValue(orderId, pickupCode)}
				size={176}
				color={colors.qrForeground}
				backgroundColor={colors.qrBackground}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	qrBox: {
		padding: spacing.md,
		borderRadius: radii.lg,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
});
