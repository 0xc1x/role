import type { BusinessMemberDeliveryCardDto } from "@0xc1x/role-commons";

import { DeliveryCardSheet } from "./DeliveryCardSheet";

/**
 * La tarjeta que aparece después de rotar el PIN.
 *
 * ─── POR QUÉ ES LA MISMA TARJETA DE ENTREGA ───────────────────────────────────
 *
 * Porque la tarjeta de entrega no es «la del alta»: es LA tarjeta del
 * acceso —alias, PIN, QR, el aviso de que el PIN no se recupera y los botones
 * de copiar y compartir—. El PIN rotado se entrega con las mismas manos que
 * el del alta, y una versión propia de esa tarjeta —con su propio aviso o sus
 * propios botones— terminaría divergiendo de la otra sin que nadie lo note:
 * el día que el aviso cambie, cambiarán las dos o no cambiará ninguna.
 *
 * ─── Y POR QUÉ NO HAY UN SEGUNDO BOTÓN DE «COPIAR» ───────────────────────────
 *
 * Porque el PIN nuevo se copia y se comparte igual que el del alta: es el
 * mismo dato con la misma forma de entregárselo a quien entra.
 */
export function RotatePinSheet({
	card,
	onClose,
}: {
	/** La respuesta de la rotación: el alias, el PIN nuevo y los avisos. */
	card: BusinessMemberDeliveryCardDto;
	/** Cierra la hoja: quien la monta decide a dónde lleva. */
	onClose: () => void;
}) {
	return <DeliveryCardSheet card={card} onClose={onClose} />;
}
