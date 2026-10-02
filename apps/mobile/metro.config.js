// Learn more: https://docs.expo.dev/guides/customizing-metro/
const path = require("node:path");
const { createHash } = require("node:crypto");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;

// ─── DÓNDE VIVE LA CACHÉ DE METRO ─────────────────────────────────────────
//
// Por defecto Metro cuelga su caché del tmp del PROCESO. En CI eso es un
// directorio nuevo en cada corrida, así que `expo export` transforma los ~4600
// módulos del bundle web desde cero, siempre. MEDIDO en el pipeline: el export
// de mobile se lleva ~155 s de los ~300 s de su suite, y es la razón por la que
// el camino crítico de `test:e2e` es mobile y no admin.
//
// Moverla al repo la deja en un lugar que `actions/cache` puede reusar entre
// corridas.
//
// POR QUÉ SE RECONSTRUYE LA CLASE Y NO SE IMPORTA `FileStore`: `metro-cache` no
// es dependencia directa de esta app, así que `require("metro-cache")` no
// resuelve desde acá. En cambio la clase que Metro YA eligió para esta versión
// está en `config.cacheStores[0].constructor`: reutilizarla con otra raíz no
// depende de que el nombre de la clase siga siendo el mismo entre versiones.
//
// LO QUE ESTO NO HACE, Y POR QUÉ NO DEBERÍA HACER: esta NO es una caché de
// artefactos. Metro direcciona por contenido —hash del archivo, de la config y
// de la versión del transformador—, así que una entrada con hash viejo no puede
// devolver un bundle viejo: o acierta el hash y el resultado es el correcto, o
// falla el hash y recalcula.
//
// La parte delicada es el ENV, y por eso el `--clear` sigue existiendo en
// `export:web`. Los valores `EXPO_PUBLIC_*` se inlinean al transformar, pero
// Metro NO los mete en el hash del módulo: verificado en
// `@expo/metro-config/build/babel-transformer.js`, cuyo `getCacheKey` hashea solo
// los archivos de config de Babel. O sea que un bundle cacheado de un env puede
// volver a salir para otro env con el mismo código — el envenenamiento que el
// `--clear` previene en el deploy.
//
// `export:web:e2e` es el que NO limpia, y solo lo usa el e2e de CI, donde el env
// lo fija el workflow y no lo cambia nadie a mitad de corrida. El deploy
// (`build:vercel`) sigue con `--clear`, porque ahí el bundle es el que se publica
// y no vale arriesgarlo por unos segundos.
// ─── EL ENV FORMA PARTE DE LA RUTA DE LA CACHÉ, NO DE SU CLAVE ──────────
//
// Metro inlinea los valores `EXPO_PUBLIC_*` al transformar un módulo, pero su
// `getCacheKey` hashea SOLO los archivos de config de Babel
// (`@expo/metro-config/build/babel-transformer.js`). O sea que el hash es el
// mismo con env distinto y la caché devuelve un módulo hecho con el env
// anterior.
//
// REPRODUCIDO, no supuesto: con la caché caliente se cambió
// `EXPO_PUBLIC_SUPABASE_URL`, se re-exportó, y el bundle servido SEGUÍA
// conteniendo el valor viejo; el nuevo no aparecía en ningún archivo de `dist/`.
//
// La primera versión de esto envolvía `config.transformer.getCacheKey` para
// meter el env en el hash, y NO SERVIÓ: Expo resuelve el transformer DESPUÉS de
// leer este archivo, así que la sobrescribe. Por eso el env va en la RUTA del
// store en vez de en la clave: un env distinto es un directorio distinto, y dos
// entornos no pueden pisarse por construcción, sin depender de ningún interno.
//
// Esto NO es la defensa del deploy —`build:vercel` sigue con `--clear`—, es la de
// que la caché de e2e no sirva un bundle con el env equivocado.
const MetroStorePorDefecto = config.cacheStores[0].constructor;
const huellaDelEnv = createHash("sha256")
	.update(
		Object.entries(process.env)
			.filter(([clave]) => clave.startsWith("EXPO_PUBLIC_"))
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([clave, valor]) => `${clave}=${valor ?? ""}`)
			.join("\n"),
	)
	.digest("hex")
	.slice(0, 16);

config.cacheStores = [
	new MetroStorePorDefecto({
		root: path.join(
			__dirname,
			"../../node_modules/.cache/metro",
			huellaDelEnv,
		),
	}),
];

// ponytail: withSentryConfig rompe `expo export --platform web` en @sentry/react-native 7.11
// (determineDebugIdFromBundleSource recibe bundle undefined). Sentry sigue capturando
// errores en web+nativo sin debugId; re-activar cuando Sentry publique fix para web.
module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
