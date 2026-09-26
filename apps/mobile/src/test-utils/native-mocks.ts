import { mock } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

/**
 * Native-module mocks for SSR screen tests.
 *
 * `bun test` renders through `react-native-web`, but the real native graph is
 * unusable: `react-native`'s Flow types cannot be parsed by bun's transpiler
 * (`react-native/Libraries/Utilities/codegenNativeComponent`) and the native
 * registries do not exist. Screens reach those modules through safe-area /
 * screens / gesture-handler, which bun still resolves to the real files, so the
 * export surface below is complete on purpose: bun validates named imports
 * against the module being replaced.
 *
 * Same root cause as the `react-native-svg` stub in `test-setup.ts`, scoped to
 * the files that need it instead of applied to every suite.
 */

// @ts-expect-error test-only global shim
globalThis.__DEV__ ??= false;

const View = ({ children, ...rest }: { children?: ReactNode }) =>
	createElement(nativeWeb.View, rest as never, children);
const empty = () => null;

export function mockNativeUi(overrides: Record<string, unknown> = {}): void {
	mock.module("react-native", () => ({
		...nativeWeb,
		RefreshControl: empty,
		TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
		NativeModules: {},
		...overrides,
	}));

	mock.module("react-native-safe-area-context", () => ({
		SafeAreaProvider: View,
		SafeAreaConsumer: empty,
		SafeAreaView: View,
		SafeAreaInsetsContext: { Provider: View, Consumer: empty },
		SafeAreaFrameContext: { Provider: View, Consumer: empty },
		useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
		useSafeAreaFrame: () => ({ x: 0, y: 0, width: 0, height: 0 }),
		withSafeAreaInsets: (Component: unknown) => Component,
		initialWindowMetrics: null,
		initialWindowSafeAreaInsets: null,
	}));

	mock.module("react-native-screens", () => ({
		enableScreens: () => {},
		enableFreeze: () => {},
		screensEnabled: () => false,
		freezeEnabled: () => false,
		isSearchBarAvailableForCurrentPlatform: () => false,
		executeNativeBackPress: () => false,
		executeBackPress: () => false,
		compatibilityFlags: {},
		Screen: View,
		InnerScreen: View,
		ScreenContainer: View,
		ScreenStack: View,
		ScreenStackItem: View,
		ScreenStackHeaderConfig: View,
		ScreenStackHeaderSubview: View,
		ScreenStackHeaderLeftView: View,
		ScreenStackHeaderCenterView: View,
		ScreenStackHeaderRightView: View,
		ScreenStackHeaderBackButtonImage: View,
		ScreenStackHeaderSearchBarView: View,
		ScreenFooter: View,
		ScreenContentWrapper: View,
		FullWindowOverlay: View,
		SearchBar: View,
		ScreenContext: View,
		NativeScreen: View,
		NativeScreenContainer: View,
	}));

	mock.module("react-native-gesture-handler", () => ({
		GestureHandlerRootView: View,
		PanGestureHandler: View,
		TapGestureHandler: View,
		LongPressGestureHandler: View,
		ScrollView: View,
		State: {},
		Directions: {},
		Gesture: { Detector: View, Handler: View },
		GestureDetector: View,
		composedHandlers: (...handlers: unknown[]) => handlers,
		gestureHandlerRootHOC: (Component: unknown) => Component,
		enableExperimentalWebImplementation: () => {},
		scheduleOnRN: (fn: unknown) => fn,
	}));
}
