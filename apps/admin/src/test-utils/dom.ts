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

export const { render, screen, fireEvent, waitFor, cleanup, renderHook } =
	await import("@testing-library/react");
// jest-dom solo registra matchers globales (sus .d.ts no son un módulo).
// @ts-expect-error: importación solo por efectos laterales
await import("@testing-library/jest-dom");
