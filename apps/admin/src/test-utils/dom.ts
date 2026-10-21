import { installDomEnvironment } from "./dom-env";

// El entorno DOM se instala antes de ligar testing-library: es lo que hace que
// `screen`/`render` operen sobre el documento de happy-dom y no sobre el global.
//
// Es idempotente a propósito. Con el preload de `bunfig.toml` el DOM ya está
// instalado cuando este módulo se importa, y el que manda es el del preload
// (el primero que se ve); sin preload —`bun test` desde otro cwd— este módulo
// lo instala igual, antes de que se cargue testing-library.
installDomEnvironment();

export const { render, screen, fireEvent, waitFor, cleanup, renderHook, act } =
	await import("@testing-library/react");
// jest-dom solo registra matchers globales (sus .d.ts no son un módulo).
// @ts-expect-error: importación solo por efectos laterales
await import("@testing-library/jest-dom");
