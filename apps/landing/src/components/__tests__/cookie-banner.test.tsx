import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";

mock.module("@tanstack/react-router", () => ({
	Link: (props: { children?: React.ReactNode; to: string }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

import { CookieBanner } from "../cookie-banner";

beforeEach(() => {
	window.localStorage.clear();
	document.getElementById("role-google-fonts")?.remove();
});

afterEach(() => {
	cleanup();
	window.localStorage.clear();
	document.getElementById("role-google-fonts")?.remove();
});

describe("CookieBanner", () => {
	test("rejects non-essential resources and persists the rejection", async () => {
		render(<CookieBanner />);
		expect(
			await screen.findByRole("region", { name: "Aviso de cookies" }),
		).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));

		expect(window.localStorage.getItem("role-cookie-consent")).toBe("rejected");
		expect(document.getElementById("role-google-fonts")).toBeNull();
		await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
	});

	test("loads Google Fonts only after explicit acceptance", async () => {
		render(<CookieBanner />);
		fireEvent.click(
			await screen.findByRole("button", { name: "Aceptar y continuar" }),
		);

		expect(window.localStorage.getItem("role-cookie-consent")).toBe("accepted");
		expect(document.getElementById("role-google-fonts")).not.toBeNull();
	});
});
