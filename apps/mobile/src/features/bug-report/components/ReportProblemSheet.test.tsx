import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

import { light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { Errors } from "@/src/core/error/app-error";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

// El buzón de reportes de errores: la pantalla donde el usuario escribe, elige
// capturas y envía. Los contratos que fijan estos tests son todos sobre lo que
// el usuario PIERDE o no:
//
//  1. El resumen es obligatorio: sin él la fila se marca ilegible y el operador
//     no ve nada, así que el botón de envío no gasta un envío.
//  2. (Review Focus 1) Un fallo de imagen no puede llevarse el texto. Ni al
//     elegir la captura ni al subirla.
//  3. Un envío exitoso cierra, y un doble toque no manda dos.
//  4. Descartar el sheet no manda nada.
//
// Y uno más, el que evita que el picker se vuelva una segunda frontera: con los
// cinco lugares llenos no abre el diálogo.

type FieldProps = {
	label?: string;
	value?: string;
	hint?: string;
	onChangeText?: (text: string) => void;
};
type ButtonProps = {
	accessibilityLabel?: string;
	"aria-label"?: string;
	onPress?: () => void;
	loading?: boolean;
	disabled?: boolean;
	children?: ReactNode;
};
type SheetProps = {
	title?: string;
	onClose?: () => void;
	children?: ReactNode;
};

const TEXTO = "no me carga el checkout";
const DETALLE = "abro el carrito, elijo una oferta y queda cargando";

type ViewProps = {
	accessibilityRole?: string;
	accessibilityLiveRegion?: string;
	accessibilityLabel?: string;
	style?: unknown;
	children?: ReactNode;
};
type ThumbProps = {
	source?: { uri?: string };
	accessibilityLabel?: string;
};

let fields: FieldProps[] = [];
let buttons: ButtonProps[] = [];
let views: ViewProps[] = [];
let thumbnails: ThumbProps[] = [];
let sheetProps: SheetProps | null = null;
let html = "";
const closed: string[] = [];

/**
 * Los nodos con `accessibilityRole="alert"`. El `ErrorNote` se justifica con
 * ese rol y con `accessibilityLiveRegion`, así que el spec mira los dos: sin
 * ellos el texto se pinta y el lector de pantalla no lo anuncia.
 */
const alerts = (): ViewProps[] =>
	views.filter((v) => v.accessibilityRole === "alert");

const ProbeView = (props: ViewProps) => {
	views.push(props);
	return createElement(nativeWeb.View, null, props.children);
};

/**
 * Los botones de quitar de las miniaturas son `Pressable` de react-native, no
 * el `Button` de la app, así que caen en la misma lista `buttons` y se buscan
 * por su label con el índice ya resuelto.
 */
const ProbePressable = (props: ButtonProps) => {
	buttons.push(props);
	return createElement(nativeWeb.View, null, props.children);
};

mockNativeUi({
	Platform: { OS: "ios" },
	View: ProbeView,
	Pressable: ProbePressable,
});

const launchImageLibraryAsync = mock(
	async (
		_options?: unknown,
	): Promise<{ canceled: boolean; assets: unknown[] }> => ({
		canceled: true,
		assets: [],
	}),
);
mock.module("expo-image-picker", () => ({ launchImageLibraryAsync }));

const pickWebImage = mock(async (): Promise<string | null> => null);
mock.module("@/src/features/business/utils/pick-image", () => ({
	pickWebImage,
}));

// `expo-image` no se puede dejar real: su grafo nativo no parsea en bun. La
// sonda guarda lo que la pantalla le pasa, que es justo lo que hay que
// afirmar: que la URI de cada captura llega a la miniatura.
mock.module("expo-image", () => ({
	Image: (props: ThumbProps) => {
		thumbnails.push(props);
		return createElement(nativeWeb.Text, null, props.accessibilityLabel);
	},
}));

const readLocalImage = mock(async (_uri: string) => ({
	bytes: new ArrayBuffer(8),
	contentType: "image/png" as const,
}));
const submitBugReport = mock(async (_input: unknown) => {});
// Se mockea el módulo PROFUNDO y no el barril: el dominio real entra —los topes
// que la pantalla importa son los de `domain/bug-report`— y lo único que se
// sustituye es la frontera de datos, que es lo que estos tests observan.
mock.module("@/src/features/bug-report/data/repository", () => ({
	readLocalImage,
	submitBugReport,
}));

mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));
mock.module("@/src/core/ui", () => ({
	// El label y el value del campo se pintan para que el HTML exponga el texto
	// que el usuario escribió: es lo que permite afirmar que el texto SIGUE EN
	// PANTALLA y no solo que el envío falló.
	AppText: ({ children }: { children?: ReactNode }) =>
		createElement(nativeWeb.Text, null, children),
	TextField: (props: FieldProps) => {
		fields.push(props);
		return createElement(
			nativeWeb.Text,
			null,
			`${props.label ?? ""}: ${props.value ?? ""}`,
		);
	},
	BottomSheetModal: (props: SheetProps) => {
		sheetProps = props;
		return createElement(nativeWeb.View, null, props.children);
	},
}));
mock.module("@/components/ui/button", () => ({
	Button: (props: ButtonProps) => {
		buttons.push(props);
		return createElement(nativeWeb.Text, null, props.children);
	},
}));

