/**
 * Smoke test para login del panel admin.
 *
 * Para ejecutar:
 *   1. Crea un archivo `.env` con las variables:
 *      PLAYWRIGHT_BASE_URL=http://localhost:3000
 *      PLAYWRIGHT_ADMIN_EMAIL=admin@example.com
 *      PLAYWRIGHT_ADMIN_PASSWORD=password123
 *   2. Asegúrate de que role-api esté corriendo con datos seed.
 *   3. `npx playwright test`
 *
 * Si no hay credenciales de test configuradas, el test se salta automáticamente.
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "";
const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? "";

const hasCredentials = !!(BASE_URL && ADMIN_EMAIL && ADMIN_PASSWORD);

test.skip(!hasCredentials, "Saltado: PLAYWRIGHT_ADMIN_EMAIL/PASSWORD no configuradas. Crea un archivo .env con esas variables y un usuario admin en role-api.");

test("login as admin and see home page", async ({ page }) => {
	await page.goto(`${BASE_URL}/login`);

	await page.fill('input[type="email"]', ADMIN_EMAIL);
	await page.fill('input[type="password"]', ADMIN_PASSWORD);
	await page.click('button[type="submit"]');

	await expect(page).toHaveURL(/\/home/, { timeout: 10_000 });
	await expect(page.locator("text=Bienvenido")).toBeVisible({ timeout: 5_000 });
});

test("non-admin user is rejected", async ({ page }) => {
	await page.goto(`${BASE_URL}/login`);

	await page.fill('input[type="email"]', ADMIN_EMAIL);
	await page.fill('input[type="password"]', ADMIN_PASSWORD);
	await page.click('button[type="submit"]');

	await expect(page.locator("text=Solo administradores")).toBeVisible({
		timeout: 5_000,
	});
});

test("navigate to categories page", async ({ page }) => {
	await page.goto(`${BASE_URL}/login`);

	await page.fill('input[type="email"]', ADMIN_EMAIL);
	await page.fill('input[type="password"]', ADMIN_PASSWORD);
	await page.click('button[type="submit"]');

	await expect(page).toHaveURL(/\/home/, { timeout: 10_000 });

	await page.click('a[href="/categorias"]');
	await expect(page).toHaveURL(/\/categorias/, { timeout: 5_000 });
	await expect(page.locator("text=Panel de Categorías")).toBeVisible({
		timeout: 5_000,
	});
});
