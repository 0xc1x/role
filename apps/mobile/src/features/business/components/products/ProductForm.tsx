import { useState } from "react";
import { Image, Platform, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	BottomSheetModal,
	Button,
	goBackOr,
	TextField,
} from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { useCategories } from "@/features/hooks";
import { useBusinessLocations, useSaveOffer } from "@/features/business/hooks";
import type { OfferDetail } from "@/features/offers/domain/offer";
import { DateTimeField } from "./DateTimeFields";

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
	const { data: categories } = useCategories();
	const { data: locations } = useBusinessLocations(businessId);
	const save = useSaveOffer(businessId);

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
		product?.categories.map((c) => c.id) ?? [],
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
	const [stock, setStock] = useState(product ? String(product.offer.stock) : "");
	const [pickupStart, setPickupStart] = useState<Date>(
		product ? new Date(product.offer.pickup_start) : defaultPickup(true),
	);
	const [pickupEnd, setPickupEnd] = useState<Date>(
		product ? new Date(product.offer.pickup_end) : defaultPickup(false),
	);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [locationPickerOpen, setLocationPickerOpen] = useState(false);

	const toggleCategory = (id: string) =>
		setCategoryIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);

	const setStart = (next: Date) => {
		setPickupStart(next);
		if (pickupEnd.getTime() <= next.getTime()) setPickupEnd(next);
	};
	const setEnd = (next: Date) => {
		if (next.getTime() < pickupStart.getTime()) setPickupStart(next);
		setPickupEnd(next);
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

	const selectedLocationName = locations?.find((l) => l.id === locationId)?.name;

	const handleSubmit = () => {
		const nextErrors: Record<string, string> = {};
		if (!title.trim()) nextErrors.title = strings.business.requiredField;
		if (categoryIds.length === 0)
			nextErrors.categories = strings.business.selectAtLeastOneCategory;
		if (!description.trim()) nextErrors.description = strings.business.requiredField;
		if (!(original > 0)) nextErrors.originalPrice = strings.business.invalidPrice;
		if (!(discounted > 0)) nextErrors.discountedPrice = strings.business.invalidPrice;
		else if (original > 0 && discounted >= original)
			nextErrors.discountedPrice = strings.business.priceMustBeLower;
		const stockNumber = Number(stock);
		if (!Number.isInteger(stockNumber) || stockNumber < 1)
			nextErrors.stock = strings.business.minStock;
		if (!(pickupEnd.getTime() > pickupStart.getTime()))
			nextErrors.pickup = strings.business.invalidPickupWindow;
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
				onError: (e) =>
					setErrors({
						form: e instanceof Error ? e.message : "Error al guardar",
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
				onPress={() => void pickImage()}
				accessibilityRole="button"
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
						<Ionicons name="image-outline" size={28} color={colors.mutedForeground} />
						<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
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
					<AppText variant="labelSmall" weight="semiBold" style={{ color: colors.mutedForeground }}>
						{strings.business.productCategories}
					</AppText>
					<View style={styles.optionsWrap}>
						{(categories ?? []).map((category) => {
							const selected = categoryIds.includes(category.id);
							return (
								<Pressable
									key={category.id}
									onPress={() => toggleCategory(category.id)}
									style={({ pressed }) => [
										styles.chip,
										{
											backgroundColor: selected
												? colors.secondary
												: colors.inputBackground,
											borderColor: selected ? colors.secondary : colors.border,
											opacity: pressed ? 0.85 : 1,
										},
									]}
								>
									<AppText
										variant="bodySmall"
										weight={selected ? "semiBold" : "medium"}
										style={{
											color: selected ? colors.secondaryForeground : colors.foreground,
										}}
									>
										{category.emoji ? `${category.emoji} ${category.name}` : category.name}
									</AppText>
								</Pressable>
							);
						})}
					</View>
					{errors.categories ? (
						<AppText variant="bodySmall" style={{ color: colors.destructive, marginTop: 4 }}>
							{errors.categories}
						</AppText>
					) : null}
				</View>

				<View style={styles.fieldBlock}>
					<AppText variant="labelSmall" weight="semiBold" style={{ color: colors.mutedForeground }}>
						{strings.business.locations}
					</AppText>
					<Pressable
						onPress={() => setLocationPickerOpen(true)}
						accessibilityRole="button"
						style={({ pressed }) => [
							styles.selectRow,
							{
								backgroundColor: colors.inputBackground,
								borderColor: colors.border,
								opacity: pressed ? 0.85 : 1,
							},
						]}
					>
						<Ionicons name="storefront-outline" size={16} color={colors.foreground} />
						<AppText variant="bodyMedium" style={{ flex: 1 }}>
							{selectedLocationName ?? strings.business.noLocationOption}
						</AppText>
						<Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
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
							setOriginalPrice(t.replace(/[^0-9.]/g, "").replace(/(\..*?)\./g, "$1"))
						}
						keyboardType="decimal-pad"
						containerStyle={{ flex: 1 }}
						error={errors.originalPrice ?? null}
					/>
					<TextField
						label={strings.business.productDiscountedPrice}
						value={discountedPrice}
						onChangeText={(t) =>
							setDiscountedPrice(t.replace(/[^0-9.]/g, "").replace(/(\..*?)\./g, "$1"))
						}
						keyboardType="decimal-pad"
						containerStyle={{ flex: 1 }}
						error={errors.discountedPrice ?? null}
					/>
				</View>
				{discountPercent != null ? (
					<View style={[styles.discountBadge, { backgroundColor: colors.surfaceSuccess }]}>
						<AppText variant="bodySmall" weight="bold" style={{ color: colors.success }}>
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
				label={editing ? strings.business.saveChanges : strings.business.publishProduct}
				onPress={handleSubmit}
				loading={save.isPending}
				fullWidth
				size="lg"
				style={{ marginTop: spacing.lg }}
			/>

			{locationPickerOpen ? (
				<BottomSheetModal
					title={strings.business.locations}
					onClose={() => setLocationPickerOpen(false)}
				>
					<Pressable
						onPress={() => {
							setLocationId("");
							setLocationPickerOpen(false);
						}}
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
									locationId === "" ? colors.secondaryForeground : colors.foreground,
							}}
						>
							{strings.business.noLocationOption}
						</AppText>
						{locationId === "" ? (
							<Ionicons name="checkmark" size={18} color={colors.secondaryForeground} />
						) : null}
					</Pressable>
					{(locations ?? []).map((location) => (
						<Pressable
							key={location.id}
							onPress={() => {
								setLocationId(location.id);
								setLocationPickerOpen(false);
							}}
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
								<Ionicons name="checkmark" size={18} color={colors.secondaryForeground} />
							) : null}
						</Pressable>
					))}
				</BottomSheetModal>
			) : null}
		</View>
	);
}

function defaultPickup(isStart: boolean): Date {
	const date = new Date();
	date.setHours(isStart ? 18 : 20, 0, 0, 0);
	return date;
}

// ponytail: expo-image-picker en web abre el diálogo con un click sintético
// sin user activation → nunca abre y el await queda colgado. Input nativo
// con click() síncrono dentro del handler; migrar de vuelta si upstream lo
// arregla.
export function pickWebImage(): Promise<string | null> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*";
		let done = false;
		const finish = (value: string | null) => {
			if (done) return;
			done = true;
			resolve(value);
			input.remove();
		};
		input.onchange = () =>
			finish(input.files?.[0] ? URL.createObjectURL(input.files[0]) : null);
		input.oncancel = () => finish(null);
		document.body.appendChild(input);
		input.click();
	});
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
			<View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderSolid }]}>
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
		borderRadius: 18,
		borderWidth: 1,
		paddingHorizontal: 16,
		paddingVertical: 12,
		minHeight: 46,
	},
	priceRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.md,
	},
	discountBadge: {
		alignSelf: "flex-start",
		paddingHorizontal: spacing.md,
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