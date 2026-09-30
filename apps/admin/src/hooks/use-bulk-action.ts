import * as React from "react";
import { type BulkOutcome, runBulkAction } from "@/lib/bulk-action";

/**
 * Bulk action run with the two guarantees a plain React Query mutation does not
 * give: a BOUNDED request pool (`runBulkAction`) and abort on unmount.
 *
 * Aborting on unmount is not cosmetic: without it the receipt's state update
 * lands on a component that no longer exists and the operator sees "updated 8"
 * on a screen they already left. `run` returns `null` once its result has no
 * destination, so call sites do not have to tell that apart.
 */
export function useBulkAction() {
	/**
	 * The in-flight flag carries its OWN owner: the `AbortController` of the run
	 * that raised it. That makes two things fall out for free.
	 *
	 * A second run supersedes the first BY CONSTRUCTION, and the `finally` below
	 * can clear the flag unconditionally — the updater ignores the call when a
	 * newer owner already took over.
	 *
	 * The previous shape kept the owner in a separate ref and compared it before
	 * clearing. Two sources of truth for one fact meant the flag could read
	 * "in flight" with an empty ref, and it buried the reset behind two `if`s,
	 * which reads exactly like a reset that only runs on the success path.
	 */
	const [pendingOwner, setPendingOwner] =
		React.useState<AbortController | null>(null);
	// The controller to abort, whether the run settled or not. Kept apart from
	// the flag because it must survive the run to be abortable on unmount.
	const controllerRef = React.useRef<AbortController | null>(null);

	React.useEffect(() => {
		return () => {
			// Abort the run in flight. Its `finally` still fires, but its
			// `setPendingOwner` has no destination left: React drops it silently,
			// which is exactly the outcome wanted here.
			controllerRef.current?.abort();
		};
	}, []);

	const run = React.useCallback(
		async <TItem>(
			items: readonly TItem[],
			worker: (item: TItem) => Promise<unknown>,
		): Promise<BulkOutcome<TItem> | null> => {
			// A second run before the first one finishes orphans the first: only
			// one of them can win.
			controllerRef.current?.abort();
			const controller = new AbortController();
			controllerRef.current = controller;
			setPendingOwner(controller);
			try {
				const outcome = await runBulkAction(items, worker, {
					signal: controller.signal,
				});
				return controller.signal.aborted ? null : outcome;
			} finally {
				if (controllerRef.current === controller) {
					controllerRef.current = null;
				}
				// Unconditional: the only case where the flag must survive is a
				// newer run having taken over, and the updater encodes that.
				setPendingOwner((current) => (current === controller ? null : current));
			}
		},
		[],
	);

	return { run, isPending: pendingOwner !== null };
}
