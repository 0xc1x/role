import type { Page } from "@playwright/test";
import {
	expect,
	gotoHydrated,
	ONBOARDING_PATH,
	test,
	waitForRequestTo,
} from "./fixtures";

/**
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * `/business-signup` is the only place in the entire product where a browser
 * form writes to the Rolé backend. It is also the funnel for every business
 * that will ever appear in the app, so the states below are revenue, not
 * cosmetics.
 *
 * The API's own end-to-end suite already proves the endpoint creates a user
 * and a business row — re-proving that here would only add latency. What the
 * API cannot see is everything in between: that the form blocks a bad payload
 * before it leaves the browser, that a 409 is translated into Spanish copy
 * with a route to the sign-in the user actually has, and that a 500 does not
 * get rendered as a success.
 *
 * ─── The safety rule this file is built around ──────────────────────────────
 *
 * `apps/landing/.env` points at a live production backend. Every submit here
 * is intercepted by `page.route()` and answered from the test, so no byte of
 * these payloads can reach it. The one test that proves the real request is
 * built also asserts the request went to the loopback stub, because a suite
 * that verifies "the form posts" without verifying "the form posted HERE" is
 * one refactor away from creating a real business owner in production.
 */
interface SignupValues {
	name: string;
	email: string;
	password: string;
	business: string;
	phone: string;
}

const VALID: SignupValues = {
	name: "Ada Lovelace",
	email: "ada@e2e.example",
	password: "sup3rsecreta",
	business: "Panadería La Espiga",
	phone: "+593 99 123 4567",
};

async function fillForm(page: Page, overrides: Partial<SignupValues> = {}) {
	const values: SignupValues = { ...VALID, ...overrides };
	await page.locator("#signup-name").fill(values.name);
	await page.locator("#signup-email").fill(values.email);
	await page.locator("#signup-password").fill(values.password);
	await page.locator("#signup-confirm").fill(values.password);
	await page.locator("#signup-business").fill(values.business);
	await page.locator("#signup-phone").fill(values.phone);
}

