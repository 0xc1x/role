export interface ReverseGeocodeResult {
	displayName: string;
	zone: string | null;
}

/**
 * Reverse geocoding via OSM Nominatim (same provider as the Flutter v1).
 * Returns the display name (address) and the best zone name so the
 * location form can prefill its fields after the user moves the map.
 * Swallow errors on purpose — failing to geocode must never block the form.
 */
export async function reverseGeocode({
	latitude,
	longitude,
}: {
	latitude: number;
	longitude: number;
}): Promise<ReverseGeocodeResult> {
	try {
		const response = await fetch(
			`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=es`,
			{ headers: { "User-Agent": "RoleMobile/1.0" } },
		);
		if (!response.ok) return { displayName: "", zone: null };
		const data = (await response.json()) as {
			display_name?: string;
			address?: {
				neighbourhood?: string;
				quarter?: string;
				city_district?: string;
				suburb?: string;
				city?: string;
				town?: string;
				village?: string;
			};
		};
		const address = data.address ?? {};
		const zone =
			address.neighbourhood ??
			address.quarter ??
			address.city_district ??
			address.suburb ??
			address.city ??
			address.town ??
			address.village ??
			null;
		return { displayName: data.display_name ?? "", zone };
	} catch {
		return { displayName: "", zone: null };
	}
}