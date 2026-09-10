import { afterEach, describe, expect, jest, test } from "bun:test";
import { cleanup, fireEvent, render } from "@/test-utils/dom";
import { StatusSwitch } from "../status-switch";

describe("StatusSwitch", () => {
	// Queries acotadas al container de cada render + cleanup: los specs
	// comparten un solo document en el proceso de bun, y sin esto un
	// getByRole global encuentra switches de otros tests ("multiple
	// elements" según el orden de ejecución, así falla en CI).
	afterEach(() => {
		cleanup();
	});
	test("muestra Activo cuando checked", () => {
		const { getByRole, getByText } = render(
			<StatusSwitch checked onCheckedChange={() => {}} />,
		);
		expect(getByText("Activo")).toBeDefined();
		expect(getByRole("switch").getAttribute("aria-checked")).toBe("true");
	});

	test("muestra Inactivo cuando no checked", () => {
		const { getByText } = render(
			<StatusSwitch checked={false} onCheckedChange={() => {}} />,
		);
		expect(getByText("Inactivo")).toBeDefined();
	});

	test("notifica el toggle", () => {
		const onCheckedChange = jest.fn();
		const { getByRole } = render(
			<StatusSwitch checked onCheckedChange={onCheckedChange} />,
		);
		fireEvent.click(getByRole("switch"));
		expect(onCheckedChange.mock.calls[0]?.[0]).toBe(false);
	});
});
