/**
 * Iconos SVG custom para Rolé.
 * Stroke 1.5 consistente, caps redondos — diseñados para diferenciarse
 * de los sets genéricos (Lucide/Feather) y dar personalidad de marca.
 * Todos heredan `currentColor`.
 */

type IconProps = React.SVGProps<SVGSVGElement>;

const base = {
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.5,
	strokeLinecap: "round" as const,
	strokeLinejoin: "round" as const,
	"aria-hidden": true,
	focusable: false,
};

/** Brote / trigo — reducir desperdicio */
export function SproutIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M12 21V11" />
			<path d="M12 11c0-2.8 2.2-5 5-5 0 2.8-2.2 5-5 5Z" />
			<path d="M12 14c0-2.8-2.2-5-5-5 0 2.8 2.2 5 5 5Z" />
			<path d="M7 21h10" />
		</svg>
	);
}

/** Etiqueta de precio — ahorro */
export function TagIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M3.5 10.5 10 4h7a3 3 0 0 1 3 3v7l-6.5 6.5a2 2 0 0 1-2.8 0L3.5 13.3a2 2 0 0 1 0-2.8Z" />
			<circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" />
		</svg>
	);
}

/** Hoja — impacto positivo */
export function LeafIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M5 19c0-7 5-12 14-12 0 9-5 14-12 14" />
			<path d="M5 19c2-5 5-8 9-10" />
		</svg>
	);
}

/** Reloj-check — fácil y rápido */
export function ClockCheckIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7v5l3.5 2" />
			<path d="m14.5 14.5 1.8 1.8 3-3" />
		</svg>
	);
}

/** Bolsa takeaway — hero */
export function BagIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M6 8h12l-1 12H7L6 8Z" />
			<path d="M9 8a3 3 0 0 1 6 0" />
			<path d="M10 13v3M14 13v3" />
		</svg>
	);
}

/** Marca de verificación círculo */
export function CheckCircleIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<circle cx="12" cy="12" r="9" />
			<path d="m8.5 12 2.5 2.5 4.5-5" />
		</svg>
	);
}

/** Tienda — para comercios */
export function StoreIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M3 9h18l-2-4H5L3 9z" />
			<path d="M5 9v11h14V9" />
			<path d="M9 20v-6h6v6" />
		</svg>
	);
}

/** Comunidad — usuarios */
export function UsersIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
			<circle cx="9" cy="7" r="3.5" />
			<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
			<path d="M16 3.13a4 4 0 0 1 0 7.75" />
		</svg>
	);
}

/** Gráfica de crecimiento — impacto/stats */
export function ChartIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M3 3v18h18" />
			<path d="M7 14l3.5-3.5L14 14l5-6" />
		</svg>
	);
}

/** Corazón — misión/valores */
export function HeartIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M12 20.5S5 15.5 5 10.5A4.5 4.5 0 0 1 12 7.5a4.5 4.5 0 0 1 7 3c0 5-7 10-7 10z" />
		</svg>
	);
}

/** Escudo — confianza/seguridad */
export function ShieldIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
			<path d="m9 12 2 2 4-4" />
		</svg>
	);
}

/** Ubicación — descubrir */
export function MapPinIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z" />
			<circle cx="12" cy="11" r="2.5" />
		</svg>
	);
}

/** Chispa — calidad */
export function SparkIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path
				d="M12 2C12 6.5 9.5 9 5 9c4.5 0 7 2.5 7 7 0-4.5 2.5-7 7-7-4.5 0-7-2.5-7-7z"
				fill="currentColor"
				stroke="none"
			/>
		</svg>
	);
}

/** Tarjeta — pago */
export function CardIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<rect x="2" y="5" width="20" height="14" rx="2" />
			<path d="M2 10h20" />
			<path d="M6 15h4" />
		</svg>
	);
}

/** Flecha derecha */
export function ArrowRightIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M5 12h14M13 6l6 6-6 6" />
		</svg>
	);
}

/** Flecha abajo */
export function ArrowDownIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M12 5v14M6 13l6 6 6-6" />
		</svg>
	);
}

/** Correo */
export function MailIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<rect x="3" y="5" width="18" height="14" rx="2" />
			<path d="m3 7 9 6 9-6" />
		</svg>
	);
}

/** Teléfono */
export function PhoneIcon(props: IconProps) {
	return (
		<svg {...base} {...props}>
			<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
		</svg>
	);
}