// ── Un `useState` que REALMENTE guarda ──────────────────────────────────────
//
// `renderToStaticMarkup` es un render único: la fibra se descarta y un
// `setState` posterior no vuelve a pintar nada. Con el `useState` de React, los
// handlers de este test escribirían en el vacío y `handleSubmit` leería siempre
// el valor del primer render — o sea, el test no distinguiría una pantalla que
// conserva el texto de una que lo borra, que es justo lo que hay que probar.
//
// El reemplazo guarda los valores en casillas que sobreviven entre renders,
// así que el ciclo escribir → volver a renderizar → leer es el mismo que en la
// app. El índice de casilla se reinicia en cada render, igual que el orden de
// hooks.
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

const React = await import("react");
mock.module("react", () => ({ ...React, useState: useStoredState }));

const { MAX_REPORT_IMAGE_BYTES, MAX_REPORT_IMAGES } = await import(
	"@/src/features/bug-report"
);
const { ReportProblemSheet } = await import("./ReportProblemSheet");

// Drena la cadena de microtareas del `async` del handler. Un `setTimeout(0)`
// alcanza: todo lo que la pantalla encadena son promesas ya resueltas.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function render(visible = true): void {
	hookCursor = 0;
	fields = [];
	buttons = [];
	views = [];
	thumbnails = [];
	sheetProps = null;
	html = renderToStaticMarkup(
		createElement(ReportProblemSheet, {
			visible,
			onClose: () => closed.push("close"),
		}),
	);
}

const field = (label: string): FieldProps => {
	const found = fields.find((f) => f.label === label);
	if (!found) throw new Error(`campo no renderizado: ${label}`);
	return found;
};

const button = (label: string): ButtonProps => {
	const found = buttons.find(
		(b) => b.accessibilityLabel === label || b["aria-label"] === label,
	);
	if (!found) throw new Error(`botón no renderizado: ${label}`);
	return found;
};

/**
 * El botón de quitar de la miniatura N. Se busca por el número porque hay
 * varios idénticos en pantalla: el índice es lo que los distingue, y el spec
 * lo comprueba mirando el copy con `{n}` resuelto.
 */
const removeButton = (n: number): ButtonProps => {
	const label = strings.bugReport.removeImage.replace("{n}", String(n));
	const found = buttons.find((b) => b.accessibilityLabel === label);
	if (!found) throw new Error(`botón de quitar no renderizado: ${label}`);
	return found;
};

const typeSummary = (text: string): void => {
	field(strings.bugReport.summaryLabel).onChangeText?.(text);
	// Se vuelve a renderizar porque los handlers leen del estado del render en
	// el que se crean: sin esto el envío leería siempre el resumen vacío.
	render();
};

