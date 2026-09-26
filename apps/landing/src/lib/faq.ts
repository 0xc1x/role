export interface FaqItem {
	q: string;
	a: string;
}

/**
 * Ciudades de lanzamiento. Espejo editorial de `app_config['contact.cities']`:
 * el formulario de contacto lee la lista de la plataforma; este copy es
 * estático y lo actualiza el mismo cambio que abre una ciudad nueva.
 */
/**
 * Ciudades de lanzamiento, en el mismo orden que `app_config.contact.cities`.
 * La primera es la principal y la que se abre primero. "Otra" no va acá: la
 * landing la agrega sola al form de contacto, para que se pueda escribir una
 * ciudad que Rolé todavía no tiene abierta.
 */
export const LAUNCH_CITIES = [
	"Santo Domingo",
	"Quito",
	"Guayaquil",
	"Cuenca",
	"Manta",
];

const PRIMARY_CITY = LAUNCH_CITIES[0];
const PLACES = LAUNCH_CITIES.slice(1).join(", ");

export const FAQ_ITEMS: FaqItem[] = [
	{
		q: "¿Qué es Rolé?",
		a: "Rolé es la app para rescatar excedente de comida: los comercios publican lo que les sobró del día y las personas lo reservan gratis y lo recogen pagando directo en el comercio.",
	},
	{
		q: "¿Cuánto cuesta?",
		a: "Rolé para quien rescata no tiene suscripción. Los locales eligen un plan y una comisión por bolsa. Te armamos una propuesta, no un precio genérico.",
	},
	{
		q: "¿Dónde operan?",
		a: `El lanzamiento se activa por ciudad. Empezamos en ${PRIMARY_CITY} y vamos abriendo ${PLACES} poco a poco.`,
	},
	{
		q: "¿Cómo empiezo?",
		a: "Si eres un local, entra a Rolé y pide acceso, o déjanos tus datos y armamos un piloto de unas cuantas semanas.",
	},
];
