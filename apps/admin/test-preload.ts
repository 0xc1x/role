// Preload de tests (bunfig.toml [test]): el entorno DOM se instala ANTES de
// que bun importe el primer spec.
//
// POR QUÉ AQUÍ Y NO EN CADA SPEC: `@base-ui/utils` decide en el ámbito del
// módulo si hay DOM (`useIsoLayoutEffect = typeof document !== "undefined" ? …
// : noop`) y, en bun, el registro de módulos es del proceso: el primer spec que
// carga base-ui decide el modo de los noventa y dos. Un spec que importa el
// componente bajo prueba antes que el helper de DOM lo carga en modo SSR, sus
// portales no abren y los `findBy*` expiran. El orden de archivos lo da el
// filesystem, así que la suite pasaba en un clon y fallaba en otro sin que
// cambiara una línea. El preload elimina esa ruleta: el DOM existe antes de que
// se cargue cualquier módulo.
//
// El detalle de cada shim vive en `src/test-utils/dom-env.ts`.
import { installDomEnvironment } from "./src/test-utils/dom-env";

installDomEnvironment();