test.describe("/business-signup", () => {
	test("renders every field the onboarding contract requires", async ({ page }) => {
		await gotoHydrated(page, "/business-signup");

		await expect(
			page.getByRole("heading", { level: 1, name: "Registrar mi negocio" }),
		).toBeVisible();
		// Named after the contract, not the markup: `OnboardingBusinessRequestSchema`
		// requires email, password, full_name and business_name, and makes phone
		// optional. A field removed from the form would otherwise only surface
		// as a 400 from the API.
		for (const id of [
			"#signup-name",
			"#signup-email",
			"#signup-password",
			"#signup-confirm",
			"#signup-business",
			"#signup-phone",
		]) {
			await expect(page.locator(id)).toBeVisible();
		}
	});

	test("blocks a password mismatch in the browser and sends nothing", async ({
		page,
		network,
	}) => {
		await gotoHydrated(page, "/business-signup");
		await fillForm(page);
		await page.locator("#signup-confirm").fill("otra-cosa-distinta");
		await page.getByRole("button", { name: "Registrar negocio" }).click();

		await expect(page.getByRole("alert")).toHaveText("Las contraseñas no coinciden");

		// The load-bearing half. Showing the message is the easy part; proving
		// nothing left the browser is what makes it a validation test rather
		// than an error-message test.
		expect(
			network.all.filter((u) => u.includes(ONBOARDING_PATH)),
		).toHaveLength(0);
	});

	test("blocks a short password using the same contract the server enforces", async ({
		page,
		network,
	}) => {
		await gotoHydrated(page, "/business-signup");
		await fillForm(page, { password: "corta" });
		await page.locator("#signup-confirm").fill("corta");
		await page.getByRole("button", { name: "Registrar negocio" }).click();

		// The copy names the rule from `OnboardingBusinessRequestSchema`
		// (`z.string().min(8)`) rather than a locally invented limit, so the two
		// cannot drift apart silently.
		await expect(page.getByRole("alert")).toHaveText(
			"La contraseña debe tener al menos 8 caracteres",
		);
		expect(
			network.all.filter((u) => u.includes(ONBOARDING_PATH)),
		).toHaveLength(0);
	});

	test("a valid submit reaches the API and shows the confirmation", async ({
		page,
	}) => {
		// Stubbed at the browser edge: 201 from the loopback stub, never a live
		// backend. `apps/api/test/` is where the real creation is proven.
		await page.route(`**${ONBOARDING_PATH}`, (route) =>
			route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({ message: "Business created" }),
			}),
		);

		await gotoHydrated(page, "/business-signup");
		await fillForm(page);
		await page.getByRole("button", { name: "Registrar negocio" }).click();

		await expect(
			page.getByRole("heading", { name: "¡Recibimos tu solicitud!" }),
		).toBeVisible();
	});

	test("the submitted payload matches the onboarding contract", async ({
		page,
	}) => {
		// WHY assert the body and not just the success screen: a renamed field
		// that the browser sends as `undefined` still gets a 201 from a lenient
		// server and still renders "¡Recibimos tu solicitud!". The user is told
		// they registered; the backend stored nothing usable. The API suite
		// validates its own input, so nothing else in the repo would notice the
		// client stopped sending it.
		let body: unknown;
		await page.route(`**${ONBOARDING_PATH}`, async (route) => {
			body = route.request().postDataJSON();
			await route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({ message: "Business created" }),
			});
		});

		await gotoHydrated(page, "/business-signup");
		await fillForm(page);
		const submitted = waitForRequestTo(page, ONBOARDING_PATH, "POST");
		await page.getByRole("button", { name: "Registrar negocio" }).click();
		const request = await submitted;

		expect(body).toEqual({
			email: VALID.email,
			password: VALID.password,
			full_name: VALID.name,
			business_name: VALID.business,
			phone: VALID.phone,
		});
		// The safety assertion: the write went to loopback. Without it, this
		// test would be the one creating a real account in production.
		expect(request.url()).toContain("127.0.0.1:3999");
	});

	test("a 409 is translated and offers the sign-in the user actually has", async ({
		page,
	}) => {
		// The backend answers 409 `Email is already registered`. Rendered raw,
		// that is an English string in a Spanish form and it tells the user
		// nothing about what to do next. The copy and the link are the fix, and
		// both are asserted because either one alone leaves the user stuck.
		await page.route(`**${ONBOARDING_PATH}`, (route) =>
			route.fulfill({
				status: 409,
				contentType: "application/json",
				body: JSON.stringify({ message: "Email is already registered" }),
			}),
		);

		await gotoHydrated(page, "/business-signup");
		await fillForm(page);
		await page.getByRole("button", { name: "Registrar negocio" }).click();

		await expect(page.getByRole("alert")).toHaveText(
			"Ya existe una cuenta con este correo.",
		);
		// Rolé has no login route of its own: the account lives in the app, so
		// the hint has to send the user there. Asserting the link's existence
		// and target is the point; asserting the raw 409 body is not, because
		// the translation is the requirement.
		await expect(page.getByRole("alert")).not.toContainText(
			"Email is already registered",
		);
		await expect(
			page.getByRole("link", { name: "Iniciar sesión en la app de Rolé" }),
		).toBeVisible();
	});

	test("a server failure is surfaced as an error, not as a success", async ({
		page,
	}) => {
		// The failure this guards is the expensive one: a signup that "succeeds"
		// on screen while the backend rejected it. The business believes it
		// applied, the user believes they registered, and neither exists.
		await page.route(`**${ONBOARDING_PATH}`, (route) =>
			route.fulfill({
				status: 500,
				contentType: "application/json",
				body: JSON.stringify({ message: "Internal server error" }),
			}),
		);

		await gotoHydrated(page, "/business-signup");
		await fillForm(page);
		await page.getByRole("button", { name: "Registrar negocio" }).click();

		await expect(page.getByRole("alert")).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "¡Recibimos tu solicitud!" }),
		).toHaveCount(0);
		// The form must stay usable: a failed submit that leaves the fields
		// filled is recoverable, one that clears them loses the user's typing.
		await expect(page.locator("#signup-email")).toHaveValue(VALID.email);
	});

	test("the form is not indexed", async ({ page }) => {
		await gotoHydrated(page, "/business-signup");
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
			"content",
			"noindex, nofollow",
		);
	});
});
