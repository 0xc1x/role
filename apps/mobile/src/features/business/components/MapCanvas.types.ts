import type { ReactNode } from "react";

export interface MapCanvasHandle {
	animateToRegion: (
		coords: { latitude: number; longitude: number },
		delta?: number,
	) => void;
}

export interface MapCanvasProps {
	coords: { latitude: number; longitude: number };
	fullscreen?: boolean;
	onRegionChange: (coords: { latitude: number; longitude: number }) => void;
	/** Extra markers/content rendered inside the map (e.g. offer pins). */
	children?: ReactNode;
	/** Center pin used by pickers; off when the map shows its own markers. */
	centerPin?: boolean;
}