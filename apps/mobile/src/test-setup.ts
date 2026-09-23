import { mock } from "bun:test";

// Bun test preload (wired via bunfig.toml [test] preload). Runs before every
// test file, so mocks registered here cover transitive native imports that
// per-file mock.module("react-native") calls cannot reach.
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
