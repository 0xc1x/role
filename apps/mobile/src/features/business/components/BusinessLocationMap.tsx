import { radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

export function BusinessLocationMap({
	latitude,
	longitude,
}: {
	latitude: number;
	longitude: number;
	onPress?: () => void;
}) {
	const { colors } = useTheme();

	return (
		<iframe
			title="Mapa de la ubicación"
			// Embed estático de Google Maps (solo lectura): sin allow-top-navigation
			// ni allow-same-origin, el mapa no puede acceder a cookies/DOM del origen padre.
			sandbox="allow-scripts allow-popups"
			src={`https://maps.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`}
			style={{
				width: "100%",
				height: 180,
				border: `1px solid ${colors.borderSolid}`,
				borderRadius: radii.lg,
			}}
		/>
	);
}
