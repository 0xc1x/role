import {
	BadgeDollarSign,
	BellRing,
	ChartArea,
	DollarSign,
	Info,
	LayoutList,
	type LucideIcon,
	Megaphone,
	MessageSquare,
	Projector,
	Receipt,
	Settings2,
	ShoppingBag,
	Store,
	Ticket,
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

export const navMain: NavMainItem[] = [
	{
		title: "Admin",
		icon: ChartArea,
		url: "/home",
	},
	{
		title: "Negocios",
		url: "/negocios",
		icon: Store,
	},
	{
		title: "Órdenes",
		url: "/ordenes",
		icon: Receipt,
	},
	{
		title: "Ofertas",
		url: "/ofertas",
		icon: ShoppingBag,
	},
	{
		title: "Categorias",
		url: "/categorias",
		icon: LayoutList,
	},
	{
		title: "Cupones",
		url: "/cupones",
		icon: Ticket,
	},
	{
		title: "Slides",
		url: "/slides",
		icon: Projector,
	},
	{
		title: "Consejos",
		url: "/consejos",
		icon: Info,
	},
	{
		title: "Pagos",
		url: "/pagos",
		icon: DollarSign,
	},
	{
		title: "Comisiones",
		url: "/comisiones",
		icon: BadgeDollarSign,
	},
	{
		// Bandeja de los mensajes del formulario público. Va después de
		// Comisiones porque es la superficie que más se parece a "leer lo que
		// nos escribieron": en un panel con seis módulos de datos, un ítem más
		// arriba se confunde con un módulo más.
		title: "Contactos",
		url: "/contactos",
		icon: MessageSquare,
	},
	{
		title: "Campañas de Marketing",
		url: "#",
		icon: Megaphone,
		items: [
			{
				title: "Mails",
				url: "/campanas/mails",
			},
			{
				title: "Push",
				url: "/campanas/push",
			},
			{
				title: "Segmentos",
				url: "/campanas/segmentos",
			},
		],
	},
	{
		title: "Notificaciones",
		url: "#",
		icon: BellRing,
		items: [
			{
				title: "Push",
				url: "/notificaciones/push",
			},
			{
				title: "Mail",
				url: "/notificaciones/mails",
			},
			// "Whatsapp" y "Soporte" se retiraron del menú: no existe ruta para
			// ellos y `NavMain` renderizaba un <Link to="#"> que no lleva a
			// ninguna parte. Vuelven cuando la ruta exista, no antes.
		],
	},
	{
		title: "Configuración",
		url: "/configuracion",
		icon: Settings2,
	},
];

export const payoutsNav = { title: "Pagos", url: "/pagos", icon: DollarSign };
