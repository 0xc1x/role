import {
	BadgeDollarSign,
	BellRing,
	ChartArea,
	DollarSign,
	Glasses,
	Info,
	LayoutList,
	type LucideIcon,
	Mail,
	Megaphone,
	Projector,
	Settings2,
	ToggleLeft,
} from "lucide-react";

interface NavSubItem {
	title: string;
	url: string;
}

interface NavMainItem {
	title: string;
	url: string;
	icon: LucideIcon;
	items?: NavSubItem[];
}

interface NavProject {
	name: string;
	url: string;
	icon: LucideIcon;
}

export const navMain: NavMainItem[] = [
	{
		title: "Admin",
		icon: ChartArea,
		url: "/home",
	},
	{
		title: "Categorias",
		url: "/categorias",
		icon: LayoutList,
	},
	{
		title: "Slides",
		url: "/slides",
		icon: Projector,
	},
	{
		title: "Consejos",
		url: "#",
		icon: Info,
	},
	{
		title: "Notificaciones",
		url: "#",
		icon: BellRing,
		items: [
			{
				title: "Push",
				url: "#",
			},
			{
				title: "Whatsapp",
				url: "#",
			},
			{
				title: "Mail",
				url: "#",
			},
		],
	},
	{
		title: "Correos",
		url: "/emails",
		icon: Mail,
		items: [
			{
				title: "Plantillas",
				url: "/emails?tab=plantillas",
			},
			{
				title: "Gestión de correos",
				url: "/emails",
			},
		],
	},
	{
		title: "Soporte",
		url: "#",
		icon: Glasses,
	},
	{
		title: "Configuración",
		url: "/configuracion",
		icon: Settings2,
	},
];

export const projects: NavProject[] = [
	{
		name: "Feature Flags",
		url: "#",
		icon: ToggleLeft,
	},
	{
		name: "Campañas de Marketing",
		url: "/emails?tab=campanas",
		icon: Megaphone,
	},
	{
		name: "Anuncios",
		url: "#",
		icon: BadgeDollarSign,
	},
	{
		name: "Comisiones",
		url: "#",
		icon: DollarSign,
	},
];
