import { Window } from "happy-dom";

// Entorno DOM mínimo para specs de componentes bajo bun:test.
// Importar este módulo (en vez de @testing-library/react directo) garantiza
// que los globales existan antes de que testing-library se ligue a ellos.
const happy = new Window({ url: "http://localhost/" });
const g = globalThis as Record<string, unknown>;
g.window ??= happy;
g.document ??= happy.document;
g.navigator ??= happy.navigator;
g.HTMLElement ??= happy.HTMLElement;
g.Element ??= happy.Element;
g.Node ??= happy.Node;
g.Event ??= happy.Event;
g.CustomEvent ??= happy.CustomEvent;
g.getComputedStyle ??= happy.getComputedStyle.bind(happy);
g.MutationObserver ??= happy.MutationObserver;
// `HTMLIFrameElement` en el global, no en el window: el `window` global lo puso
// `test-preload.ts` (es `globalThis`, para que los specs que leen `window.x`
// como el panel.findan el shim de storage). React lo lee del global en
// `getActiveElementDeep`, así que con el shim tal cual, montar sobre `document`
// —lo que necesita un componente que renderiza `<html>`— moría con
// `TypeError: Right hand side of instanceof is not an object`.
g.HTMLIFrameElement ??= happy.HTMLIFrameElement;
// Base UI usa requestAnimationFrame para transiciones (happy-dom no lo define).
if (typeof g.requestAnimationFrame !== "function") {
	g.requestAnimationFrame = ((cb: FrameRequestCallback) =>
		setTimeout(() => cb(Date.now()), 0)) as unknown;
	g.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as unknown;
}

export const { render, screen, fireEvent, waitFor, cleanup, renderHook, act } =
	await import("@testing-library/react");
// jest-dom solo registra matchers globales (sus .d.ts no son un módulo).
// @ts-expect-error: importación solo por efectos laterales
await import("@testing-library/jest-dom");
