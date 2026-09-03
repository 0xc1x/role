import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	Card,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
	StatusBadge,
} from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { useBusinessPayouts } from "@/features/business/hooks";
import { PAYOUT_STATUS_LABELS } from "@/features/business/domain/business";
import { formatMoney, formatMoneyPrecise } from "@/core/utils/formatters";
import type { Payout } from "@0xc1x/role-commons";
import type { BadgeTone } from "@/core/ui";

const TONE: Record<Payout["status"], BadgeTone> = {
	paid: "success",
	pending: "warning",
	processing: "info",
	failed: "danger",
};

export default function BusinessPayoutDetailScreen() {
	const { colors } = useTheme();
	const { id, payoutId } = useLocalSearchParams<{
		id: string;
		payoutId: string;
	}>();
	const { data, isLoading, isError, error, refetch } =
		useBusinessPayouts(id ?? "");
	const payout = data?.find((p) => p.id === payoutId);

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!payout) return null;

	const taxes = payout.gross_amount - payout.platform_fee - payout.net_amount;

	return (
		<Screen scroll contentContainerStyle={styles.container}>
			<ScreenHeader
				title={strings.business.payoutDetailTitle}
				fallback="/(business)/management"
			/>
			{payout.status === "paid" ? (
				<View style={styles.headerBadge}>
					<StatusBadge
						label={PAYOUT_STATUS_LABELS[payout.status]}
						tone={TONE[payout.status]}
					/>
				</View>
			) : null}

			<View style={styles.hero}>
				<AppText
					variant="labelSmall"
					weight="bold"
					style={{ color: "#ffffffB3" }}
				>
					{strings.business.netTotal}
				</AppText>
				<AppText variant="h1" weight="bold" style={{ color: "#FFFFFF" }}>
					{formatMoney(payout.net_amount)}
				</AppText>
				{payout.status === "paid" && payout.paid_at ? (
					<AppText
						variant="bodySmall"
						weight="semiBold"
						style={{ color: colors.success }}
					>
						{strings.business.settledOn} {formatPaidAt(payout.paid_at)}
					</AppText>
				) : null}
			</View>

			<Card style={styles.card}>
				<AppText variant="bodyMedium" weight="bold" style={{ marginBottom: spacing.md }}>
					{strings.business.accountingReconciliation}
				</AppText>
				<BreakdownRow
					label={strings.business.totalGrossSales}
					value={formatMoneyPrecise(payout.gross_amount)}
					strong
				/>
				<BreakdownRow
					label={strings.business.platformFee}
					value={`-${formatMoneyPrecise(payout.platform_fee)}`}
					negative
				/>
				<BreakdownRow
					label={strings.business.bankFees}
					value={`-${formatMoneyPrecise(taxes)}`}
					negative
				/>
				<View
					style={[styles.divider, { backgroundColor: colors.borderSolid }]}
				/>
				<View style={styles.netRow}>
					<AppText variant="bodyMedium" weight="bold">
						{strings.business.netDeposit}
					</AppText>
					<AppText
						variant="bodyMedium"
						weight="bold"
						style={{ color: colors.successDark }}
					>
						{formatMoney(payout.net_amount)}
					</AppText>
				</View>
			</Card>

			<Card style={styles.card}>
				<AppText variant="bodyMedium" weight="bold" style={{ marginBottom: spacing.sm }}>
					{strings.business.periodInfo}
				</AppText>
				<MetaRow label={strings.business.period} value={periodLabel(payout)} />
				<MetaRow label="ID" value={payout.id} />
			</Card>

			{/* Comprobante no disponible aún — se habilita con el gateway de pagos. */}
			<Button
			    style={{ marginTop: spacing.lg }}
				label={strings.business.downloadReceipt}
				variant="outline"
				fullWidth
				disabled
				icon={<Ionicons name="download-outline" size={18} />}
			/>
		</Screen>
	);
}

function BreakdownRow({
	label,
	value,
	negative = false,
	strong = false,
}: {
	label: string;
	value: string;
	negative?: boolean;
	strong?: boolean;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.row}>
			<AppText
				variant="bodySmall"
				style={{ color: colors.mutedForeground }}
			>
				{label}
			</AppText>
			<AppText
				variant="bodySmall"
				weight={strong ? "bold" : "medium"}
				style={negative ? { color: colors.destructive } : undefined}
			>
				{value}
			</AppText>
		</View>
	);
}

function MetaRow({ label, value }: { label: string; value: string }) {
	const { colors } = useTheme();
	return (
		<View style={styles.row}>
			<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
				{label}
			</AppText>
			<AppText variant="bodySmall" weight="medium">
				{value}
			</AppText>
		</View>
	);
}

function periodLabel(payout: Payout): string {
	const start = new Date(`${payout.period_start}T00:00:00`);
	const end = new Date(`${payout.period_end}T00:00:00`);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return `${payout.period_start} – ${payout.period_end}`;
	}
	const months = [
		"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
		"Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
	];
	return `${months[start.getMonth()]} ${start.getDate()}-${end.getDate()}, ${start.getFullYear()}`;
}

function formatPaidAt(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	const months = [
		"ene", "feb", "mar", "abr", "may", "jun",
		"jul", "ago", "sep", "oct", "nov", "dic",
	];
	return `${date.getDate()} de ${months[date.getMonth()]}. de ${date.getFullYear()}`;
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
	headerBadge: { alignSelf: "flex-start", marginTop: spacing.md },
	hero: {
		width: "100%",
		alignItems: "center",
		paddingVertical: spacing.xl,
		marginTop: spacing.lg,
		gap: 4,
		backgroundColor: "#1A1A18",
		borderRadius: 12,
	},
	card: { marginTop: spacing.lg },
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 4,
	},
	divider: { height: 1, marginVertical: spacing.sm },
	netRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
});