import { beforeEach, expect, mock, test } from "bun:test";
import * as realReact from "react";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

import { light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

/**
 * La ruta del buzón son tres decisiones y ninguna estaba fijada por el spec del
 * sheet:
 *
 *  1. Un invitado no ve el formulario: lo mandan a `/login`. Es el mismo guard
 *     que `about.tsx`, y sin él el sheet abriría para fallar recién al enviar.
 *  2. El `fallback` de atrás depende del ROL. El default de `ScreenHeader` es
 *     la home del consumidor, así que un dueño de negocio que entra por la
 *     entrada de su panel y vuelve por el gesto de atrás aterriza en una
 *     pantalla que no es suya.
 *  3. El sheet se MONTA y se DESMONTA, no se esconde. Es lo que sostiene su
 *     docstring: reabrir con el texto del reporte anterior sin querer sería
 *     peor que reabrir vacío.
 *
 * El arnés es el del spec del sheet, y por el mismo motivo que ahí: esta
 * pantalla abre el sheet desde un `useEffect`, y `renderToStaticMarkup` no
 * corre efectos ni vuelve a pintar después de un `setState`. El `useEffect` va
 * sincronizado (el truco de `blank-screens.test.tsx`) y el `useState` guarda en
 * casillas que sobreviven entre renders, así que escribir → renderizar → leer
 * es el mismo ciclo que en la app.
 */
const slots: unknown[] = [];
let hookCursor = 0;

function useStoredState(initial: unknown): [unknown, (next: unknown) => void] {
	const index = hookCursor;
	hookCursor += 1;
	if (!(index in slots)) {
		slots[index] =
			typeof initial === "function" ? (initial as () => unknown)() : initial;
	}
	return [
		slots[index],
		(next: unknown) => {
			slots[index] =
				typeof next === "function"
					? (next as (prev: unknown) => unknown)(slots[index])
					: next;
		},
	];
}

mock.module("react", () => ({
	...realReact,
	useEffect: (effect: () => undefined | (() => void)) => {
		effect();
	},
	useState: useStoredState,
}));

const wrapper = ({ children }: { children?: ReactNode }) =>
	createElement(nativeWeb.View, null, children);
const empty = () => null;

let authStatus: "loading" | "authenticated" | "guest" = "authenticated";
let authRole: string | null = "consumer";
let authInitialized = true;
let replaced: string[] = [];
let goBacks: string[] = [];
/** Si el nodo del sheet está en el árbol en el render que se está mirando. */
let sheetMounted = false;
let sheetCloses: Array<() => void> = [];
let lastFallback: string | null = null;
let html = "";

mockNativeUi();

mock.module("expo-router", () => ({
	router: {
		replace: (path: string) => replaced.push(path),
		push: (path: string) => replaced.push(path),
		canGoBack: () => false,
	},
	useSegments: () => [],
	useNavigation: () => ({ getState: () => ({ index: 0 }) }),
}));
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));
mock.module("@/src/features/auth/store", () => ({
	useAuthStore: (selector?: (s: unknown) => unknown) => {
		const state = {
			status: authStatus,
			initialized: authInitialized,
			profile: authRole ? { id: "user-1", role: authRole } : null,
		};
		return selector ? selector(state) : state;
	},
}));
mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text,
	Screen: wrapper,
	// El `fallback` es una de las tres decisiones del archivo: se registra en
	// vez de renderizarse, porque dos `Href` distintos no se distinguen en el
	// HTML.
	ScreenHeader: (props: { title?: string; fallback?: string }) => {
		lastFallback = props.fallback ?? null;
		return createElement(nativeWeb.Text, null, props.title);
	},
	goBackOr: (fallback: string) => goBacks.push(fallback),
	TextField: empty,
	BottomSheetModal: empty,
}));
// El sheet real no entra: lo que se prueba acá es la RUTA, y el sheet tiene su
// propio archivo de spec con su arnés. Este doble registra si el nodo está en el
// árbol y guarda el `onClose` que la ruta le pasó.
mock.module("@/src/features/bug-report/components/ReportProblemSheet", () => ({
	ReportProblemSheet: (props: { onClose?: () => void }) => {
		sheetMounted = true;
		sheetCloses.push(() => props.onClose?.());
		return createElement(nativeWeb.Text, null, "SHEET");
	},
}));

