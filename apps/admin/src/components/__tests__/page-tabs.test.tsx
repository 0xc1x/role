import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@/test-utils/dom";
import { PageTabs, TabPanel } from "../page-tabs";

/**
 * A10: las pestañas declaraban `aria-controls={"panel-"+t}` contra paneles que
 * no existían (ni `id` ni `role`). Un lector de pantalla anunciaba pestañas que
 * no controlaban nada.
 */
const TABS = ["enviar", "plantillas", "historial", "dispositivos"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = {
	enviar: "Enviar",
	plantillas: "Plantillas",
	historial: "Historial",
	dispositivos: "Dispositivos",
};

function Console({ value }: { value: Tab }) {
	return (
		<div>
			<PageTabs
				tabs={TABS}
				labels={LABELS}
				value={value}
				onChange={() => undefined}
			/>
			<div className="mt-6 space-y-6">
				{TABS.map((t) => (
					<TabPanel key={t} tab={t} active={t === value}>
						<p>{`contenido de ${t}`}</p>
					</TabPanel>
				))}
			</div>
		</div>
	);
}

afterEach(cleanup);

describe("consola de pestañas", () => {
	test("cada pestaña controla un panel que existe de verdad", () => {
		render(<Console value="enviar" />);

		const tabs = screen.getAllByRole("tab");
		expect(tabs).toHaveLength(TABS.length);

		for (const tab of tabs) {
			const controls = tab.getAttribute("aria-controls");
			expect(controls).toBeTruthy();
			const panel = document.getElementById(controls as string);
			expect(panel).not.toBeNull();
			expect(panel?.getAttribute("role")).toBe("tabpanel");
			// El panel apunta de vuelta a su pestaña.
			expect(panel?.getAttribute("aria-labelledby")).toBe(
				tab.getAttribute("id"),
			);
		}
	});

	test("solo la pestaña activa está seleccionada y su panel visible", () => {
		render(<Console value="plantillas" />);

		const selected = screen
			.getAllByRole("tab")
			.filter((t) => t.getAttribute("aria-selected") === "true");
		expect(selected).toHaveLength(1);
		expect(selected[0]?.textContent).toBe("Plantillas");

		expect(
			document.getElementById("panel-plantillas")?.hasAttribute("hidden"),
		).toBe(false);
		expect(
			document.getElementById("panel-enviar")?.hasAttribute("hidden"),
		).toBe(true);
	});
});
