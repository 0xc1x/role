export interface ReverseGeocodeResult {
	displayName: string;
	zone: string | null;
}

// ponytail: single-process cache + 1 req/s throttle so Nominatim's public
// API doesn't 429 us while dragging; swap to a paid geocoder if limits bite.
const cache = new Map<string, ReverseGeocodeResult>();
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

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
	const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
	const hit = cache.get(key);
	if (hit) return hit;

	// Serialize + throttle: max 1 network call per second across callers.
	const run = queue.then(async () => {
		const wait = Math.max(0, lastCall + 1000 - Date.now());
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		lastCall = Date.now();
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
			const result = { displayName: data.display_name ?? "", zone };
			if (result.displayName) cache.set(key, result);
			return result;
		} catch {
			return { displayName: "", zone: null };
		}
	});
	queue = run.catch(() => {});
	return run as Promise<ReverseGeocodeResult>;
}