// La ruta vive fuera de `src/`, así que el spec la alcanza por la raíz del
// paquete. `@/app/report-problem` también funciona, pero el alias lo resuelve
// el tsconfig y bun no lo aplica en `import()` dinámico sin la extensión.
const { default: ReportProblemScreen } = await import(
	"../../../app/report-problem"
);

/**
 * Un render del árbol.
 *
 * El `useEffect` que abre el sheet corre ADENTRO de este render, así que el
 * `setSheetVisible(true)` cae después de que la pantalla ya leyó el estado: el
 * árbol que sale de acá todavía no tiene el sheet. Por eso existe
 * `renderSettled`.
 */
function render(): string {
	hookCursor = 0;
	sheetMounted = false;
	html = renderToStaticMarkup(createElement(ReportProblemScreen));
	return html;
}

/** El árbol después de que el `useEffect` de apertura ya corrió. */
function renderSettled(): string {
	render();
	return render();
}

beforeEach(() => {
	slots.length = 0;
	replaced = [];
	goBacks = [];
	sheetCloses = [];
	sheetMounted = false;
	lastFallback = null;
	authStatus = "authenticated";
	authRole = "consumer";
	authInitialized = true;
});

test("un invitado va a /login y no ve el formulario", () => {
	authStatus = "guest";

	const html = render();

	expect(replaced).toEqual(["/login"]);
	expect(html).not.toContain(strings.bugReport.title);
	expect(sheetMounted).toBe(false);
});

test("antes de resolver la sesión no se decide nada", () => {
	// La splash raíz tiene un timeout de 6s: mandar al login por no saber
	// todavía sería cerrar afuera de la app a un usuario que sí tiene sesión.
	authStatus = "loading";
	authInitialized = false;

	const html = render();

	expect(replaced).toEqual([]);
	expect(html).toBe("");
	expect(sheetMounted).toBe(false);
});

test("el consumidor vuelve a su perfil y el dueño a su panel", () => {
	authRole = "consumer";
	render();
	expect(lastFallback).toBe("/(consumer)/profile");

	authRole = "business";
	render();
	// El default de `ScreenHeader` es la home del consumidor: sin esto, el dueño
	// del negocio que entró desde la entrada de su panel aterriza en una
	// pantalla que no es suya.
	expect(lastFallback).toBe("/(business)/management");

	authRole = "admin";
	render();
	expect(lastFallback).toBe("/(business)/management");
});

test("el sheet se abre apenas la sesión está resuelta", () => {
	// El primer render todavía no lo tiene: el `useEffect` que lo abre corre
	// después de que la pantalla leyó el estado, así que `setSheetVisible(true)`
	// cae tarde. El segundo render sí lo tiene.
	expect(render()).not.toContain("SHEET");

	const html = renderSettled();
	expect(html).toContain("SHEET");
	expect(sheetMounted).toBe(true);
	expect(html).toContain(strings.bugReport.title);
});

test("cerrar el sheet lo saca del árbol y devuelve por donde se entró", () => {
	authRole = "business";
	renderSettled();
	expect(sheetMounted).toBe(true);
	expect(goBacks).toEqual([]);

	// El `onClose` que la ruta le pasó: se llama y el nodo desaparece. Esto es
	// lo que distingue "se desmonta" de "se esconde con `visible={false}`":
	// escondido, el texto del reporte anterior seguiría en el estado del nodo
	// y volvería a abrir lleno.
	sheetCloses.at(-1)?.();
	expect(goBacks).toEqual(["/(business)/management"]);

	// Un solo render, y no el asientado: después del cierre la pantalla ya
	// navegó con `goBackOr` y en la app está desarmada. Lo que se afirma es el
	// árbol en el instante en que el usuario tocó cerrar, que es el que dice si
	// el nodo se sacó o se escondió. (El `useEffect` de apertura volvería a
	// ponerlo en el próximo render, pero ese render no ocurre: la ruta ya no
	// está en la pila.)
	render();
	expect(sheetMounted).toBe(false);
	expect(html).not.toContain("SHEET");
});
