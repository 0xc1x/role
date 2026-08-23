import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import {
	CameraView,
	useCameraPermissions,
	type BarcodeScanningResult,
} from "expo-camera";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText, BottomSheetModal, Button } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { useValidatePickupCode } from "@/features/business/hooks";
import { parsePickupQr } from "./qr";

type ScanStatus = "idle" | "validating" | "success" | "error";

/**
 * Bottom-sheet QR scanner for pickup validation (ported from Rolé v1
 * `PickupScannerSheet`). Scans the consumer QR, validates it through the
 * `validate_pickup_code` RPC and reports success via `onValidated`.
 * On web it shows an informative fallback (barcode scanning is native-only).
 */
export function PickupScannerSheet({
	businessId,
	orderId,
	onClose,
	onValidated,
}: {
	businessId: string;
	orderId: string;
	onClose: () => void;
	onValidated: () => void;
}) {
	const { colors } = useTheme();

	return (
		<BottomSheetModal onClose={onClose} title={strings.business.ordersScanTitle}>
			<View style={styles.content}>
				<AppText
					variant="bodySmall"
					style={{ color: colors.mutedForeground, textAlign: "center" }}
				>
					{strings.business.ordersScanHint}
				</AppText>

			<NativeScanner
				businessId={businessId}
				orderId={orderId}
				onValidated={onValidated}
				onClose={onClose}
				colors={colors}
			/>

			<Button
				label={strings.common.cancel}
				variant="outline"
				fullWidth
				size="lg"
				onPress={onClose}
				style={styles.cancel}
				/>
			</View>
		</BottomSheetModal>
	);
}

// ─── Native/web: cámara + overlay de estados ─────────────────────

function NativeScanner({
	businessId,
	orderId,
	onValidated,
	onClose,
	colors,
}: {
	businessId: string;
	orderId: string;
	onValidated: () => void;
	onClose: () => void;
	colors: ReturnType<typeof useTheme>["colors"];
}) {
	const [permission, requestPermission] = useCameraPermissions();
	const validate = useValidatePickupCode(businessId);
	const [scanned, setScanned] = useState<string | null>(null);
	const [status, setStatus] = useState<ScanStatus>("idle");

	const ignoreScan = status !== "idle";

	useEffect(() => {
		if (status !== "success") return;
		const timer = setTimeout(() => {
			onValidated();
			onClose();
		}, 1100);
		return () => clearTimeout(timer);
	}, [status, onValidated, onClose]);

	const handleBarcode = ({ data }: BarcodeScanningResult) => {
		if (ignoreScan) return;
		setScanned(data);
		const parsed = parsePickupQr(data, orderId);
		if (!parsed) {
			setStatus("error");
			return;
		}
		setStatus("validating");
		validate.mutate(
			{ orderId: parsed.orderId, pickupCode: parsed.pickupCode },
			{
				onSuccess: (result) => setStatus(result.success ? "success" : "error"),
				onError: () => setStatus("error"),
			},
		);
	};

	const reset = () => {
		setScanned(null);
		setStatus("idle");
	};

	if (permission === null) {
		return (
			<View style={[styles.previewWrap, styles.center, { borderColor: colors.borderSolid }]}>
				<ActivityIndicator color={colors.primary} />
			</View>
		);
	}

	if (!permission?.granted) {
		return (
			<View
				style={[
					styles.previewWrap,
					styles.center,
					{ borderColor: colors.borderSolid, backgroundColor: colors.inputBackground },
				]}
			>
				<Ionicons name="camera-outline" size={36} color={colors.mutedForeground} />
				<AppText
					variant="bodyMedium"
					style={{ color: colors.mutedForeground, textAlign: "center" }}
				>
					{permission?.canAskAgain === false
						? strings.business.cameraPermissionDenied
						: strings.business.cameraPermissionBody}
				</AppText>
				{permission?.canAskAgain !== false ? (
					<Button
						label={strings.business.cameraPermissionGrant}
						variant="primary"
						onPress={() => void requestPermission()}
						style={styles.permissionBtn}
					/>
				) : null}
			</View>
		);
	}

	return (
		<View style={[styles.previewWrap, { borderColor: colors.borderSolid }]}>
			<CameraView
				style={styles.preview}
				facing="back"
				barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
				onBarcodeScanned={handleBarcode}
			>
				{status !== "idle" ? (
					<View style={styles.scanOverlay}>
						{status === "validating" ? (
							<View style={styles.center}>
								<ActivityIndicator color="#FFFFFF" size="large" />
								<AppText
									variant="bodyMedium"
									weight="semiBold"
									style={{ color: "#FFFFFF", marginTop: spacing.md }}
								>
									{strings.business.ordersValidatingCode}
								</AppText>
							</View>
						) : status === "success" ? (
							<View style={styles.center}>
								<Ionicons
									name="checkmark-circle"
									size={64}
									color={colors.success}
								/>
								<AppText
									variant="bodyMedium"
									weight="bold"
									style={{ color: "#FFFFFF", marginTop: spacing.md }}
								>
									{strings.business.ordersScanSuccess}
								</AppText>
							</View>
						) : (
							<View style={styles.center}>
								<Ionicons
									name="close-circle"
									size={64}
									color={colors.destructiveVibrant}
								/>
								<AppText
									variant="bodyMedium"
									weight="bold"
									style={{ color: "#FFFFFF", marginTop: spacing.md }}
								>
									{strings.business.ordersScanInvalid}
								</AppText>
								{scanned ? (
									<AppText
										variant="bodySmall"
										numberOfLines={1}
										style={{ color: "#FFFFFFCC", marginTop: 4 }}
									>
										{scanned}
									</AppText>
								) : null}
								<Pressable
									onPress={reset}
									accessibilityRole="button"
									style={({ pressed }) => [
										styles.scanAgain,
										{
											backgroundColor: colors.primary,
											opacity: pressed ? 0.85 : 1,
										},
									]}
								>
									<AppText variant="bodyMedium" weight="semiBold" color="#FFFFFF">
										{strings.business.ordersScanAgain}
									</AppText>
								</Pressable>
							</View>
						)}
					</View>
				) : null}
			</CameraView>
		</View>
	);
}

const styles = StyleSheet.create({
	content: {
		paddingHorizontal: spacing.xl,
		gap: spacing.md,
	},
	previewWrap: {
		height: 320,
		borderRadius: radii.xl,
		borderWidth: 1,
		overflow: "hidden",
	},
	preview: {
		flex: 1,
	},
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.lg,
	},
	scanOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0,0,0,0.54)",
	},
	scanAgain: {
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.md,
		borderRadius: radii.pill,
		marginTop: spacing.lg,
	},
	permissionBtn: { marginTop: spacing.md },
	cancel: { marginBottom: spacing.md },
});