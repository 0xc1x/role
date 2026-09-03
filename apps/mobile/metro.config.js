// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;

// ponytail: withSentryConfig rompe `expo export --platform web` en @sentry/react-native 7.11
// (determineDebugIdFromBundleSource recibe bundle undefined). Sentry sigue capturando
// errores en web+nativo sin debugId; re-activar cuando Sentry publique fix para web.
module.exports = withNativeWind(config, { input: "./global.css" });
