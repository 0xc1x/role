import { StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { pickupQrValue } from "@/src/features/orders/domain/order";

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
