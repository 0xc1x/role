import { useEffect, useRef, useState } from "react";
import {
	Dimensions,
	View,
	StyleSheet,
	Animated,
	Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Portal } from "@rn-primitives/portal";
import Reanimated, {
	useSharedValue,
	useAnimatedStyle,
	withTiming,
	withDelay,
	Easing,
} from "react-native-reanimated";

import { useAuthStore } from "@/features/auth/store";
import { useSavedAddresses, useSetDefaultAddress } from "@/features/profile/hooks";
import { AddAddressSheet } from "@/features/profile/components/AddAddressSheet";
import { router } from "expo-router";
import type { SavedAddressDto } from "@0xc1x/role-commons";
import { strings } from "@/core/i18n/strings";
import { useTheme } from "@/core/theme";
import { AppText } from "@/core/ui";
import { spacing, radii } from "@/core/theme/spacing";

export function LocationSelector() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const status = useAuthStore((s) => s.status);
	const userId = profile?.id ?? "";
	const { data: addresses, isLoading, isError } = useSavedAddresses(userId);
	const setDefault = useSetDefaultAddress(userId);

	const [isOpen, setIsOpen] = useState(false);
	const [showAddAddress, setShowAddAddress] = useState(false);
	const [menuOrigin, setMenuOrigin] = useState<{ x: number; y: number } | null>(
		null,
	);
	const [chevronRotation] = useState(new Animated.Value(0));
	const triggerRef = useRef<View>(null);

	const toggleDropdown = () => {
		const next = !isOpen;
		Animated.timing(chevronRotation, {
			toValue: next ? 1 : 0,
			duration: 250,
			useNativeDriver: true,
		}).start();
		if (next) {
			triggerRef.current?.measureInWindow((x, y, width, height) => {
				const panelWidth = 300;
				const panelHeight = 380;
				const window = Dimensions.get("window");
				const panelX = Math.max(
					8,
					Math.min(x, window.width - panelWidth - 8),
				);
				const panelY = Math.max(
					8,
					Math.min(y + height + 6, window.height - panelHeight - 8),
				);
				setMenuOrigin({ x: panelX, y: panelY });
				setIsOpen(true);
			});
		} else {
			setMenuOrigin(null);
			setIsOpen(false);
		}
	};

	const closeDropdown = () => {
		setMenuOrigin(null);
		setIsOpen(false);
		Animated.timing(chevronRotation, {
			toValue: 0,
			duration: 250,
			useNativeDriver: true,
		}).start();
	};

	const selectedAddress = addresses?.find((a) => a.is_default);
	const displayLabel =
		selectedAddress?.label ?? strings.home.changeLocation;

	const handleAddressSelect = (id: string) => {
		closeDropdown();
		if (id !== selectedAddress?.id) setDefault.mutate(id);
	};

	const handleAddAddress = () => {
		closeDropdown();
		if (status !== "authenticated") {
			router.replace("/login");
			return;
		}
		setShowAddAddress(true);
	};

	return (
		<View style={styles.wrapper}>
			<Pressable ref={triggerRef} onPress={toggleDropdown} style={styles.trigger}>
				<Ionicons name="location-outline" size={16} color={colors.primary} />
				<AppText
					weight="bold"
					numberOfLines={1}
					style={{ color: colors.foreground, fontSize: 14 }}
				>
					{displayLabel}
				</AppText>
				<Animated.View
					style={{
						marginLeft: 2,
						transform: [
							{
								rotate: chevronRotation.interpolate({
									inputRange: [0, 1],
									outputRange: ["0deg", "180deg"],
								}),
							},
						],
					}}
				>
					<Ionicons name="chevron-down" size={16} color={colors.foreground} />
				</Animated.View>
			</Pressable>

			{isOpen && menuOrigin ? (
				<Portal name="location-selector-overlay">
					<Pressable
						onPress={closeDropdown}
						style={StyleSheet.absoluteFill}
					/>
					<DropdownPanel
						origin={menuOrigin}
						addresses={addresses}
						isLoading={isLoading}
						isError={isError}
						selectedAddress={selectedAddress}
						onAddressSelect={handleAddressSelect}
						onAddAddress={handleAddAddress}
						colors={colors}
					/>
				</Portal>
			) : null}

			{showAddAddress ? (
				<AddAddressSheet
					userId={userId}
					onClose={() => setShowAddAddress(false)}
				/>
			) : null}
		</View>
	);
}

