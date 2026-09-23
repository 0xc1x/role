import { Download } from "lucide-react-native";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
	StatusBadge,
} from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { useBusinessPayout } from "@/src/features/business/hooks";
import { PAYOUT_STATUS_LABELS } from "@/src/features/business/domain/business";
import { formatMoney, formatMoneyPrecise } from "@/src/core/utils/formatters";
import type { Payout } from "@0xc1x/role-commons";
import type { BadgeTone } from "@/src/core/ui";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const TONE: Record<Payout["status"], BadgeTone> = {
	paid: "success",
	pending: "warning",
	processing: "info",
	failed: "danger",
};

export default function BusinessPayoutDetailScreen() {
	const { colors } = useTheme();
	const { payoutId } = useLocalSearchParams<{
		id: string;
		payoutId: string;
	}>();
	const { data: payout, isLoading, isError, error, refetch } =
		useBusinessPayout(payoutId ?? "");

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

			<View style={[styles.hero, { backgroundColor: colors.ink }]}>
				<AppText
					variant="labelSmall"
					weight="bold"
					style={{ color: withAlpha(colors.onMedia, 0.702) }}
				>
					{strings.business.netTotal}
				</AppText>
				<AppText variant="h1" weight="bold" style={{ color: colors.onMedia }}>
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
				variant="outline"
				fullWidth
				disabled
				icon={<Download size={18} />}
			>
				{strings.business.downloadReceipt}
			</Button>
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
		borderRadius: radii.md,
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