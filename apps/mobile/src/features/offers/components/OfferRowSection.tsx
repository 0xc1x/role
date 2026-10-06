import { useCallback, useMemo } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { MapPin } from "lucide-react-native";

import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/src/core/theme";
import { AppText, ErrorState, SectionHeader } from "@/src/core/ui";
import { spacing, radii } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { strings } from "@/src/core/i18n/strings";
import {
	usePopularOffers,
	useExpiringSoonOffers,
	useRecentOffers,
	useNearbyOffersHook,
	useSelectedAddress,
	useBusinessOffersRow,
} from "@/src/features/hooks";
import { OfferCard } from "@/src/features/offers/components/OfferCard";
import type { OfferDetail } from "@/src/features/offers/domain/offer";
import { Card } from "@/components/ui/card";

/**
 * Vive en `features/offers` y no en `features/home` porque ya no es de la home:
 * lo usan las cuatro secciones del inicio y también el perfil público de un
 * negocio. Un componente de offerings que `business` tiene que importar desde
 * `home` ata los dos features en la dirección equivocada.
 */
type SectionType = "popular" | "expiring" | "recent" | "nearby" | "business";

interface OfferRowSectionProps {
	type: SectionType;
	title: string;
	icon?: React.ReactNode;
	limit?: number;
	/**
	 * Cuántas se MUESTRAN cuando `limit` trae más. Es lo que habilita el "ver
	 * todas" solo cuando de verdad hay algo más: se piden `limit`, se enseñan
	 * `maxVisible` y el link aparece únicamente si hubo algo que cortar.
	 *
	 * Sin esto el link se ofrece siempre, y ofrecer "ver todas" sobre un
	 * listado de cinco es un callejón sin salida. No se resuelve en la pantalla
	 * que monta la fila porque ésa no ve los datos: la decisión es de la fila.
	 */
	maxVisible?: number;
	category?: string | null;
	/**
	 * Solo para `type="business"`. Va en las props y no se deduce del contexto
	 * porque cada fila llama a SU hook: los hooks nunca van dentro de ramas
	 * condicionales del switch.
	 */
	businessId?: string;
	onSeeAll?: () => void;
}

function OfferSkeleton({ fullWidth = false }: { fullWidth?: boolean }) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.offerCardSkeleton,
				{ backgroundColor: colors.card, borderColor: colors.borderSolid },
				fullWidth && styles.offerFull,
			]}
		>
			<Skeleton style={styles.offerImage} />
			<View style={styles.offerBody}>
				<Skeleton
					style={{
						height: 14,
						width: "70%",
						borderRadius: radii.sm,
						marginBottom: 8,
					}}
				/>
				<Skeleton
					style={{
						height: 10,
						width: "55%",
						borderRadius: radii.sm,
						marginBottom: 8,
					}}
				/>
				<Skeleton
					style={{
						height: 10,
						width: "60%",
						borderRadius: radii.sm,
					}}
				/>
			</View>
		</View>
	);
}

const SKELETON_ROWS = [0, 1, 2];

function skeletonKeyExtractor(item: number): string {
	return `skeleton-${item}`;
}

function offerKeyExtractor(item: OfferDetail): string {
	return item.offer.id;
}

function SkeletonRowItem() {
	return <OfferSkeleton />;
}

function OfferRowItem({ item }: { item: OfferDetail }) {
	return (
		<View style={styles.rowCard}>
			<OfferCard offer={item} />
		</View>
	);
}