beforeEach(() => {
	html = "";
	closed.length = 0;
	slots.length = 0;
	submitBugReport.mockReset();
	submitBugReport.mockImplementation(async () => {});
	readLocalImage.mockReset();
	readLocalImage.mockImplementation(async () => ({
		bytes: new ArrayBuffer(8),
		contentType: "image/png" as const,
	}));
	launchImageLibraryAsync.mockReset();
	launchImageLibraryAsync.mockImplementation(async () => ({
		canceled: true,
		assets: [],
	}));
	pickWebImage.mockReset();
	pickWebImage.mockImplementation(async () => null);
});

test("no envía con el resumen vacío", async () => {
	render();

	button(strings.bugReport.submit).onPress?.();
	await flush();

	// Ni un llamado al repositorio: el resumen es el ancla del schema de
	// lectura del API y sin él la fila entra ilegible.
	expect(submitBugReport).toHaveBeenCalledTimes(0);

	render();
	expect(html).toContain(strings.bugReport.errorSummaryRequired);
	expect(html).toContain(strings.bugReport.submit);

	// Un resumen de puros espacios es un resumen vacío: `normalizeSummary`
	// recorta antes de decidir, y la pantalla tiene que decidir lo mismo o
	// gastaría el envío en una fila que la base marcaría ilegible.
	typeSummary("   ");
	button(strings.bugReport.submit).onPress?.();
	await flush();
	expect(submitBugReport).toHaveBeenCalledTimes(0);
});

test("el error de subida se muestra y el texto se conserva", async () => {
	render();
	typeSummary(TEXTO);
	field(strings.bugReport.descriptionLabel).onChangeText?.(DETALLE);
	render();

	// El caso del bucket que no existe en el entorno: el insert nunca llega y
	// el usuario queda con el formulario lleno y un motivo en pantalla.
	submitBugReport.mockImplementationOnce(async () => {
		throw new Error("bucket no existe");
	});
	button(strings.bugReport.submit).onPress?.();
	await flush();

	expect(submitBugReport).toHaveBeenCalledTimes(1);

	render();
	expect(html).toContain(strings.bugReport.errorSubmitFailed);
	expect(html).toContain(TEXTO);
	expect(html).toContain(DETALLE);
	expect(closed).toEqual([]);

	// Y el texto no quedó muerto en pantalla: el reintento manda lo mismo.
	button(strings.bugReport.submit).onPress?.();
	await flush();

	expect(submitBugReport).toHaveBeenCalledTimes(2);
	expect(submitBugReport.mock.calls.at(-1)?.[0]).toMatchObject({
		summary: TEXTO,
		description: DETALLE,
	});
	expect(closed).toEqual(["close"]);
});

test("una captura rechazada no se adjunta y el texto llega igual", async () => {
	render();
	typeSummary(TEXTO);

	// El picker declara el tamaño, así que la pantalla lo descarta antes de
	// leer los bytes: `readLocalImage` no llega a llamarse.
	launchImageLibraryAsync.mockImplementationOnce(async () => ({
		canceled: false,
		assets: [
			{ uri: "file:///Pesada.png", fileSize: MAX_REPORT_IMAGE_BYTES + 1 },
		],
	}));
	button(strings.bugReport.addImage).onPress?.();
	await flush();

	render();
	expect(html).toContain(strings.bugReport.errorImageTooLarge);
	expect(html).toContain(TEXTO);
	expect(readLocalImage).toHaveBeenCalledTimes(0);

	// El reporte se manda igual, sin la captura: perder una imagen es un costo
	// aceptable, perder el texto del usuario no.
	button(strings.bugReport.submit).onPress?.();
	await flush();

	expect(submitBugReport.mock.calls.at(-1)?.[0]).toMatchObject({
		summary: TEXTO,
		images: [],
	});
	expect(closed).toEqual(["close"]);
});

