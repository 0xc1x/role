// Genera public/firebase-config.js a partir de apps/mobile/.env
// (patrón de fudi: tool/generate_firebase_config.dart). El archivo generado
// está gitignored para no commitear las keys del proyecto Firebase.
//
// Para el deploy de la PWA (`vercel env pull .env.production.local`) se usa
// `.env.production.local` si existe, así el bundle lleva las envs de producción
// igual que hace Expo al inlinar EXPO_PUBLIC_* en `expo export`.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = existsSync(join(root, ".env.production.local"))
	? join(root, ".env.production.local")
	: join(root, ".env");
const outPath = join(root, "public", "firebase-config.js");

const ENV_KEYS = {
	apiKey: "EXPO_PUBLIC_FIREBASE_API_KEY",
	projectId: "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
	messagingSenderId: "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
	appId: "EXPO_PUBLIC_FIREBASE_APP_ID",
};

function readEnvVars(path) {
	const vars = {};
	if (!existsSync(path)) return vars;
	for (const line of readFileSync(path, "utf8").split("\n")) {
		const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
		if (match && !line.trim().startsWith("#")) {
			vars[match[1]] = match[2].replace(/^["']|["']$/g, "");
		}
	}
	return vars;
}

// El entorno gana sobre .env (igual que hace Expo al inlinar EXPO_PUBLIC_*).
const vars = { ...readEnvVars(envPath), ...process.env };

const config = {};
for (const [jsKey, envKey] of Object.entries(ENV_KEYS)) {
	const value = vars[envKey];
	if (!value) {
		console.error(
			`[generate-firebase-config] ${envKey} no está definida en ${envPath} — el push de la PWA quedará deshabilitado.`,
		);
		process.exit(1);
	}
	config[jsKey] = value;
}

writeFileSync(
	outPath,
	`self.FIREBASE_CONFIG = ${JSON.stringify(config)};\n`,
);
console.log(`[generate-firebase-config] OK → ${outPath}`);
