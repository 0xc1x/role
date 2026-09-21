import { useEffect, useRef, useState } from "react";
import {
	Platform,
	View,
	StyleSheet,
	Animated,
	Easing,
	Pressable,
	useWindowDimensions,
} from "react-native";
import { ChevronDown, MapPin } from "lucide-react-native";
import { Portal } from "@rn-primitives/portal";

import { useAuthStore } from "@/src/features/auth/store";
import { useSavedAddresses, useSetDefaultAddress } from "@/src/features/profile/hooks";
import { AddAddressSheet } from "@/src/features/profile/components/AddAddressSheet";
import { router } from "expo-router";
import type { SavedAddressDto } from "@0xc1x/role-commons";
import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
import { AppText } from "@/src/core/ui";
import { Button } from "@/components/ui/button";
import { spacing, radii } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";

export function LocationSelector() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const status = useAuthStore((s) => s.status);
	const userId = profile?.id ?? "";
	const { data: addresses, isLoading, isError, refetch } = useSavedAddresses(userId);
	const setDefault = useSetDefaultAddress(userId);

	const [isOpen, setIsOpen] = useState(false);
	const [showAddAddress, setShowAddAddress] = useState(false);
	const [menuOrigin, setMenuOrigin] = useState<{ x: number; y: number } | null>(
		null,
	);
	const [chevronRotation] = useState(() => new Animated.Value(0));
	const { width: windowWidth, height: windowHeight } = useWindowDimensions();
	const triggerRef = useRef<View>(null);
	const openIntentRef = useRef(false);

	const toggleDropdown = () => {
		const next = !isOpen;
		openIntentRef.current = next;
		Animated.timing(chevronRotation, {
			toValue: next ? 1 : 0,
			duration: 250,
			useNativeDriver: Platform.OS !== "web",
		}).start();
		if (next) {
			// Web: measureInWindow puede no resolverse (ref compuesta) o
			// devolver ceros; el timer abre el menú en una posición segura.
			const fallback = setTimeout(() => {
				if (!openIntentRef.current) return;
				setMenuOrigin((o) => o ?? { x: 8, y: 64 });
				setIsOpen(true);
			}, 350);
			try {
				triggerRef.current?.measureInWindow((x, y, width, height) => {
					clearTimeout(fallback);
					if (!openIntentRef.current) return;
					const measured = width > 0 && height > 0;
					const anchorX = measured ? x : 8;
					const anchorY = measured ? y + height + 6 : 64;
					const panelWidth = 300;
					const panelHeight = 380;
					const panelX = Math.max(
						8,
						Math.min(anchorX, windowWidth - panelWidth - 8),
					);
					const panelY = Math.max(
						8,
						Math.min(anchorY, windowHeight - panelHeight - 8),
					);
					setMenuOrigin({ x: panelX, y: panelY });
					setIsOpen(true);
				});
			} catch {
				// El timer de fallback abre el menú.
			}
		} else {
			setMenuOrigin(null);
			setIsOpen(false);
		}
	};

	const closeDropdown = () => {
		openIntentRef.current = false;
		setMenuOrigin(null);
		setIsOpen(false);
		Animated.timing(chevronRotation, {
			toValue: 0,
			duration: 250,
			useNativeDriver: Platform.OS !== "web",
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
				<MapPin size={16} color={colors.primary} />
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
					<ChevronDown size={16} color={colors.foreground} />
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
						onRetry={() => void refetch()}
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
	onRetry,
	selectedAddress,
	onAddressSelect,
	onAddAddress,
	colors,
}: {
	origin: { x: number; y: number };
	addresses?: SavedAddressDto[];
	isLoading: boolean;
	isError: boolean;
	onRetry: () => void;
	selectedAddress?: SavedAddressDto;
	onAddressSelect: (id: string) => void;
	onAddAddress: () => void;
	colors: ReturnType<typeof useTheme>["colors"];
}) {
	// Entrada con Animated clásico (JS-driven, sin native driver): la
	// visibilidad del panel no depende del UI-runtime de Reanimated/
	// worklets, que solo corre en nativo (en web hay fallback JS y por eso
	// ahí sí abría). Misma curva/duración que antes, mismo mecanismo que
	// el Drawer de `components/ui/drawer.tsx`.
	const [opacity] = useState(() => new Animated.Value(0));
	const [translateY] = useState(() => new Animated.Value(-6));
	const [scale] = useState(() => new Animated.Value(0.96));

	useEffect(() => {
		const anim = Animated.parallel([
			Animated.timing(opacity, {
				toValue: 1,
				duration: 220,
				easing: Easing.out(Easing.quad),
				useNativeDriver: false,
			}),
			Animated.timing(translateY, {
				toValue: 0,
				duration: 220,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: false,
			}),
			Animated.timing(scale, {
				toValue: 1,
				duration: 220,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: false,
			}),
		]);
		anim.start();
		return () => anim.stop();
	}, [opacity, translateY, scale]);

	return (
		<Animated.View
			style={[
				styles.dropdown,
				{
					opacity,
					transform: [{ translateY }, { scale }],
					left: origin.x,
					top: origin.y,
					boxShadow: `0px 4px 20px ${colors.shadow}`,
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
					<Button variant="link" onPress={onRetry}>
						{strings.common.retry}
					</Button>
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
			<Button variant="link" onPress={onAddAddress} style={styles.addAddressButton}>
				{`+ ${strings.addresses.add}`}
			</Button>
		</Animated.View>
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
	const [opacity] = useState(() => new Animated.Value(0));
	const [translateX] = useState(() => new Animated.Value(-8));

	useEffect(() => {
		const anim = Animated.parallel([
			Animated.timing(opacity, {
				toValue: 1,
				duration: 240,
				easing: Easing.out(Easing.quad),
				useNativeDriver: false,
				delay: 40 * index,
			}),
			Animated.timing(translateX, {
				toValue: 0,
				duration: 240,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: false,
				delay: 40 * index,
			}),
		]);
		anim.start();
		return () => anim.stop();
	}, [index, opacity, translateX]);

	return (
		<Animated.View style={{ opacity, transform: [{ translateX }] }}>
			<Pressable
				onPress={onPress}
				style={[
					styles.addressItem,
					isSelected && {
						backgroundColor: withAlpha(colors.destructiveVibrant, 0.051),
					},
				]}
			>
				<View
					style={[
						styles.addressIcon,
						{ backgroundColor: withAlpha(colors.secondary, 0.102) },
					]}
				>
					<MapPin
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
		</Animated.View>
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
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
	},
	addressInfo: {
		flex: 1,
	},
	selectedDot: {
		width: 8,
		height: 8,
		borderRadius: radii.sm,
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