test("una captura ilegible no se adjunta y el motivo se ve", async () => {
	render();
	typeSummary(TEXTO);

	launchImageLibraryAsync.mockImplementationOnce(async () => ({
		canceled: false,
		assets: [{ uri: "file:///raro.bin" }],
	}));
	readLocalImage.mockImplementationOnce(async () => {
		throw new Error("bytes sin firma de imagen");
	});
	button(strings.bugReport.addImage).onPress?.();
	await flush();

	render();
	// El copy es el del dominio, no el del driver en inglés: lo arma
	// `localImageFromBytes` y el `fallback` solo cubre el error que no es un
	// `AppError`.
	expect(html).toContain(strings.bugReport.errorImageNotSupported);
	expect(html).toContain(TEXTO);
	expect(html).not.toContain("bytes sin firma");

	button(strings.bugReport.submit).onPress?.();
	await flush();
	expect(submitBugReport.mock.calls.at(-1)?.[0]).toMatchObject({ images: [] });
});

test("con los cinco lugares llenos el picker no abre", async () => {
	render();
	typeSummary(TEXTO);

	launchImageLibraryAsync.mockImplementation(async () => ({
		canceled: false,
		assets: [{ uri: "file:///captura.png" }],
	}));

	for (let i = 0; i < MAX_REPORT_IMAGES; i += 1) {
		button(strings.bugReport.addImage).onPress?.();
		await flush();
		render();
	}
	expect(readLocalImage).toHaveBeenCalledTimes(MAX_REPORT_IMAGES);
	expect(html).toContain(`5 de ${MAX_REPORT_IMAGES}`);

	// Sexto intento: la puerta avisa y no abre el diálogo. El corte de verdad
	// sigue en `assertReportImageCount`, adentro del repositorio.
	button(strings.bugReport.addImage).onPress?.();
	await flush();

	expect(launchImageLibraryAsync).toHaveBeenCalledTimes(MAX_REPORT_IMAGES);
	expect(readLocalImage).toHaveBeenCalledTimes(MAX_REPORT_IMAGES);
	render();
	expect(html).toContain(strings.bugReport.errorTooManyImages);
	expect(html).toContain(TEXTO);

	// Quitar una libera un lugar: el contador es el que le dice al usuario que
	// puede volver a agregar.
	removeButton(1).onPress?.();
	render();
	button(strings.bugReport.addImage).onPress?.();
	await flush();
	expect(launchImageLibraryAsync).toHaveBeenCalledTimes(MAX_REPORT_IMAGES + 1);
});

test("el picker que devuelve más de lo que sobraba no rompe el envío", async () => {
	render();
	typeSummary(TEXTO);

	// Tres lugares ocupados...
	launchImageLibraryAsync.mockImplementation(async () => ({
		canceled: false,
		assets: [{ uri: "file:///una.png" }],
	}));
	for (let i = 0; i < 3; i += 1) {
		button(strings.bugReport.addImage).onPress?.();
		await flush();
		render();
	}

	// ...y una selección de cinco. `submitBugReport` rechazaría más de
	// `MAX_REPORT_IMAGES` con `assertReportImageCount`, así que sin recorte el
	// reporte entero se pierde, texto incluido.
	launchImageLibraryAsync.mockImplementationOnce(async () => ({
		canceled: false,
		assets: [1, 2, 3, 4, 5].map((n) => ({ uri: `file:///extra-${n}.png` })),
	}));
	button(strings.bugReport.addImage).onPress?.();
	await flush();
	render();

	expect(html).toContain(`5 de ${MAX_REPORT_IMAGES}`);

	button(strings.bugReport.submit).onPress?.();
	await flush();

	const sent = submitBugReport.mock.calls.at(-1)?.[0] as {
		summary: string;
		images: unknown[];
	};
	expect(sent.summary).toBe(TEXTO);
	expect(sent.images).toHaveLength(MAX_REPORT_IMAGES);
	expect(closed).toEqual(["close"]);
});

