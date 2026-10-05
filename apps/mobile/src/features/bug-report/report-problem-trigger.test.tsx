import { beforeEach, expect, mock, test } from "bun:test";
import { plugin } from "bun";
import * as realReact from "react";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

/**
 * El buzón se abre EN PLACE, en la pantalla que ofrece la fila, y no en una
 * ruta.
 *
 * POR QUÉ: el `Drawer` se portaliza a un host que tiene que estar montado por
 * ENCIMA de la pantalla actual, y los hosts (`TAB_SHEET`) viven adentro de los
 * layouts de tabs. `app/report-problem.tsx` era una ruta de raíz, que en el
 * `<Stack>` cuelga al lado de los grupos, así que la hoja se portalizaba a la
 * pantalla de tabs que ya estaba tapada: el usuario veía una página vacía con el
 * título del buzón y nunca la hoja. Montada acá, el host es el de la pantalla
 * visible.
 *
 * Lo que se afirma es que la fila ABRE LA HOJA y no navega: navegar seguiría
 * llevando a esa misma pantalla de raíz, que es el defecto que se está sacando.
 */

// These primitives ship JSX in .mjs; Metro handles that in the app and bun's
// transpiler cannot parse it. Same loader shim as `SegmentedTabs.test.tsx`.
plugin({
	name: "primitives-jsx",
	setup(build) {
		build.onLoad(
			{ filter: /@rn-primitives[+/][^/]+[+/]dist[+/].*\.mjs$/ },
			async ({ path }) => ({
				contents: await Bun.file(path).text(),
				loader: "jsx",
			}),
		);
	},
});

type Row = { html: string; onPress?: () => void };
const rows: Row[] = [];
const pushes: string[] = [];
let sheetMounted = false;
const sheetCloses: Array<() => void> = [];

// El gesto se identifica por lo que la fila PINTA, no por su posición en el
// array: reordenar el menú no puede romper el test ni, peor, hacerlo pasar
// probando la fila equivocada.
const ReactFragment = ({ children }: { children?: ReactNode }) =>
	createElement(nativeWeb.View, null, children);

// `useEffect` no corre y `useState` guarda en casillas que sobreviven entre
// renders: el gesto se dispara desde el test y el estado que produce se lee en
// el render siguiente. Es el mismo arnés que usaba el spec de la ruta que se
// borró, y es lo que hace que "presionar abre la hoja" sea comprobable sin un
// renderer de cliente.
const slots: unknown[] = [];
let hookCursor = 0;

function useStoredState(initial: unknown): [unknown, (next: unknown) => void] {
	const index = hookCursor;
	hookCursor += 1;
	if (!(index in slots)) slots[index] = initial;
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
	useEffect: () => {},
	useLayoutEffect: () => {},
	useState: useStoredState,
}));

mockNativeUi({
	Pressable: (props: { children?: ReactNode; onPress?: () => void }) => {
		rows.push({
			html: renderToStaticMarkup(
				createElement(ReactFragment, null, props.children),
			),
			onPress: props.onPress,
		});
		return createElement(nativeWeb.View, null, props.children);
	},
});

mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));
mock.module("expo-router", () => ({
	__esModule: true,
	router: { push: (path: string) => pushes.push(path) },
	useRouter: () => ({ push: (path: string) => pushes.push(path) }),
	// El `Link` es lo que hace que una fila sea navegación. Se lo apantalla para
	// poder distinguir una fila que navega de una que solo abre la hoja: la fila
	// del buzón tiene que salir sin él.
	Link: ({ children }: { children?: ReactNode }) =>
		createElement(ReactFragment, null, children),
	useLocalSearchParams: () => ({}),
	useGlobalSearchParams: () => ({}),
	useSegments: () => [],
	usePathname: () => "/",
	useNavigation: () => ({ navigate: () => {}, push: () => {} }),
	Redirect: () => null,
	Stack: ({ children }: { children?: ReactNode }) => children,
	Tabs: ({ children }: { children?: ReactNode }) => children,
}));
mock.module("@/components/ui/button", () => ({
	Button: (props: {
		children?: ReactNode;
		onPress?: () => void;
		style?: unknown;
	}) => {
		rows.push({
			html: renderToStaticMarkup(
				createElement(ReactFragment, null, props.children),
			),
			onPress: props.onPress,
		});
		return createElement(nativeWeb.View, null, props.children);
	},
}));
mock.module("@/src/features/auth/presentation/SignOutSection", () => ({
	SignOutSection: () => null,
}));
// El sheet real tiene su propio archivo de spec con su arnés. Acá se registra
// si el nodo está en el árbol y se guarda el `onClose` que recibió.
mock.module("@/src/features/bug-report/components/ReportProblemSheet", () => ({
	ReportProblemSheet: (props: { onClose?: () => void }) => {
		sheetMounted = true;
		sheetCloses.push(() => props.onClose?.());
		return createElement(nativeWeb.Text, null, "SHEET");
	},
}));

