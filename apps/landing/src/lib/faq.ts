export interface FaqItem {
	q: string;
	a: string;
}

/**
 * Ciudades de lanzamiento. Espejo editorial de `app_config['contact.cities']`:
 * el formulario de contacto lee la lista de la plataforma; este copy es
 * estático y lo actualiza el mismo cambio que abre una ciudad nueva.
 */
export const LAUNCH_CITIES = ["Quito", "Guayaquil", "Cuenca", "Manta"];

const PLACES = LAUNCH_CITIES.join(", ");

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
		a: `El lanzamiento se activa por ciudad. Empezamos en ${PLACES} y abrimos en más ciudades poco a poco.`,
	},
	{
		q: "¿Cómo empiezo?",
		a: "Si eres un local, entra a Rolé y pide acceso, o déjanos tus datos y armamos un piloto de unas cuantas semanas.",
	},
];
