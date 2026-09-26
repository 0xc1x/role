import { useMemo, useState } from "react";
import {
	ActivityIndicator,
	Platform,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import { Image } from "expo-image";
import {
	Check,
	ChevronDown,
	Image as ImageIcon,
	Store,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";

import { toAppError } from "@/src/core/error/mapper";
import { strings } from "@/src/core/i18n/strings";
import { AppText, BottomSheetModal, goBackOr, TextField } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useCategories } from "@/src/features/hooks";
import {
	useBusinessLocations,
	useSaveOffer,
} from "@/src/features/business/hooks";
import {
	defaultPickupWindow,
	validatePickupWindow,
} from "@/src/features/business/domain/products";
import type { OfferDetail } from "@/src/features/offers/domain/offer";
import { DateTimeField } from "./DateTimeFields";
import { pickWebImage } from "../../utils/pick-image";
import { Button } from "@/components/ui/button";

/**
 * Shared create/edit product form (ported from Rolé v1
 * `BusinessProductFormScreen`). Receives a `product` to edit the offer,
 * otherwise it's a create form.
 */
export function ProductForm({
	businessId,
	product,
}: {
	businessId: string;
	product?: OfferDetail;
}) {
	const { colors } = useTheme();
	const categoriesQuery = useCategories();
	const locationsQuery = useBusinessLocations(businessId);
	const save = useSaveOffer(businessId);

	const categories = categoriesQuery.data;
	const locations = locationsQuery.data;

	const editing = product != null;

	const [imageUri, setImageUri] = useState<string | null>(
		product?.offer.image ?? null,
	);
	const [title, setTitle] = useState(product?.offer.title ?? "");
	const [description, setDescription] = useState(
		product?.offer.description ?? "",
	);
	const [includes, setIncludes] = useState(product?.offer.includes ?? "");
	const [allergens, setAllergens] = useState(product?.offer.allergens ?? "");
	const [categoryIds, setCategoryIds] = useState<string[]>(
		() => product?.categories.map((c) => c.id) ?? [],
	);
	const selectedCategoryIds = useMemo(
		() => new Set(categoryIds),
		[categoryIds],
	);
	const [locationId, setLocationId] = useState(
		product?.offer.business_location_id ?? "",
	);
	const [originalPrice, setOriginalPrice] = useState(
		product ? String(product.offer.original_price) : "",
	);
	const [discountedPrice, setDiscountedPrice] = useState(
		product ? String(product.offer.discounted_price) : "",
	);
	const [stock, setStock] = useState(
		product ? String(product.offer.stock) : "",
	);
	// An offer created at 21:00 must not default to a window that already
	// closed, so the default is derived from "now" and never in the past.
	const [defaultPickup] = useState(() => defaultPickupWindow());
	const [pickupStart, setPickupStart] = useState<Date>(() =>
		product ? new Date(product.offer.pickup_start) : defaultPickup.start,
	);
	const [pickupEnd, setPickupEnd] = useState<Date>(() =>
		product ? new Date(product.offer.pickup_end) : defaultPickup.end,
	);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [locationPickerOpen, setLocationPickerOpen] = useState(false);

	const toggleCategory = (id: string) =>
		setCategoryIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);

	const setStart = (next: Date) => {
		setPickupStart(next);
		// Keep a valid window: clamping end equal to start would always
		// fail the end > start validation and block the save.
		if (pickupEnd.getTime() <= next.getTime())
			setPickupEnd(new Date(next.getTime() + 60 * 60 * 1000));
	};
	const setEnd = (next: Date) => {
		setPickupEnd(next);
		if (next.getTime() <= pickupStart.getTime())
			setPickupStart(new Date(next.getTime() - 60 * 60 * 1000));
	};

	const pickImage = async () => {
		if (Platform.OS === "web") {
			setImageUri(await pickWebImage());
			return;
		}
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ["images"],
			quality: 0.8,
		});
		if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
	};

	const original = Number(originalPrice);
	const discounted = Number(discountedPrice);
	const discountPercent =
		original > 0 && discounted > 0 && discounted < original
			? Math.round(((original - discounted) / original) * 100)
			: null;

	const selectedLocationName = locations?.find(
		(l) => l.id === locationId,
	)?.name;

	const handleSubmit = () => {
		const nextErrors: Record<string, string> = {};
		if (!title.trim()) nextErrors.title = strings.business.requiredField;
		if (categoryIds.length === 0)
			nextErrors.categories = strings.business.selectAtLeastOneCategory;
		if (!description.trim())
			nextErrors.description = strings.business.requiredField;
		if (!(original > 0))
			nextErrors.originalPrice = strings.business.invalidPrice;
		if (!(discounted > 0))
			nextErrors.discountedPrice = strings.business.invalidPrice;
		else if (original > 0 && discounted >= original)
			nextErrors.discountedPrice = strings.business.priceMustBeLower;
		const stockNumber = Number(stock);
		if (!Number.isInteger(stockNumber) || stockNumber < 1)
			nextErrors.stock = strings.business.minStock;
		const pickupError = validatePickupWindow(pickupStart, pickupEnd);
		if (pickupError) nextErrors.pickup = pickupError;
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) return;

		save.mutate(
			{
				...(editing ? { id: product.offer.id } : {}),
				businessId,
				businessLocationId: locationId,
				title: title.trim(),
				description: description.trim() || null,
				includes: includes.trim() || null,
				allergens: allergens.trim() || null,
				originalPrice: original,
				discountedPrice: discounted,
				stock: stockNumber,
				initialStock: editing ? product.offer.initial_stock : stockNumber,
				pickupStart: pickupStart.toISOString(),
				pickupEnd: pickupEnd.toISOString(),
				isActive: editing ? product.offer.is_active : true,
				categories: categoryIds,
				imageUri,
			},
			{
				onSuccess: () => goBackOr("/(business)/products"),
				// El mensaje crudo del driver (inglés, con nombres de tabla y
				// constraint) nunca llega al dueño: el copy es-ES manda.
				onError: (e) =>
					setErrors({
						form: toAppError(e, strings.business.productSaveError).message,
					}),
			},
		);
	};

	return (
		<View style={styles.content}>
			{errors.form ? (
				<AppText variant="bodySmall" style={{ color: colors.destructive }}>
					{errors.form}
				</AppText>
			) : null}

			<Pressable
				cssInterop={false}
				onPress={() => void pickImage()}
				accessibilityRole="button"
				// Once a photo is chosen the only child is the <Image>, which
				// contributes no name: the label has to come from the prop.
				accessibilityLabel={
					imageUri ? strings.business.changePhoto : strings.business.uploadPhoto
				}
				style={({ pressed }) => [
					styles.imageArea,
					{
						backgroundColor: colors.inputBackground,
						borderColor: colors.borderSolid,
						opacity: pressed ? 0.85 : 1,
					},
				]}
			>
				{imageUri ? (
					<Image source={{ uri: imageUri }} style={styles.imagePreview} />
				) : (
					<View style={styles.imagePlaceholder}>
						<ImageIcon size={28} color={colors.mutedForeground} />
						<AppText
							variant="bodySmall"
							style={{ color: colors.mutedForeground }}
						>
							{strings.business.uploadPhoto}
						</AppText>
					</View>
				)}
			</Pressable>
			<AppText
				variant="labelSmall"
				weight="semiBold"
				style={{ color: colors.primary, alignSelf: "center", marginTop: 4 }}
			>
				{imageUri ? strings.business.changePhoto : strings.business.uploadPhoto}
			</AppText>

			<FormSection title={strings.business.productInfoBasic}>
				<TextField
					label={strings.business.productTitle}
					hint={strings.business.productNameHint}
					value={title}
					onChangeText={setTitle}
					error={errors.title ?? null}
				/>

				<View style={styles.fieldBlock}>
					<AppText
						variant="labelSmall"
						weight="semiBold"
						style={{ color: colors.mutedForeground }}
					>
						{strings.business.productCategories}
					</AppText>
					{/* A failed query used to render an empty chip row under a
					    required label: no clue why it failed, no way to retry. */}
					{categoriesQuery.isPending ? (
						<FieldLoadState state="loading" message={strings.common.loading} />
					) : categoriesQuery.isError ? (
						<FieldLoadState
							state="error"
							message={strings.business.categoriesLoadError}
							onRetry={() => void categoriesQuery.refetch()}
						/>
					) : (categories ?? []).length === 0 ? (
						<FieldLoadState
							state="empty"
							message={`${strings.business.noCategoriesTitle}. ${strings.business.noCategoriesBody}`}
						/>
					) : (
						<View style={styles.optionsWrap}>
							{(categories ?? []).map((category) => {
								const selected = selectedCategoryIds.has(category.id);
								return (
									<Pressable
										cssInterop={false}
										key={category.id}
										onPress={() => toggleCategory(category.id)}
										// Categories are a required multi-select: without a
										// checkbox role and checked state the selection is
										// carried by background colour alone.
										accessibilityRole="checkbox"
										accessibilityLabel={category.name}
										accessibilityState={{ checked: selected }}
										style={({ pressed }) => [
											styles.chip,
											{
												backgroundColor: selected
													? colors.secondary
													: colors.inputBackground,
												borderColor: selected
													? colors.secondary
													: colors.border,
												opacity: pressed ? 0.85 : 1,
											},
										]}
									>
										<AppText
											variant="bodySmall"
											weight={selected ? "semiBold" : "medium"}
											style={{
												color: selected
													? colors.secondaryForeground
													: colors.foreground,
											}}
										>
											{category.emoji
												? `${category.emoji} ${category.name}`
												: category.name}
										</AppText>
									</Pressable>
								);
							})}
						</View>
					)}
					{errors.categories ? (
						<AppText
							variant="bodySmall"
							style={{ color: colors.destructive, marginTop: 4 }}
						>
							{errors.categories}
						</AppText>
					) : null}
				</View>

				<View style={styles.fieldBlock}>
					<AppText
						variant="labelSmall"
						weight="semiBold"
						style={{ color: colors.mutedForeground }}
					>
						{strings.business.locations}
					</AppText>
					<Pressable
						cssInterop={false}
						onPress={() => setLocationPickerOpen(true)}
						accessibilityRole="button"
						accessibilityLabel={`${strings.business.locations}: ${selectedLocationName ?? strings.business.noLocationOption}`}
						style={({ pressed }) => [
							styles.selectRow,
							{
								backgroundColor: colors.inputBackground,
								borderColor: colors.border,
								opacity: pressed ? 0.85 : 1,
							},
						]}
					>
						<Store size={16} color={colors.foreground} />
						<AppText variant="bodyMedium" style={{ flex: 1 }}>
							{selectedLocationName ?? strings.business.noLocationOption}
						</AppText>
						<ChevronDown size={16} color={colors.mutedForeground} />
					</Pressable>
				</View>

				<TextField
					label={strings.business.productDescription}
					value={description}
					onChangeText={setDescription}
					multiline
					error={errors.description ?? null}
				/>
			</FormSection>

			<FormSection title={strings.business.additionalDetails}>
				<TextField
					label={strings.business.productIncludes}
					hint={strings.business.includesHint}
					value={includes}
					onChangeText={setIncludes}
				/>
				<TextField
					label={strings.business.productAllergens}
					hint={strings.business.allergensHint}
					value={allergens}
					onChangeText={setAllergens}
				/>
			</FormSection>

			<FormSection title={strings.business.priceStockSection}>
				<View style={styles.priceRow}>
					<TextField
						label={strings.business.productPrice}
						value={originalPrice}
						onChangeText={(t) =>
							setOriginalPrice(
								t.replace(/[^0-9.]/g, "").replace(/(\..*?)\./g, "$1"),
							)
						}
						keyboardType="decimal-pad"
						containerStyle={{ flex: 1 }}
						error={errors.originalPrice ?? null}
					/>
					<TextField
						label={strings.business.productDiscountedPrice}
						value={discountedPrice}
						onChangeText={(t) =>
							setDiscountedPrice(
								t.replace(/[^0-9.]/g, "").replace(/(\..*?)\./g, "$1"),
							)
						}
						keyboardType="decimal-pad"
						containerStyle={{ flex: 1 }}
						error={errors.discountedPrice ?? null}
					/>
				</View>
				{discountPercent != null ? (
					<View
						style={[
							styles.discountBadge,
							{ backgroundColor: colors.surfaceSuccess },
						]}
					>
						<AppText
							variant="bodySmall"
							weight="bold"
							style={{ color: colors.success }}
						>
							{strings.business.discountPercent.replace(
								"{percent}",
								String(discountPercent),
							)}
						</AppText>
					</View>
				) : null}
				<TextField
					label={strings.business.productStock}
					value={stock}
					onChangeText={(t) => setStock(t.replace(/[^0-9]/g, ""))}
					keyboardType="number-pad"
					error={errors.stock ?? null}
				/>
			</FormSection>

			<FormSection title={strings.business.pickupSchedule}>
				<View style={styles.priceRow}>
					<DateTimeField
						mode="date"
						label={strings.business.startDate}
						value={pickupStart}
						onChange={setStart}
					/>
					<DateTimeField
						mode="date"
						label={strings.business.endDate}
						value={pickupEnd}
						onChange={setEnd}
					/>
				</View>
				<View style={styles.priceRow}>
					<DateTimeField
						mode="time"
						label={strings.business.startTime}
						value={pickupStart}
						onChange={setStart}
					/>
					<DateTimeField
						mode="time"
						label={strings.business.endTime}
						value={pickupEnd}
						onChange={setEnd}
					/>
				</View>
				{errors.pickup ? (
					<AppText variant="bodySmall" style={{ color: colors.destructive }}>
						{errors.pickup}
					</AppText>
				) : null}
			</FormSection>

			<Button
				onPress={handleSubmit}
				loading={save.isPending}
				fullWidth
				size="lg"
				style={{ marginTop: spacing.lg }}
			>
				{editing
					? strings.business.saveChanges
					: strings.business.publishProduct}
			</Button>

			{locationPickerOpen ? (
				<BottomSheetModal
					title={strings.business.locations}
					onClose={() => setLocationPickerOpen(false)}
				>
					<Pressable
						cssInterop={false}
						onPress={() => {
							setLocationId("");
							setLocationPickerOpen(false);
						}}
						accessibilityRole="radio"
						accessibilityLabel={strings.business.noLocationOption}
						accessibilityState={{ checked: locationId === "" }}
						style={({ pressed }) => [
							styles.locationOption,
							{
								backgroundColor:
									locationId === "" ? colors.secondary : colors.inputBackground,
								borderColor: colors.borderSolid,
								opacity: pressed ? 0.85 : 1,
							},
						]}
					>
						<AppText
							variant="bodyMedium"
							weight={locationId === "" ? "semiBold" : "regular"}
							style={{
								color:
									locationId === ""
										? colors.secondaryForeground
										: colors.foreground,
							}}
						>
							{strings.business.noLocationOption}
						</AppText>
						{locationId === "" ? (
							<Check size={18} color={colors.secondaryForeground} />
						) : null}
					</Pressable>
					{/* Same three states as the categories field: a failed or still
					    loading list of branches is not an empty list of branches. */}
					{locationsQuery.isPending ? (
						<FieldLoadState state="loading" message={strings.common.loading} />
					) : locationsQuery.isError ? (
						<FieldLoadState
							state="error"
							message={strings.business.locationsLoadError}
							onRetry={() => void locationsQuery.refetch()}
						/>
					) : (locations ?? []).length === 0 ? (
						<FieldLoadState
							state="empty"
							message={strings.business.locationsPickerEmptyBody}
						/>
					) : null}
					{(locations ?? []).map((location) => (
						<Pressable
							cssInterop={false}
							key={location.id}
							onPress={() => {
								setLocationId(location.id);
								setLocationPickerOpen(false);
							}}
							accessibilityRole="radio"
							accessibilityLabel={location.name}
							accessibilityState={{ checked: locationId === location.id }}
							style={({ pressed }) => [
								styles.locationOption,
								{
									backgroundColor:
										locationId === location.id
											? colors.secondary
											: colors.inputBackground,
									borderColor: colors.borderSolid,
									opacity: pressed ? 0.85 : 1,
								},
							]}
						>
							<View style={{ flex: 1 }}>
								<AppText
									variant="bodyMedium"
									weight={locationId === location.id ? "semiBold" : "regular"}
									numberOfLines={1}
									style={{
										color:
											locationId === location.id
												? colors.secondaryForeground
												: colors.foreground,
									}}
								>
									{location.name}
								</AppText>
								{location.address ? (
									<AppText
										variant="bodySmall"
										numberOfLines={1}
										style={{ color: colors.mutedForeground }}
									>
										{location.address}
									</AppText>
								) : null}
							</View>
							{locationId === location.id ? (
								<Check size={18} color={colors.secondaryForeground} />
							) : null}
						</Pressable>
					))}
				</BottomSheetModal>
			) : null}
		</View>
	);
}

