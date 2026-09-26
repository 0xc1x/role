import { DAYS_SHORT_ES, MONTHS_SHORT_ES } from "@/src/core/i18n/dates";

const mxnWhole = new Intl.NumberFormat("es-MX", {
	style: "currency",
	currency: "MXN",
	minimumFractionDigits: 0,
	maximumFractionDigits: 0,
});
const mxnPrecise = new Intl.NumberFormat("es-MX", {
	style: "currency",
	currency: "MXN",
	minimumFractionDigits: 2,
});

export function formatMoney(value: number): string {
	return mxnWhole.format(value);
}

export function formatMoneyPrecise(value: number): string {
	return mxnPrecise.format(value);
}

export function formatPercent(value: number): string {
	return `${Math.round(value)}%`;
}

/** "12:30" from ISO string. */
export function formatTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** "hoy", "mañana", or "vie 12 jul". */
export function formatRelativeDay(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	const now = new Date();
	const startOfDay = (d: Date) =>
		new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
	if (diffDays === 0) return "hoy";
	if (diffDays === 1) return "mañana";
	if (diffDays === -1) return "ayer";
	return `${DAYS_SHORT_ES[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT_ES[date.getMonth()]}`;
}

/** "12 de julio, 14:30". */
export function formatDateTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	return `${date.getDate()} de ${MONTHS_SHORT_ES[date.getMonth()]}, ${formatTime(iso)}`;
}

/** "16 ago 2026". */
export function formatShortDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	return `${date.getDate()} ${MONTHS_SHORT_ES[date.getMonth()]} ${date.getFullYear()}`;
}

/** "hace 5 min". */
export function formatRelativeTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	const diffMs = Date.now() - date.getTime();
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return "ahora";
	if (minutes < 60) return `hace ${minutes} min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `hace ${hours} h`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `hace ${days} d`;
	return formatRelativeDay(iso);
}

export function formatCount(value: number): string {
	if (value >= 1000) return `${(value / 1000).toFixed(1).replace(".0", "")}k`;
	return String(value);
}

/** "450m" or "1.2km" (Flutter GeoUtils.formatDistance). */
export function formatDistanceKm(km: number): string {
	if (km < 1) return `${Math.round(km * 1000)}m`;
	return `${km.toFixed(1)}km`;
}
