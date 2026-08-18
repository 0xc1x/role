const MXN = { style: "currency", currency: "MXN" } as const;

export function formatMoney(value: number): string {
	return new Intl.NumberFormat("es-MX", {
		...MXN,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);
}

export function formatMoneyPrecise(value: number): string {
	return new Intl.NumberFormat("es-MX", {
		...MXN,
		minimumFractionDigits: 2,
	}).format(value);
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

const DAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS_SHORT = [
	"ene",
	"feb",
	"mar",
	"abr",
	"may",
	"jun",
	"jul",
	"ago",
	"sep",
	"oct",
	"nov",
	"dic",
];

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
	return `${DAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** "12 de julio, 14:30". */
export function formatDateTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	return `${date.getDate()} de ${MONTHS_SHORT[date.getMonth()]}, ${formatTime(iso)}`;
}

/** "16 ago 2026". */
export function formatShortDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
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