test("dos toques con el picker abierto no dejan pasar de cinco", async () => {
	render();
	typeSummary(TEXTO);

	launchImageLibraryAsync.mockImplementation(async () => ({
		canceled: false,
		assets: [{ uri: "file:///una.png" }],
	}));

	// El picker nativo deja el botón vivo durante SEGUNDOS, y `slots` se calcula
	// antes del `await`. Los dos toques corren concurrentes sobre la misma
	// puerta y los dos recortan contra el mismo margen: sin `pickingRef` ni el
	// corte adentro del updater, el contador sube de cinco.
	const press = button(strings.bugReport.addImage).onPress;
	if (!press) throw new Error("el botón de agregar no tiene onPress");
	press();
	press();
	await flush();
	render();

	expect(launchImageLibraryAsync).toHaveBeenCalledTimes(1);
	expect(html).toContain(`1 de ${MAX_REPORT_IMAGES}`);
	expect(thumbnails).toHaveLength(1);

	button(strings.bugReport.submit).onPress?.();
	await flush();
	const sent = submitBugReport.mock.calls.at(-1)?.[0] as {
		images: unknown[];
	};
	expect(sent.images).toHaveLength(1);
});

test("la miniatura muestra la URI de su captura y se quita la elegida", async () => {
	render();
	typeSummary(TEXTO);

	launchImageLibraryAsync.mockImplementationOnce(async () => ({
		canceled: false,
		assets: [{ uri: "file:///primera.png" }, { uri: "file:///segunda.png" }],
	}));
	button(strings.bugReport.addImage).onPress?.();
	await flush();
	render();

	// La `uri` de `Capture` existe para esto: sin miniatura el usuario adjunta
	// dos archivos y no ve ninguno, y no puede saber cuál quitó.
	expect(thumbnails.map((t) => t.source?.uri)).toEqual([
		"file:///primera.png",
		"file:///segunda.png",
	]);
	// El alt y el botón de quitar llevan el número: hay dos controles iguales
	// y sin índice el lector de pantalla los anuncia idénticos.
	expect(thumbnails[0]?.accessibilityLabel).toBe(
		strings.bugReport.captureAlt.replace("{n}", "1"),
	);
	expect(removeButton(2).accessibilityLabel).toBe(
		strings.bugReport.removeImage.replace("{n}", "2"),
	);

	// Se quita la PRIMERA de dos y queda la segunda. Un "quitar la última" a
	// ciegas dejaría la primera, así que este caso distingue los dos.
	removeButton(1).onPress?.();
	render();

	expect(html).toContain(`1 de ${MAX_REPORT_IMAGES}`);
	expect(thumbnails.map((t) => t.source?.uri)).toEqual(["file:///segunda.png"]);
});

test("el error de subida se anuncia como alerta viva", async () => {
	render();
	typeSummary(TEXTO);

	submitBugReport.mockImplementationOnce(async () => {
		throw new Error("bucket no existe");
	});
	button(strings.bugReport.submit).onPress?.();
	await flush();
	render();

	// El `ErrorNote` se justifica con estos dos atributos: sin ellos el texto
	// se pinta y el lector de pantalla no anuncia el motivo.
	const notes = alerts();
	expect(notes).toHaveLength(1);
	expect(notes[0]?.accessibilityLiveRegion).toBe("polite");
});

test("el envío que falla con copy propio muestra ese copy, no el genérico", async () => {
	render();
	typeSummary(TEXTO);

	// El `AppError` viaja entero: `toAppError` lo devuelve tal cual y el
	// `fallback` solo cubre lo que no es un `AppError`. El usuario real ve el
	// mensaje del dominio.
	submitBugReport.mockImplementationOnce(async () => {
		throw Errors.validation(strings.bugReport.errorSummaryRequired);
	});
	button(strings.bugReport.submit).onPress?.();
	await flush();
	render();

	expect(html).toContain(strings.bugReport.errorSummaryRequired);
	expect(html).not.toContain(strings.bugReport.errorSubmitFailed);
	// El texto se conserva igual: el copy del error no lo borra.
	expect(html).toContain(TEXTO);
});

