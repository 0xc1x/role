import { describe, expect, jest, test } from "bun:test";
import { fireEvent, render, screen } from "@/test-utils/dom";
import { StatusSwitch } from "../status-switch";

describe("StatusSwitch", () => {
	test("muestra Activo cuando checked", () => {
		render(<StatusSwitch checked onCheckedChange={() => {}} />);
		expect(screen.getByText("Activo")).toBeDefined();
		expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
			"true",
		);
	});

	test("muestra Inactivo cuando no checked", () => {
		render(<StatusSwitch checked={false} onCheckedChange={() => {}} />);
		expect(screen.getByText("Inactivo")).toBeDefined();
	});

	test("notifica el toggle", () => {
		const onCheckedChange = jest.fn();
		render(<StatusSwitch checked onCheckedChange={onCheckedChange} />);
		fireEvent.click(screen.getByRole("switch"));
		expect(onCheckedChange.mock.calls[0]?.[0]).toBe(false);
	});
});
