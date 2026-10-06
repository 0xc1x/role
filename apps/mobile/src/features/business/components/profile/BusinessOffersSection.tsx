import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { Package } from "lucide-react-native";

import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
import { OfferRowSection } from "@/src/features/offers/components/OfferRowSection";

/**
 * Las ofertas del negocio, al pie de su perfil.
 *
 * VA DEBAJO DE LAS RESEÑAS y no arriba a propósito. Quien abre el perfil de una
 * panadería viene por dos cosas, en este orden: primero "¿qué tiene hoy?" y
 * después, si le interesa, "qué más ofrece". Con las reseñas arriba y
 * contraídas, el slider queda a la vista sin desplegar nada para llegar a él.
 *
 * EL "VER TODAS" LO RESUELVE LA FILA, no esta sección: se piden seis y se
 * enseñan cinco, y el link aparece solo si la sexta existe. Acá no se cuenta
 * nada porque ver los datos es trabajo de la fila; lo único que esta sección
 * decide es a dónde lleva el link.
 */
const VISIBLE = 5;
/** Una más que las que se muestran: existe para responder si hay un "ver todas". */
const FETCHED = VISIBLE + 1;

export function BusinessOffersSection({
	businessId,
	icon,
}: {
	businessId: string;
	icon?: ReactNode;
}) {
	const { colors } = useTheme();
	return (
		<OfferRowSection
			type="business"
			title={strings.businessProfile.offersTitle}
			icon={icon ?? <Package size={18} color={colors.primary} />}
			businessId={businessId}
			limit={FETCHED}
			maxVisible={VISIBLE}
			onSeeAll={() => router.push(`/all-offers?business=${businessId}` as Href)}
		/>
	);
}
