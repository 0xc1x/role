import { beforeEach, expect, it, mock } from "bun:test";
import { plugin } from "bun";
import { createElement, type ComponentType, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { authorPalette, dark, light } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";
import type { UserProfile } from "@/src/features/auth/domain/user";

// Editar el perfil y ver el perfil tienen que mostrar el MISMO disco. Si el form
// calculara el color por su cuenta y se equivocara, la persona vería cambiar de
// color al entrar a editar el perfil y al volver, sin haber cambiado nada: el
// form se leería como "este es otro perfil".

// These primitives ship JSX in .mjs; Metro handles that in the app and bun's
// transpiler cannot parse it. Same loader shim as `SegmentedTabs.test.tsx`.
plugin({
	name: "avatar-jsx",
	setup(build) {
		build.onLoad(
			// Broad on purpose: the transitive graph (slot, portal, ...) reaches
			// sibling packages that ship raw JSX too, and enumerating them one
			// failure at a time is how a suite rots.
			{ filter: /@rn-primitives[+/][^/]+[+/]dist[+/].*\.mjs$/ },
			async ({ path }) => ({
				contents: await Bun.file(path).text(),
				loader: "jsx",
			}),
		);
	},
});

type ViewProps = { style?: unknown; role?: string };
const discs: ViewProps[] = [];

// The interop runtime requires `react-native` on import, so the native mock has
// to be registered first. Wrapping RN `View` is what makes the resolved style
// observable, the same way `stats-kpi.test.tsx` reads Card output.
let StyledView: ComponentType<ViewProps>;
mockNativeUi({
	View: (props: ViewProps) => createElement(StyledView, props),
});

const { cssInterop } = await import(
	"react-native-css-interop/dist/runtime/native/api"
);
StyledView = cssInterop(
	(props: ViewProps) => {
		discs.push(props);
		return createElement(nativeWeb.View, props);
	},
	{ className: "style" },
);

let scheme: "light" | "dark" = "light";
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: scheme === "light" ? light : dark, scheme }),
}));

// Literals, not `authorPaletteIndex` rerun inside the test: an expectation that
// runs the same function as the code agrees with it by construction and could
// never catch it being wrong. Slots 7 and 3 were worked out from FNV-1a by
// hand and cross-checked against an independent BigInt implementation of the
// hash.
const ANA = "3f9a1c2e-7b4d-4e8a-9c1f-2d6b5a0e7f31"; // slot 7
const BRUNO = "a1b2c3d4-e5f6-4708-9a1b-2c3d4e5f6071"; // slot 3
const ANA_LIGHT = "#B45309";
const BRUNO_LIGHT = "#C2410C";

let stored: UserProfile = {
	id: ANA,
	email: "ana@role.app",
	fullName: "Ana Ruiz",
	avatarUrl: null,
	phone: null,
	city: "Quito",
	role: "user",
	analyticsConsentGranted: false,
};

mock.module("@/src/features/auth/store", () => ({
	useAuthStore: () => ({
		get profile() {
			return stored;
		},
		status: "authenticated",
		initialized: true,
		setProfile: () => {},
	}),
}));
mock.module("@/src/features/config", () => ({
	useAppConfig: () => ({ data: {} }),
}));
// One mock for both modules under test: the edit screen needs the write hook
// and `ProfileHeader` needs the stats hook, and bun validates named imports
// against the module being replaced.
mock.module("@/src/features/profile/hooks", () => ({
	useSaveProfileWithEmail: () => ({ isPending: false, mutate: () => {} }),
	useProfileStats: () => ({ data: undefined, isLoading: false }),
}));
mock.module("@/src/features/auth/data/repository", () => ({
	authRepository: { fetchProfile: async () => null },
}));
mock.module("expo-router", () => ({
	__esModule: true,
	router: { replace: () => {}, push: () => {} },
	useRouter: () => ({ replace: () => {}, push: () => {} }),
	useLocalSearchParams: () => ({}),
	useGlobalSearchParams: () => ({}),
	useSegments: () => [],
	usePathname: () => "/",
	useNavigation: () => ({ navigate: () => {}, replace: () => {} }),
}));
mock.module("sonner-native", () => ({
	toast: { success: () => {}, error: () => {} },
}));
mock.module("@/components/ui/select", () => ({
	__esModule: true,
	Select: ({ children }: { children?: unknown }) => children,
	SelectContent: () => null,
	SelectGroup: () => null,
	SelectItem: () => null,
	SelectTrigger: () => null,
	SelectValue: () => null,
}));
mock.module("@/src/core/ui", () => ({
	__esModule: true,
	AppText: nativeWeb.Text,
	Screen: ({ children }: { children?: ReactNode }) =>
		createElement(nativeWeb.View, null, children),
	ScreenHeader: () => null,
	TextField: () => null,
	goBackOr: () => {},
}));
mock.module("@/components/ui/button", () => ({ Button: () => null }));

const { default: EditProfileScreen } = await import(
	"../../../../app/(consumer)/profile/edit"
);
const { ProfileAvatar } = await import("./ProfileHeader");

const flat = (props: ViewProps) =>
	nativeWeb.StyleSheet.flatten(props.style ?? {}) as Record<string, unknown>;

/** The fallback is the only node the primitive paints with `role="img"`. */
function discColor(): string {
	const fallback = discs.find((props) => props.role === "img");
	if (!fallback) throw new Error("el fallback no se pintó");
	return flat(fallback).backgroundColor as string;
}

function renderEdit(): void {
	discs.length = 0;
	renderToStaticMarkup(createElement(EditProfileScreen));
}

function renderHeader(): void {
	discs.length = 0;
	renderToStaticMarkup(createElement(ProfileAvatar, { profile: stored }));
}

beforeEach(() => {
	scheme = "light";
	stored = { ...stored, id: ANA };
	discs.length = 0;
});

it("el fallback del form de editar perfil usa el mismo color que el perfil", () => {
	renderHeader();
	const header = discColor();
	renderEdit();
	// The same disc, not merely "a colour": the point is that the form is
	// recognisably the same person as the profile screen.
	expect(discColor()).toBe(header);
	expect(discColor()).toBe(ANA_LIGHT);
});

it("el form de editar perfil también cambia con el esquema", () => {
	renderEdit();
	expect(discColor()).toBe(ANA_LIGHT);

	scheme = "dark";
	renderEdit();
	expect(discColor()).not.toBe(ANA_LIGHT);
	expect(discColor()).toBe(authorPalette.dark[7].fill);
});

it("dos personas distintas reciben discos distintos en el form", () => {
	stored = { ...stored, id: ANA };
	renderEdit();
	expect(discColor()).toBe(ANA_LIGHT);

	stored = { ...stored, id: BRUNO };
	renderEdit();
	expect(discColor()).toBe(BRUNO_LIGHT);
	expect(discColor()).not.toBe(ANA_LIGHT);
});