function OfferRowView({
	title,
	icon,
	onSeeAll,
	offers,
	maxVisible,
	isLoading,
	isError,
	error,
	onRetry,
}: {
	title: string;
	icon?: React.ReactNode;
	onSeeAll?: () => void;
	offers?: OfferDetail[];
	maxVisible?: number;
	isLoading: boolean;
	isError: boolean;
	error?: unknown;
	onRetry?: () => void;
}) {
	const renderSkeletonItem = useCallback(() => <SkeletonRowItem />, []);
	const renderOfferItem = useCallback(
		({ item }: { item: OfferDetail }) => <OfferRowItem item={item} />,
		[],
	);

	// El corte y el link se resuelven juntos y en un solo lugar: si se ofrece
	// algo que no se muestra, hay más y el link corresponde; si no, el link
	// desaparece con lo que sobra.
	//
	// SOLO `maxVisible` puede apagarlo. Las cuatro secciones de la home piden el
	// link siempre y no filtran nada, así que sin `maxVisible` el `onSeeAll` se
	// respeta tal cual: tratarlo como "no hay más" les borraría el "Ver todo" de
	// la home a cambio de arreglar el perfil de un negocio.
	const visible = useMemo(() => {
		if (!offers || maxVisible === undefined) return offers;
		return offers.length > maxVisible ? offers.slice(0, maxVisible) : offers;
	}, [offers, maxVisible]);
	const hasMore =
		maxVisible === undefined ||
		(visible !== undefined && offers !== undefined
			? visible.length < offers.length
			: false);

	if (!isLoading && !isError && offers && offers.length === 0) return null;

	return (
		<View style={styles.container}>
			<SectionHeader
				title={title}
				icon={icon}
				onSeeAll={hasMore ? onSeeAll : undefined}
			/>
			{isLoading ? (
				<FlatList
					data={SKELETON_ROWS}
					keyExtractor={skeletonKeyExtractor}
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.rowContent}
					renderItem={renderSkeletonItem}
				/>
			) : isError ? (
				// Un fallo de red o de RLS no es un marketplace vacío: nunca
				// usar aquí el copy de "sin ofertas".
				<ErrorState error={error} onRetry={onRetry} />
			) : (
				<FlatList
					data={visible ?? offers}
					keyExtractor={offerKeyExtractor}
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.rowContent}
					renderItem={renderOfferItem}
				/>
			)}
		</View>
	);
}

// Cada sección llama a su hook en un componente propio: los hooks nunca
// van dentro de ramas condicionales del switch.
export function OfferRowSection(props: OfferRowSectionProps) {
	switch (props.type) {
		case "popular":
			return <PopularRow {...props} />;
		case "expiring":
			return <ExpiringRow {...props} />;
		case "recent":
			return <RecentRow {...props} />;
		case "nearby":
			return <NearbyRow {...props} />;
		case "business":
			return <BusinessRow {...props} />;
	}
}

type RowProps = Omit<OfferRowSectionProps, "type">;

function PopularRow({
	title,
	icon,
	limit = 10,
	category = null,
	onSeeAll,
}: RowProps) {
	const q = usePopularOffers(limit, category);
	return (
		<OfferRowView
			title={title}
			icon={icon}
			onSeeAll={onSeeAll}
			offers={q.data}
			isLoading={q.isLoading}
			isError={q.isError}
			error={q.error}
			onRetry={() => void q.refetch()}
		/>
	);
}

function ExpiringRow({ title, icon, limit = 10, onSeeAll }: RowProps) {
	const q = useExpiringSoonOffers(limit);
	return (
		<OfferRowView
			title={title}
			icon={icon}
			onSeeAll={onSeeAll}
			offers={q.data}
			isLoading={q.isLoading}
			isError={q.isError}
			error={q.error}
			onRetry={() => void q.refetch()}
		/>
	);
}

function RecentRow({ title, icon, limit = 10, onSeeAll }: RowProps) {
	const q = useRecentOffers(limit);
	return (
		<OfferRowView
			title={title}
			icon={icon}
			onSeeAll={onSeeAll}
			offers={q.data}
			isLoading={q.isLoading}
			isError={q.isError}
			error={q.error}
			onRetry={() => void q.refetch()}
		/>
	);
}

function NearbyRow({
	title,
	icon,
	limit = 10,
	category = null,
	onSeeAll,
}: RowProps) {
	const q = useNearbyOffersHook(limit, category);
	return (
		<OfferRowView
			title={title}
			icon={icon}
			onSeeAll={onSeeAll}
			offers={q.data}
			isLoading={q.isLoading}
			isError={q.isError}
			error={q.error}
			onRetry={() => void q.refetch()}
		/>
	);
}