const { SettingsTab } = await import(
	"@/src/features/profile/components/ProfileSettingsTab"
);
const { SettingsSection } = await import(
	"@/src/features/business/components/management/SettingsSection"
);

/** La fila del buzón, identificada por el texto que muestra. */
function bugRow(): Row {
	const found = rows.find((row) => row.html.includes(strings.bugReport.title));
	if (!found) throw new Error("no hay fila de reportar un problema");
	if (!found.onPress) throw new Error("la fila del buzón no tiene gesto");
	return found;
}

function renderTab(): void {
	hookCursor = 0;
	rows.length = 0;
	// `sheetMounted` se lee como "está en el árbol AHORA", así que cada render
	// arranca en falso: si el doble no lo limpiara, bastaría con que se montara
	// una vez para que "cerrar la hoja" pasara sin mirarlo.
	sheetMounted = false;
	renderToStaticMarkup(createElement(SettingsTab, null));
}

function renderBusiness(): void {
	hookCursor = 0;
	rows.length = 0;
	sheetMounted = false;
	renderToStaticMarkup(
		createElement(SettingsSection, { businessId: "business-1" }),
	);
}

/** Presionar la fila del buzón y volver a pintar. */
function pressBugRow(render: () => void): void {
	render();
	bugRow().onPress?.();
	render();
}

beforeEach(() => {
	slots.length = 0;
	rows.length = 0;
	pushes.length = 0;
	sheetCloses.length = 0;
	sheetMounted = false;
});

test("el perfil del consumidor abre la hoja sin navegar", () => {
	renderTab();
	expect(rows.some((row) => row.html.includes(strings.bugReport.title))).toBe(
		true,
	);
	expect(sheetMounted).toBe(false);

	pressBugRow(renderTab);
	expect(sheetMounted).toBe(true);
	// La navegación es el defecto: la fila tenía que abrir la hoja, no llevar a
	// una pantalla de raíz donde el Drawer no tiene host.
	expect(pushes).toEqual([]);
});

test("el panel del negocio abre la hoja sin navegar", () => {
	pressBugRow(renderBusiness);
	expect(sheetMounted).toBe(true);
	expect(pushes).toEqual([]);
});

test("las demás filas del menú siguen navegando", () => {
	renderTab();
	const addresses = rows.find((row) =>
		row.html.includes(strings.profile.savedAddresses),
	);
	expect(addresses).toBeDefined();
	// Una fila que navega no lleva gesto propio: lo pone el `Link` que la
	// envuelve. Si esto fallara porque hay `onPress`, la fila habría dejado de
	// ser un enlace y se perdería el abrir-en-pestaña.
	expect(addresses?.onPress).toBeUndefined();

	renderBusiness();
	const help = rows.find((row) =>
		row.html.includes(strings.business.helpCenter),
	);
	expect(help?.onPress).toBeDefined();
	help?.onPress?.();
	expect(pushes).toEqual(["/business/business-1/help"]);
});

test("cerrar la hoja la saca del árbol y reabrir arranca vacío", () => {
	pressBugRow(renderTab);
	expect(sheetMounted).toBe(true);

	// Montado y desmontado, no escondido con `visible={false}`: escondido, el
	// texto del reporte anterior seguiría en el estado del nodo y volvería a
	// abrir lleno.
	sheetCloses.at(-1)?.();
	renderTab();
	expect(sheetMounted).toBe(false);

	pressBugRow(renderTab);
	expect(sheetMounted).toBe(true);
	expect(pushes).toEqual([]);
});