test("el motivo de una captura ilegible es el del dominio, no el genérico", async () => {
	render();
	typeSummary(TEXTO);

	// El camino INFORMATIVO: el repositorio envuelve el fallo de Storage en un
	// `AppError` con copy propio, así que lo que el usuario real ve es
	// "No pudimos adjuntar la imagen." y no el mensaje de envío.
	launchImageLibraryAsync.mockImplementationOnce(async () => ({
		canceled: false,
		assets: [{ uri: "file:///pesada.png" }],
	}));
	readLocalImage.mockImplementationOnce(async () => {
		throw Errors.validation(strings.bugReport.errorImageUploadFailed);
	});
	button(strings.bugReport.addImage).onPress?.();
	await flush();
	render();

	expect(html).toContain(strings.bugReport.errorImageUploadFailed);
	expect(html).not.toContain(strings.bugReport.errorImageNotSupported);
	expect(html).not.toContain(strings.bugReport.errorSubmitFailed);
	expect(alerts()).toHaveLength(1);
});

test("un envío exitoso se cierra y no vuelve a enviar con doble toque", async () => {
	render();
	typeSummary(TEXTO);

	let settleSubmit: () => void = () => {};
	submitBugReport.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				settleSubmit = resolve;
			}),
	);

	const press = button(strings.bugReport.submit).onPress;
	if (!press) throw new Error("el botón de envío no tiene onPress");
	press();
	// Sin esperar: es el segundo toque en el mismo frame, el que un chequeo por
	// estado dejaría pasar.
	press();

	expect(submitBugReport).toHaveBeenCalledTimes(1);
	expect(closed).toEqual([]);

	settleSubmit();
	await flush();

	// Cierra una sola vez, aunque el handler terminó y el `finally` soltó el
	// guard en el mismo tick que el segundo toque.
	expect(closed).toEqual(["close"]);
	expect(submitBugReport).toHaveBeenCalledTimes(1);
});

test("el dismiss no envía nada", async () => {
	render();
	typeSummary(TEXTO);

	if (!sheetProps?.onClose) throw new Error("el sheet no recibió onClose");
	sheetProps.onClose();
	await flush();

	expect(submitBugReport).toHaveBeenCalledTimes(0);
	expect(closed).toEqual(["close"]);
});

test("la captura que sí se pudo leer se manda aunque otra falle", async () => {
	render();
	typeSummary(TEXTO);

	// Dos capturas, una sana y una rota: el reporte sale con la sana. Perder
	// evidencia es un costo menor que perder el reporte entero.
	launchImageLibraryAsync.mockImplementationOnce(async () => ({
		canceled: false,
		assets: [{ uri: "file:///rota.png" }, { uri: "file://sana.png" }],
	}));
	readLocalImage.mockImplementationOnce(async () => {
		throw new Error("bytes sin firma de imagen");
	});
	button(strings.bugReport.addImage).onPress?.();
	await flush();
	// Los handlers se crean en el render del que salen, así que sin volver a
	// renderizar el de envío cerraría sobre la lista de capturas vacía.
	render();

	button(strings.bugReport.submit).onPress?.();
	await flush();

	expect(readLocalImage).toHaveBeenCalledTimes(2);
	const sent = submitBugReport.mock.calls.at(-1)?.[0] as {
		summary: string;
		images: Array<{ contentType: string }>;
	};
	expect(sent.summary).toBe(TEXTO);
	expect(sent.images).toHaveLength(1);
	expect(sent.images[0]?.contentType).toBe("image/png");
	expect(closed).toEqual(["close"]);
});

test("sin `visible` no hay nada montado", () => {
	render(false);

	expect(html).toBe("");
	expect(sheetProps).toBeNull();
	expect(submitBugReport).toHaveBeenCalledTimes(0);
});
