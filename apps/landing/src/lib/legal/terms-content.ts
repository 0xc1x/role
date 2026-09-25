import type { LegalSection } from "./privacy-content";

/**
 * Terms copy lives here rather than in the route module, for the same reason
 * as the privacy copy: a route file that exports a component may only export
 * components, or Fast Refresh cannot preserve state while editing.
 *
 * {controllerIdentity} and {contactEmail} are placeholders because the
 * operator's legal identity is not published yet.
 */
export const TERMS_SECTIONS: LegalSection[] = [
	{
		title: "Aceptación y objeto",
		body: "Estos Términos regulan el uso de Rolé (app y web) por {controllerIdentity}. Al crear cuenta o usar el servicio aceptas estos términos. Si no estás de acuerdo, no uses la plataforma.",
	},
	{
		title: "El servicio e intermediación",
		body: "Rolé es una plataforma tecnológica que intermedia entre comercios con excedente y usuarios. No produce, comercializa ni transporta alimentos; no es empleador de comercios o repartidores. Las ofertas son publicadas por los comercios y su contenido puede variar.",
	},
	{
		title: "Registro y cuenta",
		body: "El registro es gratuito y requiere datos veraces. Eres responsable de tu contraseña y de la actividad en tu cuenta. Cuenta personal, única e intransferible. Podemos suspender cuentas con datos falsos o uso indebido.",
	},
	{
		title: "Reservas, pagos y recogida",
		body: "La reserva en la app confirma tu lugar; el pago se realiza directamente en el comercio al recoger (pickup-only). No cobramos en la app en esta fase. Acude en el horario indicado con tu código de reserva.",
	},
	{
		title: "Cancelaciones y no show",
		body: "Puedes cancelar sin costo antes del cierre de la ventana de recogida. Las reservas no recogidas se liberan y afectan tu historial; no hay reembolso si ya pagaste en el comercio (aplica criterio del comercio).",
	},
	{
		title: "Obligaciones del usuario",
		body: "Usar la plataforma de forma diligente, respetar horarios, no revender, no crear cuentas duplicadas y no interferir con el servicio. El incumplimiento puede implicar suspensión.",
	},
	{
		title: "Obligaciones del comercio y exoneración",
		body: "El comercio responde por la calidad, seguridad, legalidad y etiquetado de sus productos. Rolé, como intermediario tecnológico, no asume responsabilidad por falta de disponibilidad, calidad o efectos del consumo, sin perjuicio de mediar ante reclamos.",
	},
	{
		title: "Propiedad intelectual y uso",
		body: "Textos, marcas, logos y diseño son de Rolé o licenciados. No puedes copiar, extraer o usar el contenido sin autorización. El uso indebido habilita baja y acciones legales.",
	},
	{
		title: "Cambios, ley y contacto",
		body: "Podemos actualizar estos términos y notificar cambios relevantes en la app/web. Se rigen por leyes de la República del Ecuador, jurisdicción tribunales de Quito. Contacto legal: {contactEmail}.",
	},
];