/**
 * Las ofertas de un negocio, para su perfil público.
 *
 * La fila se queda con `onSeeAll` del llamador y no lo decide sola: el slider
 * enseña `limit` ofertas y el "ver todas" tiene que vivir solo cuando hay una
 * más, que es una decisión de la pantalla que lo monta y no de esta fila —
 *OfferRowView solo sabe mostrar lo que le dieron.
 */
function BusinessRow({
	title,
	icon,
	limit = 10,
	maxVisible,
	businessId,
	onSeeAll,
}: RowProps) {
	const q = useBusinessOffersRow(businessId ?? "", limit);
	return (
		<OfferRowView
			title={title}
			icon={icon}
			onSeeAll={onSeeAll}
			maxVisible={maxVisible}
			offers={q.data}
			isLoading={q.isLoading}
			isError={q.isError}
			error={q.error}
			onRetry={() => void q.refetch()}
		/>
	);
}

export function OfferColumnSection({
	title,
	limit = 10,
	category = null,
	onSeeAll,
}: {
	title: string;
	limit?: number;
	category?: string | null;
	onSeeAll?: () => void;
}) {
	const { colors } = useTheme();
	const selectedAddress = useSelectedAddress();
	const {
		data: offers,
		isLoading,
		isError,
		error,
		refetch,
	} = useNearbyOffersHook(limit, category);

	const hasLocation =
		selectedAddress?.latitude != null && selectedAddress?.longitude != null;

	if (!hasLocation) {
		return (
			<View style={styles.locationPromptWrap}>
				<Card style={styles.locationPromptCard}>
					<View style={styles.locationPromptRow}>
						<View
							style={[
								styles.locationPromptIcon,
								{ backgroundColor: withAlpha(colors.primary, 0.078) },
							]}
						>
							<MapPin size={20} color={colors.primary} />
						</View>
						<View style={styles.locationPromptText}>
							<AppText variant="bodyMedium" weight="semiBold">
								{strings.home.activateLocation}
							</AppText>
							<AppText
								variant="bodySmall"
								style={{ color: colors.mutedForeground }}
							>
								{strings.home.activateLocationBody}
							</AppText>
						</View>
					</View>
				</Card>
			</View>
		);
	}

	if (!isLoading && !isError && offers && offers.length === 0) return null;

	return (
		<View style={styles.container}>
			<SectionHeader title={title} onSeeAll={onSeeAll} />
			{isLoading ? (
				<View style={styles.columnContent}>
					{Array.from({ length: 3 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed-count placeholders
						<View key={`skeleton-${i}`} style={styles.columnItem}>
							<OfferSkeleton fullWidth />
						</View>
					))}
				</View>
			) : isError ? (
				// Mismo criterio que OfferRowView: un fallo no es un vacío.
				<ErrorState error={error} onRetry={() => void refetch()} />
			) : (
				<View style={styles.columnContent}>
					{offers?.map((item) => (
						<View key={item.offer.id} style={styles.columnItem}>
							<OfferCard offer={item} />
						</View>
					))}
				</View>
			)}
		</View>
	);
}

const ROW_CARD_HEIGHT = 270;

const styles = StyleSheet.create({
	container: {
		marginBottom: spacing.lg,
	},
	rowContent: {
		paddingHorizontal: spacing.lg,
		gap: spacing.md,
	},
	rowCard: {
		width: 260,
		height: ROW_CARD_HEIGHT,
	},
	offerFull: {
		width: "100%",
	},
	offerCardSkeleton: {
		width: 260,
		height: ROW_CARD_HEIGHT,
		borderRadius: radii.xl,
		overflow: "hidden",
		borderWidth: 1,
	},
	offerImage: {
		width: "100%",
		height: 160,
	},
	offerBody: {
		padding: spacing.md,
	},
	columnContent: {
		paddingHorizontal: spacing.lg,
	},
	columnItem: {
		marginBottom: spacing.md,
	},
	locationPromptWrap: {
		padding: spacing.lg,
	},
	locationPromptCard: {
		padding: spacing.md,
		borderRadius: radii.lg,
	},
	locationPromptRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	locationPromptIcon: {
		width: 40,
		height: 40,
		borderRadius: radii.lg,
		alignItems: "center",
		justifyContent: "center",
	},
	locationPromptText: {
		flex: 1,
	},
});
