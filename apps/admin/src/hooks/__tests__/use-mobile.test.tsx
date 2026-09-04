import { describe, expect, test } from "bun:test";
import { renderHook, waitFor } from "@/test-utils/dom";
import { useIsMobile } from "../use-mobile";

function stubMatchMedia(width: number) {
	const listeners = new Set<() => void>();
	const mql = {
		matches: width < 768,
		addEventListener: (_: string, fn: () => void) => listeners.add(fn),
		removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
	};
	Object.defineProperty(window, "innerWidth", { value: width, writable: true });
	Object.defineProperty(window, "matchMedia", {
		value: () => mql,
		writable: true,
	});
	return { mql, listeners };
}

describe("useIsMobile", () => {
	test("true en angosto, false en ancho", async () => {
		stubMatchMedia(500);
		const { result, unmount } = renderHook(() => useIsMobile());
		await waitFor(() => expect(result.current).toBe(true));
		unmount();
		stubMatchMedia(1024);
		const r2 = renderHook(() => useIsMobile());
		await waitFor(() => expect(r2.result.current).toBe(false));
		r2.unmount();
	});
});
