/**
 * Taxonomía declarada de motivos de moderación de reseñas.
 *
 * POR QUÉ EXISTE Y POR QUÉ NO ES SOLO UN CAMPO DE TEXTO
 *
 * La plataforma se reserva el derecho de retirar contenido que no cumple sus
 * políticas, y esa reserva solo es real si el motivo está declarado. Con una
 * caja de texto libre los motivos terminan siendo "no me gustó", "malo" o "x":
 * nada de eso se puede responder a un negocio que apela, y nadie puede decir si
 * dos retiros fueron la misma decisión. El token es el registro de apelación —
 * la respuesta a "bajo qué política se retiró esto" — y el texto libre es el
 * contexto alrededor.
 *
 * POR QUÉ LOS TOKENS NO CAMBIAN Y LAS ETIQUETAS SÍ
 *
 * `moderation_reason` es una columna `text` validada acá, NO un enum de Postgres
 * ni un CHECK con la lista de valores: el archivo de migración entra al ledger
 * una sola vez, y un enum convertiría cada motivo nuevo en una migración más un
 * cambio de tipo de columna. Agregar un motivo es agregar una línea a este
 * archivo. Por eso el token es un identificador estable en inglés y la etiqueta
 * es copy de panel en español: corregir cómo se nombra un motivo no debe
 * invalidar las reseñas ya moderadas con el token viejo.
 *
 * El conjunto está pensado para el caso de uso real de la moderación: la
 * plataforma retira la reseña, no la cuenta, así que los motivos son sobre el
 * CONTENIDO. `other` existe para lo que no está previsto — y es el único que
 * no se explica solo, por eso exige el detalle libre.
 */
export const REVIEW_MODERATION_REASONS = [
	"off_topic_or_automated",
	"insults_or_hate_speech",
	"identity_discrimination",
	"threats_or_intimidation",
	"third_party_personal_data",
	"unsolicited_promotion",
	"sexual_content_or_violence",
	"fake_or_unverified_purchase",
	"other",
] as const;

export type ReviewModerationReason = (typeof REVIEW_MODERATION_REASONS)[number];

/**
 * Etiqueta en español de cada motivo. Es la que ve la persona: en el selector del
 * diálogo de ocultamiento y en la columna de la bandeja. El `Record` sobre el
 * tipo del token hace que agregar un motivo al array sin su etiqueta sea un error
 * de compilación, no una opción en blanco en el selector.
 */
export const REVIEW_MODERATION_REASON_LABELS: Record<
	ReviewModerationReason,
	string
> = {
	off_topic_or_automated: "Contenido no relacionado o automatizado",
	insults_or_hate_speech: "Insultos, acoso o lenguaje de odio",
	identity_discrimination: "Discriminación por identidad",
	threats_or_intimidation: "Amenazas o intimidación",
	third_party_personal_data: "Datos personales o de contacto de terceros",
	unsolicited_promotion: "Referencia comercial o promoción no solicitada",
	sexual_content_or_violence: "Contenido sexual o violencia",
	fake_or_unverified_purchase:
		"Reseña falsa o que no corresponde a una reserva real",
	other: "Otro motivo",
};

/**
 * El único motivo que no se explica solo.
 *
 * Se exporta como constante y no se escribe el literal `"other"` en la validación
 * condicional: es el valor que tres superficies tienen que coincidir (commons, el
 * `check` de la migración y el panel) y un literal repetido es una forma de que
 * dejen de coincidir sin que nada falle.
 */
export const REVIEW_MODERATION_REASON_NEEDS_DETAIL = "other";
