import type { MapStyleElement } from "react-native-maps";

import type { ThemeScheme } from "./colors";

/**
 * Shared Google Maps styling: hides Google's own POI pins and business
 * labels and moves the basemap away from the default look, while keeping
 * our own Markers fully visible.
 *
 * Consumed on native via react-native-maps `customMapStyle` (Google
 * renderer) — pick the variant via `getMapStyle(scheme)`. On web
 * (@vis.gl/react-google-maps) the same JSON shape maps 1:1 to
 * `google.maps.MapTypeStyle[]`, but it can only be applied when the
 * map has NO `mapId` — Google ignores the `styles` option on maps with a
 * map ID (cloud styling takes over), and `AdvancedMarker` requires one.
 * So web keeps its `mapId` (our price-pill markers depend on it) and
 * relies on `clickableIcons={false}` plus cloud map styles configured in
 * the Google Cloud Console for full POI removal (see next steps).
 *
 * Theme exception: the Maps style schema requires literal hex strings, so
 * this module holds the single copy. Every value below is taken from the
 * matching palette in `colors.ts` (same intentional-exception rationale as
 * `Logo.tsx`); components must still use tokens, never these literals.
 * The dark variant re-tints the same entries from the dark palette so
 * roads and water stay readable in both themes.
 *
 * Palette refs (light): surfaceMuted #F2EFF7, infoSurface #F0FDFA,
 * chart3 #B1CDB6.
 * Palette refs (dark): surfaceMuted #2E2A38, accent #311743,
 * chart4 #2D4142.
 */
export const MAP_STYLE_NO_POI: MapStyleElement[] = [
	// Google POI labels (businesses, attractions, parks) — off everywhere.
	{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
	// Business POI footprints — off so only our markers compete visually.
	{ featureType: "poi.business", stylers: [{ visibility: "off" }] },
	// Transit labels and station pins — off; transit lines stay for context.
	{ featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
	{ featureType: "transit.station", stylers: [{ visibility: "off" }] },
	// Road shields/icons — off; road names stay for orientation.
	{ featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
	// Built blocks in soft lavender-gray instead of default gray.
	{
		featureType: "landscape.man_made",
		elementType: "geometry",
		stylers: [{ color: "#F2EFF7" }],
	},
	// Parks and natural land in muted sage instead of default green.
	{
		featureType: "landscape.natural",
		elementType: "geometry",
		stylers: [{ color: "#B1CDB6" }],
	},
	{
		featureType: "poi.park",
		elementType: "geometry",
		stylers: [{ color: "#B1CDB6" }],
	},
	// Water in pale teal — readable, distinct from built blocks.
	{
		featureType: "water",
		elementType: "geometry",
		stylers: [{ color: "#F0FDFA" }],
	},
];

/**
 * Dark twin of {@link MAP_STYLE_NO_POI}: identical POI/transit/road-icon
 * hiding, re-tinted from the dark palette so the basemap sits on dark
 * surfaces instead of glowing light.
 */
export const MAP_STYLE_NO_POI_DARK: MapStyleElement[] = [
	// Google POI labels (businesses, attractions, parks) — off everywhere.
	{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
	// Business POI footprints — off so only our markers compete visually.
	{ featureType: "poi.business", stylers: [{ visibility: "off" }] },
	// Transit labels and station pins — off; transit lines stay for context.
	{ featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
	{ featureType: "transit.station", stylers: [{ visibility: "off" }] },
	// Road shields/icons — off; road names stay for orientation.
	{ featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
	// Built blocks in dark lavender-gray instead of default gray.
	{
		featureType: "landscape.man_made",
		elementType: "geometry",
		stylers: [{ color: "#2E2A38" }],
	},
	// Parks and natural land in muted dark purple instead of default green.
	{
		featureType: "landscape.natural",
		elementType: "geometry",
		stylers: [{ color: "#311743" }],
	},
	{
		featureType: "poi.park",
		elementType: "geometry",
		stylers: [{ color: "#311743" }],
	},
	// Water in dark slate-teal — readable against dark blocks.
	{
		featureType: "water",
		elementType: "geometry",
		stylers: [{ color: "#2D4142" }],
	},
];

/** Returns the POI-free basemap style for the given theme scheme. */
export function getMapStyle(scheme: ThemeScheme): MapStyleElement[] {
	return scheme === "dark" ? MAP_STYLE_NO_POI_DARK : MAP_STYLE_NO_POI;
}
