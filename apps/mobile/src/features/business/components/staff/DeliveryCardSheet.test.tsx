import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

import type { BusinessMemberDeliveryCardDto } from "@0xc1x/role-commons";
import { strings } from "@/src/core/i18n/strings";
import { light } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

/**
 * La tarjeta de entrega (§9.2).
 *
 * Lo que se afirma aquí:
 *
 *  1. La tarjeta muestra el alias, el PIN y el QR —que codifica el ALIAS en
 *     claro, porque es lo que el empleado teclea al entrar.
 *  2. El aviso de que el PIN no se recupera SÍEMPRE está: es la letra
 *     pequeña de la tarjeta, no un diálogo que se pueda descartar.
 *  3. Copiar deja en el portapapeles el alias y el PIN JUNTOS.
 *  4. Compartir manda lo mismo que copiar.
 *  5. El botón de cerrar reconoce la entrega ("Listo, ya lo entregué") y no
 *     pregunta nada: el PIN ya se avisó arriba.
 */

const ALIAS = "ana@panaderia.role.ec";
const PIN = "482913";

interface ButtonProps {
	children?: ReactNode;
	onPress?: () => void;
	disabled?: boolean;
}

interface SheetProps {
	title?: string;
	onClose?: () => void;
	children?: ReactNode;
	footer?: ReactNode;
}

let buttons: ButtonProps[] = [];
let sheetProps: SheetProps | null = null;
let html = "";

/** Lo que se copió al portapapeles. */
const clipboard: string[] = [];
/** Lo que se compartió. */
const shared: Array<{ message: string }> = [];
/** El valor de cada QR pintado. */
const qrValues: string[] = [];

mockNativeUi({
	Share: {
		share: async (options: { message: string }) => {
			shared.push(options);
		},
	},
});

mock.module("expo-clipboard", () => ({
	setStringAsync: async (text: string) => {
		clipboard.push(text);
	},
}));

mock.module("sonner-native", () => ({
	toast: { success: (message: string) => void message },
}));

// El QR se dobla para poder afirmar QUÉ se codifica: el valor que recibe, no
// los píxeles que salen.
mock.module("react-native-qrcode-svg", () => ({
	default: (props: { value: string }) => {
		qrValues.push(props.value);
		return createElement(nativeWeb.Text, null, `QR:${props.value}`);
	},
}));

mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));

mock.module("@/src/core/ui", () => ({
	AppText: ({ children }: { children?: ReactNode }) =>
		createElement(nativeWeb.Text, null, children),
	// La hoja se dobla en sus tres piezas —título, cuerpo y pie— para poder
	// afirmar el pie: el botón de cerrar vive ahí, y es el que reconoce la
	// entrega.
	BottomSheetModal: (props: SheetProps) => {
		sheetProps = props;
		return createElement(
			nativeWeb.View,
			null,
			props.title ? createElement(nativeWeb.Text, null, props.title) : null,
			props.children,
			props.footer ?? null,
		);
	},
}));

mock.module("@/components/ui/button", () => ({
	Button: (props: ButtonProps) => {
		buttons.push(props);
		return createElement(nativeWeb.Text, null, props.children);
	},
}));

const { DeliveryCardSheet } = await import("./DeliveryCardSheet");

/** Drena la cadena de microtareas del `async` del copiado. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function card(
	overrides: Partial<BusinessMemberDeliveryCardDto> = {},
): BusinessMemberDeliveryCardDto {
	return {
		alias: ALIAS,
		pin: PIN,
		alias_warnings: [],
		...overrides,
	};
}

const closed: string[] = [];

function render(deliveryCard: BusinessMemberDeliveryCardDto = card()): void {
	buttons = [];
	sheetProps = null;
	html = renderToStaticMarkup(
		createElement(DeliveryCardSheet, {
			card: deliveryCard,
			onClose: () => closed.push("close"),
		}),
	);
}

const button = (label: string): ButtonProps => {
	const found = buttons.find((b) => textOf(b.children) === label);
	if (!found) throw new Error(`botón no renderizado: ${label}`);
	return found;
};

/** El texto que un nodo pinta. */
function textOf(node: unknown): string {
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(textOf).join("");
	const props =
		node && typeof node === "object" && "props" in node
			? (node as { props: unknown }).props
			: undefined;
	if (props && typeof props === "object" && "children" in props) {
		return textOf((props as { children: unknown }).children);
	}
	return "";
}

beforeEach(() => {
	closed.length = 0;
	clipboard.length = 0;
	shared.length = 0;
	qrValues.length = 0;
	render();
});

test("la tarjeta muestra el alias, el PIN y el QR del alias", () => {
	expect(html).toContain(ALIAS);
	expect(html).toContain(PIN);
	expect(qrValues).toEqual([ALIAS]);
	expect(sheetProps?.title).toBe(strings.business.staff.deliveryTitle);
});

test("el aviso de que el PIN no se recupera está siempre visible", () => {
	expect(html).toContain(strings.business.staff.deliveryPinWarning);
	// Y el aviso NO es un diálogo: la hoja no pregunta nada al cerrar.
	expect(html).not.toContain(strings.business.staff.aliasWarning);
});

test("copiar deja el alias y el PIN juntos en el portapapeles", async () => {
	button(strings.business.staff.deliveryCopy).onPress?.();
	await flush();

	expect(clipboard).toHaveLength(1);
	expect(clipboard[0]).toContain(ALIAS);
	expect(clipboard[0]).toContain(PIN);
});

test("compartir manda lo mismo que copiar", async () => {
	button(strings.business.staff.deliveryShare).onPress?.();
	await flush();

	expect(shared).toHaveLength(1);
	expect(shared[0]?.message).toContain(ALIAS);
	expect(shared[0]?.message).toContain(PIN);
});

test("el botón de cerrar reconoce la entrega y cierra la hoja", () => {
	const close = button(strings.business.staff.deliveryClose);

	expect(close).toBeDefined();
	close.onPress?.();
	expect(closed).toEqual(["close"]);
});

test("el aviso del dominio aparece cuando el API lo manda", () => {
	render(card({ alias_warnings: ["alias_domain_can_receive_mail"] }));

	expect(html).toContain(strings.business.staff.aliasWarning);
});
