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
}