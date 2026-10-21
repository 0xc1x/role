import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

/**
 * El panel se pinta según el rol (§9.3).
 *
 * El panel ya no es sólo del dueño: un gerente y un cajero lo abren también, y
 * lo que ven depende del rol que tienen EN ESE negocio. La regla es de
 * alcance: cada fila, tile y bloque declara el rol mínimo que lo alcanza, y
 * el mínimo se CIERRA (sin rol no se abre nada — ver `panel-role.ts`).
 *
 * Lo que se afirma aquí es lo que la persona VE: el texto que pinta la
 * pantalla. Un botón que no existe no falla —no hay forma de apretarlo—, así
 * que la prueba de una sección escondida es la ausencia de su texto.
 *
 * ─── LO QUE NO SE AFIRMA AQUÍ ────────────────────────────────────────────────
 *
 * «Equipo y accesos» no se afirma: esa tarjeta la monta la Task 7, que es
 * donde existe la ruta a la que apunta.
 *
 * Y «Pedidos» tampoco: no es una fila del panel, es la PESTAÑA del shell del
 * negocio (`app/(business)/_layout.tsx`), y el shell no filtra por rol —esta
 * tarea filtra el PANEL—. Lo que el panel del cajero conserva es lo suyo:
 * reseñas y soporte. De configuración, nada.
 */

const wrapper = ({ children }: { children?: ReactNode }) =>
	createElement(nativeWeb.View, null, children);

mockNativeUi();
mock.module("expo-router", () => ({ router: { push: () => {} } }));
mock.module("expo-image", () => ({ Image: nativeWeb.View }));
mock.module("expo-linear-gradient", () => ({ LinearGradient: nativeWeb.View }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light }),
}));
mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text,
	Screen: wrapper,
	// El estado vacío de las sucursales se pinta con su título y su cuerpo:
	// el bloque entero (título, botón de agregar, lista y vacío) va y viene
	// junto, y esta es la forma de comprobar que el vacío también se fue.
	EmptyState: ({ title, message }: { title?: string; message?: string }) =>
		createElement(
			nativeWeb.View,
			null,
			createElement(nativeWeb.Text, null, title),
			createElement(nativeWeb.Text, null, message),
		),
	ErrorState: () => null,
}));
mock.module("@/components/ui/skeleton", () => ({ Skeleton: () => null }));
// El botón se pinta con su texto: es el texto el que prueba que la fila o el
// bloque está en la pantalla.
mock.module("@/components/ui/button", () => ({
	Button: ({ children }: { children?: ReactNode }) =>
		createElement(nativeWeb.Text, null, children),
}));
mock.module("@/src/features/business/components/LocationCard", () => ({
	LocationCard: () => null,
	LocationCardSkeleton: () => null,
}));
mock.module("@/src/features/auth/presentation/SignOutSection", () => ({
	SignOutSection: () => null,
}));
mock.module("@/src/features/bug-report/use-report-problem-sheet", () => ({
	useReportProblemSheet: () => ({
		openReportProblem: () => {},
		reportProblemSheet: null,
	}),
}));

const profile = {
	business: {
		id: "business-1",
		name: "Panadería Rolé",
		type: "bakery",
		image: null,
		cover_image: null,
		description: "Pan recién hecho",
		rating: 4.5,
		review_count: 12,
	},
	address: "Centre",
	hours: [],
	reviews: [],
	totalRescued: 10,
};

mock.module("@/src/features/business/hooks", () => ({
	useBusinessProfile: () => ({
		data: profile,
		isLoading: false,
		isError: false,
		error: null,
		refetch: async () => {},
	}),
	// Sin sucursales: el bloque pinta su estado vacío, que también se abre y
	// se cierra con el resto del bloque.
	useBusinessLocations: () => ({ data: [], isLoading: false }),
}));

const { GestionContent } = await import("./GestionContent");

function render(role: "owner" | "manager" | "staff"): string {
	return renderToStaticMarkup(
		createElement(GestionContent, { businessId: "business-1", role }),
	);
}

test("el dueño ve la configuración que le corresponde", () => {
	const html = render("owner");

	// Editar el negocio.
	expect(html).toContain(strings.business.editProfile);
	// Sucursales: título, botón de agregar y estado vacío, todo junto.
	expect(html).toContain(strings.business.myLocations);
	expect(html).toContain(strings.business.addLocation);
	expect(html).toContain(strings.business.noLocationsTitle);
	// Métricas y cupones.
	expect(html).toContain(strings.business.quickStats);
	expect(html).toContain(strings.business.quickCoupons);
});

test("el cajero no ve configuración y sí ve lo suyo", () => {
	const html = render("staff");

	expect(html).not.toContain(strings.business.editProfile);
	expect(html).not.toContain(strings.business.myLocations);
	expect(html).not.toContain(strings.business.addLocation);
	expect(html).not.toContain(strings.business.noLocationsTitle);
	expect(html).not.toContain(strings.business.quickStats);
	expect(html).not.toContain(strings.business.quickCoupons);

	// Lo que sí le toca: reseñas, soporte y el buzón.
	expect(html).toContain(strings.business.quickReviews);
	expect(html).toContain(strings.business.quickSupport);
	expect(html).toContain(strings.business.helpCenter);
	expect(html).toContain(strings.bugReport.title);
	// Los títulos de sección se quedan mientras quede algo que anunciar.
	expect(html).toContain(strings.business.quickActions);
	expect(html).toContain(strings.business.settingsSection);
	// Y sigue sabiendo en qué negocio opera.
	expect(html).toContain(profile.business.name);
});

test("el gerente ve las sucursales y no edita el negocio", () => {
	const html = render("manager");

	expect(html).toContain(strings.business.myLocations);
	expect(html).toContain(strings.business.addLocation);
	expect(html).not.toContain(strings.business.editProfile);
	// Las métricas y los cupones siguen siendo del dueño.
	expect(html).not.toContain(strings.business.quickStats);
	expect(html).not.toContain(strings.business.quickCoupons);
	// Y las filas de apoyo siguen siendo de quien opera el negocio.
	expect(html).toContain(strings.business.helpCenter);
	expect(html).toContain(strings.business.quickReviews);
});
