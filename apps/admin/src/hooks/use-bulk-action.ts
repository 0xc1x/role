import * as React from "react";
import { type BulkOutcome, runBulkAction } from "@/lib/bulk-action";

/**
 * Corrida de acción en lote con las dos garantías que una mutación normal de
 * React Query no da: un POOL ACOTADO de peticiones (`runBulkAction`) y aborto
 * al desmontar.
 *
 * Abortar al desmontar no es cosmético: sin él, el `setState` del recibo llega a
 * un componente que ya no existe y el operador ve un "se actualizaron 8" en una
 * pantalla en la que ya no está. `run` devuelve `null` cuando su resultado ya no
 * tiene destino, para que el call site no tenga que distinguirlo.
 */
export function useBulkAction() {
	const [isPending, setIsPending] = React.useState(false);
	const controllerRef = React.useRef<AbortController | null>(null);
	const mountedRef = React.useRef(true);

	React.useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			controllerRef.current?.abort();
		};
	}, []);

	const run = React.useCallback(
		async <TItem>(
			items: readonly TItem[],
			worker: (item: TItem) => Promise<unknown>,
		): Promise<BulkOutcome<TItem> | null> => {
			// Una segunda corrida antes de que termine la primera deja huérfana a
			// la anterior: solo puede ganar una.
			controllerRef.current?.abort();
			const controller = new AbortController();
			controllerRef.current = controller;
			setIsPending(true);
			try {
				const outcome = await runBulkAction(items, worker, {
					signal: controller.signal,
				});
				return controller.signal.aborted ? null : outcome;
			} finally {
				if (controllerRef.current === controller) {
					controllerRef.current = null;
					if (mountedRef.current) setIsPending(false);
				}
			}
		},
		[],
	);

	return { run, isPending };
}
