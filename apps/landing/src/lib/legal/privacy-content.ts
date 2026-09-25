/**
 * Legal copy lives here, not in the route file.
 *
 * A route module that exports a component may only export components, or React
 * Fast Refresh has to full-reload the page instead of preserving state, which
 * shows up as a visible flash while editing the legal pages. Keeping the copy
 * as plain data in lib/ also lets the legal-copy spec import it without
 * pulling in the router, the navbar and the footer.
 *
 * {controllerIdentity} and {contactEmail} are placeholders on purpose. The
 * operator's legal identity and privacy mailbox are not published yet, and
 * inventing a value here would publish a fabricated controller under LOPDP.
 */
export interface LegalSection {
	title: string;
	body: string;
}

export const PRIVACY_SECTIONS: LegalSection[] = [
	{
		title: "Responsable del tratamiento",
		body: "{controllerIdentity} es responsable del tratamiento de tus datos personales a través de la app móvil y la web. Contacto de privacidad: {contactEmail}.",
	},
	{
		title: "Normativa aplicable",
		body: "Tratamos tus datos conforme a la Ley Orgánica de Protección de Datos Personales (LOPDP, RO Suplemento 459 de 26 de mayo de 2021), su Reglamento y la Constitución del Ecuador (Art. 66.19). Esta política se interpreta bajo ley ecuatoriana.",
	},
	{
		title: "Datos que recopilamos",
		body: "Automáticos: IP anonimizada, tipo de navegador/SO, páginas vistas, duración, fecha/hora y referer. Voluntarios: nombre, correo, teléfono, ubicación aproximada, preferencias, datos de reserva (oferta, comercio, horario de recogida) y mensajes de contacto. No solicitamos datos sensibles salvo que tú los aportes.",
	},
	{
		title: "Finalidades",
		body: "Proveer y mantener el servicio; procesar reservas y coordinar recogidas; mostrarte ofertas cercanas; enviarte notificaciones transaccionales; mejorar la experiencia y obtener estadísticas agregadas; cumplir obligaciones legales y prevenir fraude.",
	},
	{
		title: "Base legal",
		body: "Ejecución del contrato (reserva), consentimiento (marketing/cookies no esenciales), interés legítimo (mejora y seguridad) y cumplimiento legal. Puedes retirar el consentimiento en cualquier momento sin afectar tratamientos previos.",
	},
	{
		title: "Conservación",
		body: "Navegación y logs: hasta 12 meses. Datos de cuenta y reservas: mientras mantengas la cuenta y 24 meses tras la baja, salvo obligación legal mayor. Contacto: hasta revocar consentimiento.",
	},
	{
		title: "Destinatarios y transferencias",
		body: "Compartimos lo mínimo necesario con: comercios (para tu reserva), y encargados técnicos: Supabase (base de datos), Vercel (hosting), Sentry (observabilidad), Firebase/Google (push y mapas). Algunos servidores están en EE. UU./UE; aplicamos cláusulas tipo u otras garantías adecuadas y DPAs vigentes.",
	},
	{
		title: "Tus derechos",
		body: "Acceso, rectificación, supresión, oposición, portabilidad, limitación y a no ser objeto de decisiones automatizadas. Ejerce escribiendo a {contactEmail} con cédula, derecho solicitado y medio de respuesta. Respondemos en máximo 15 días (Art. 26 Reglamento LOPDP); puedes reclamar ante la SPDP si no estás conforme.",
	},
	{
		title: "Seguridad",
		body: "Usamos HTTPS, controles de acceso y políticas de datos para proteger la cuenta y las reservas. También podemos mejorar medidas técnicas y de seguridad conforme cambia el servicio.",
	},
	{
		title: "Cookies",
		body: "El sitio usa almacenamiento local para recordar tu elección del aviso de privacidad. Puedes aceptar o rechazar; las fuentes de Google se cargan solo después de aceptar. No hay un panel de configuración por categorías en esta versión.",
	},
	{
		title: "Cambios y contacto",
		body: "Podemos actualizar esta política; publicaremos la nueva versión aquí con fecha de vigencia. Contacto: {contactEmail}. Jurisdicción: tribunales de Quito, Ecuador.",
	},
];