/**
 * Compact loading / error / empty state for a field fed by a query. Without
 * it, a failed `useCategories()` renders an empty chip row under a required
 * label: the owner is blocked with no cause and no retry.
 */
function FieldLoadState({
	state,
	message,
	onRetry,
}: {
	state: "loading" | "error" | "empty";
	message: string;
	onRetry?: () => void;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.fieldState}>
			{state === "loading" ? (
				<ActivityIndicator size="small" color={colors.mutedForeground} />
			) : null}
			<AppText
				variant="bodySmall"
				style={{
					flex: 1,
					color:
						state === "error" ? colors.destructive : colors.mutedForeground,
				}}
			>
				{message}
			</AppText>
			{onRetry ? (
				<Pressable
					cssInterop={false}
					onPress={onRetry}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={strings.common.retry}
				>
					<AppText
						variant="bodySmall"
						weight="semiBold"
						style={{ color: colors.primary }}
					>
						{strings.common.retry}
					</AppText>
				</Pressable>
			) : null}
		</View>
	);
}

function FormSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.section}>
			<AppText variant="h4" weight="bold">
				{title}
			</AppText>
			<View
				style={[
					styles.sectionCard,
					{ backgroundColor: colors.card, borderColor: colors.borderSolid },
				]}
			>
				{children}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	content: {
		marginTop: spacing.lg,
		gap: spacing.lg,
	},
	section: {
		gap: spacing.sm,
	},
	sectionCard: {
		borderRadius: radii.lg,
		borderWidth: 1,
		padding: spacing.lg,
		gap: spacing.md,
	},
	imageArea: {
		width: "100%",
		height: 160,
		borderRadius: radii.lg,
		borderWidth: 1,
		borderStyle: "dashed",
		overflow: "hidden",
	},
	imagePreview: {
		width: "100%",
		height: "100%",
	},
	imagePlaceholder: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
	},
	fieldBlock: {
		gap: 6,
	},
	fieldState: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	optionsWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	chip: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
		borderRadius: radii.pill,
		borderWidth: 1,
	},
	selectRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: radii.md,
		borderWidth: 1,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		minHeight: 46,
	},
	priceRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.md,
	},
	discountBadge: {
		alignSelf: "auto",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.xs + 2,
		borderRadius: radii.pill,
	},
	locationOption: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		borderRadius: radii.lg,
		borderWidth: 1,
	},
});
