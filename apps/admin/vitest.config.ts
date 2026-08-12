import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		environment: "jsdom",
		exclude: ["tests/**", "node_modules/**", "dist/**"],
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
	},
});
