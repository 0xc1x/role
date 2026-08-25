import Constants from "expo-constants";

/** Versión de la app desde app.json (inlineada al compilar). */
export const APP_VERSION = Constants.expoConfig?.version ?? "dev";
