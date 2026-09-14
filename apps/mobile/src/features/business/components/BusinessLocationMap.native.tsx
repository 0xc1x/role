import { Pressable, StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import { getMapStyle } from "@/core/theme/map-style";

export function BusinessLocationMap({
	latitude,
	longitude,
	onPress,
}: {
	latitude: number;
	longitude: number;
	onPress?: () => void;
}) {
	const { scheme } = useTheme();
	return (
		<View style={styles.mapWrap}>
			<MapView
				style={styles.map}
				initialRegion={{
					latitude,
					longitude,
					latitudeDelta: 0.01,
					longitudeDelta: 0.01,
				}}
				zoomEnabled
				scrollEnabled
				onPress={onPress}
				customMapStyle={getMapStyle(scheme)}
			>
				<Marker coordinate={{ latitude, longitude }} />
			</MapView>
			{onPress ? (
				<Pressable style={StyleSheet.absoluteFill} onPress={onPress} />
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	mapWrap: {
		borderRadius: radii.lg,
		overflow: "hidden",
	},
	map: {
		width: "100%",
		height: 180,
	},
});