function DropdownPanel({
	origin,
	addresses,
	isLoading,
	isError,
	selectedAddress,
	onAddressSelect,
	onAddAddress,
	colors,
}: {
	origin: { x: number; y: number };
	addresses?: SavedAddressDto[];
	isLoading: boolean;
	isError: boolean;
	selectedAddress?: SavedAddressDto;
	onAddressSelect: (id: string) => void;
	onAddAddress: () => void;
	colors: ReturnType<typeof useTheme>["colors"];
}) {
	const opacity = useSharedValue(0);
	const translateY = useSharedValue(-6);
	const scale = useSharedValue(0.96);

	useEffect(() => {
		opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
		translateY.value = withTiming(0, {
			duration: 220,
			easing: Easing.out(Easing.cubic),
		});
		scale.value = withTiming(1, {
			duration: 220,
			easing: Easing.out(Easing.cubic),
		});
	}, [opacity, translateY, scale]);

	const panelStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [
			{ translateY: translateY.value },
			{ scale: scale.value },
		],
	}));

	return (
		<Reanimated.View
			style={[
				styles.dropdown,
				panelStyle,
				{
					left: origin.x,
					top: origin.y,
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
				},
			]}
		>
			{isLoading ? (
				<View style={styles.loadingBox}>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground }}
					>
						{strings.common.loading}
					</AppText>
				</View>
			) : isError ? (
				<View style={styles.loadingBox}>
					<AppText
						variant="bodySmall"
						style={{ color: colors.destructive }}
					>
						{strings.common.error}
					</AppText>
				</View>
			) : (addresses?.length ?? 0) === 0 ? (
				<View style={styles.loadingBox}>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground }}
					>
						{strings.addresses.empty}
					</AppText>
				</View>
			) : (
				addresses?.map((address, index) => {
					const isSelected = address.id === selectedAddress?.id;
					return (
						<AddressItem
							key={address.id}
							index={index}
							address={address}
							isSelected={isSelected}
							onPress={() => onAddressSelect(address.id)}
							colors={colors}
						/>
					);
				})
			)}
			<View
				style={[
					styles.divider,
					{ backgroundColor: colors.borderSolid },
				]}
			/>
			<Pressable onPress={onAddAddress} style={styles.addAddressButton}>
				<AppText weight="semiBold" style={{ color: colors.primary }}>
					+ {strings.addresses.add}
				</AppText>
			</Pressable>
		</Reanimated.View>
	);
}

function AddressItem({
	index,
	address,
	isSelected,
	onPress,
	colors,
}: {
	index: number;
	address: SavedAddressDto;
	isSelected: boolean;
	onPress: () => void;
	colors: ReturnType<typeof useTheme>["colors"];
}) {
	const opacity = useSharedValue(0);
	const translateX = useSharedValue(-8);

	useEffect(() => {
		opacity.value = withDelay(
			40 * index,
			withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }),
		);
		translateX.value = withDelay(
			40 * index,
			withTiming(0, {
				duration: 240,
				easing: Easing.out(Easing.cubic),
			}),
		);
	}, [index, opacity, translateX]);

	const itemStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [{ translateX: translateX.value }],
	}));

	return (
		<Reanimated.View style={itemStyle}>
			<Pressable
				onPress={onPress}
				style={[
					styles.addressItem,
					isSelected && {
						backgroundColor: colors.destructiveVibrant + "0D",
					},
				]}
			>
				<View
					style={[
						styles.addressIcon,
						{ backgroundColor: colors.secondary + "1A" },
					]}
				>
					<Ionicons
						name="location-outline"
						size={16}
						color={colors.primary}
					/>
				</View>
				<View style={styles.addressInfo}>
					<AppText
						weight={isSelected ? "semiBold" : "regular"}
						style={{
							color: isSelected
								? colors.primary
								: colors.foreground,
						}}
					>
						{address.label}
					</AppText>
					<AppText
						variant="bodySmall"
						numberOfLines={1}
						style={{ color: colors.mutedForeground }}
					>
						{address.address}
					</AppText>
				</View>
				{isSelected && (
					<View
						style={[
							styles.selectedDot,
							{ backgroundColor: colors.primary },
						]}
					/>
				)}
			</Pressable>
		</Reanimated.View>
	);
}

const styles = StyleSheet.create({
	wrapper: {
		zIndex: 100,
		maxWidth: "70%",
	},
	trigger: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		paddingVertical: spacing.xs,
		paddingHorizontal: spacing.sm,
	},
	dropdown: {
		position: "absolute",
		minWidth: 240,
		maxWidth: 300,
		borderRadius: radii.xl,
		borderWidth: 1,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 20,
		elevation: 8,
	},
	loadingBox: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.lg,
		alignItems: "center",
		justifyContent: "center",
	},
	addressItem: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
	},
	addressIcon: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	addressInfo: {
		flex: 1,
	},
	selectedDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
		marginTop: 4,
	},
	divider: {
		height: 1,
	},
	addAddressButton: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
	},
});
