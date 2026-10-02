export interface OperatorIdentityInput {
	readonly companyName: string;
	readonly ruc: string;
	readonly address: string;
	readonly controllerIdentity: string;
}

/**
 * Identidad legal del operador para las pantallas legales.
 * Con `ruc === ""` (RUC no publicado) se muestra la identidad genérica
 * pendiente y nunca se emite el fragmento "RUC " vacío.
 */
export function buildControllerIdentity(input: OperatorIdentityInput): string {
	if (input.ruc) {
		return `${input.companyName}, RUC ${input.ruc}, ${input.address}`;
	}
	return input.controllerIdentity;
}
