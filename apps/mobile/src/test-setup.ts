import { mock } from "bun:test";

import { applyTestEnv } from "@/src/test-utils/test-env";

// Bun test preload (wired via bunfig.toml [test] preload). Runs before every
// test file, so mocks registered here cover transitive native imports that
// per-file mock.module("react-native") calls cannot reach.

// El entorno va PRIMERO y en el preload (no en cada test) porque
// `src/core/config/env.ts` valida con Zod AL IMPORTAR: sin estas variables
// cualquier test que llegue a él de forma transitiva muere al cargarse, y
// el fallo se reporta como "fichero de test roto" en vez de "falta env".
// Ver `src/test-utils/test-env.ts` para el porqué de los valores.
applyTestEnv();
//
// Root cause: lucide-react-native requires the real react-native-svg, whose
// src/fabric/*NativeComponent.ts files import Flow-typed deep paths such as
// react-native/Libraries/Utilities/codegenNativeComponent. Those subpath
// imports bypass the "react-native" specifier mock, and bun's transpiler
// cannot parse the Flow `import type {…}` syntax, failing the whole file
// with `Expected "from" but found "{"`. Stubbing the SVG primitives keeps
// the real lucide icon logic while rendering null, which is enough for the
// SSR string assertions used in this suite.
const SvgStub = () => null;

mock.module("react-native-svg", () => ({
	__esModule: true,
	default: SvgStub,
	Svg: SvgStub,
	Path: SvgStub,
	Circle: SvgStub,
	Rect: SvgStub,
	Line: SvgStub,
	Polyline: SvgStub,
	Polygon: SvgStub,
	Ellipse: SvgStub,
	G: SvgStub,
	Defs: SvgStub,
	Use: SvgStub,
	Symbol: SvgStub,
	Stop: SvgStub,
	LinearGradient: SvgStub,
	RadialGradient: SvgStub,
	ClipPath: SvgStub,
	Mask: SvgStub,
	Pattern: SvgStub,
	Image: SvgStub,
	Text: SvgStub,
	TSpan: SvgStub,
	TextPath: SvgStub,
	ForeignObject: SvgStub,
	Marker: SvgStub,
	SvgXml: SvgStub,
	SvgUri: SvgStub,
	SvgCss: SvgStub,
	SvgCssUri: SvgStub,
}));
