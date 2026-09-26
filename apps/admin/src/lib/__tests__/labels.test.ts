import { describe, expect, test } from "bun:test";
import {
	businessVerificationLabel,
	emailSendStatusLabel,
	orderStatusLabel,
	payoutStatusLabel,
} from "../labels";

/**
 * A12: el back office es español. Mostrar `approved` o `paid` crudo obliga al
 * operador a traducir en la cabeza, y en una tabla de pagos un estado mal leído
 * es un estado mal pagado.
 */
describe("etiquetas de estado", () => {
	test("verificación de negocio", () => {
		expect(businessVerificationLabel("pending")).toBe("Pendiente");
		expect(businessVerificationLabel("approved")).toBe("Aprobado");
		expect(businessVerificationLabel("rejected")).toBe("Rechazado");
	});

	test("estado de corte de pago", () => {
		expect(payoutStatusLabel("pending")).toBe("Pendiente");
		expect(payoutStatusLabel("processing")).toBe("Procesando");
		expect(payoutStatusLabel("paid")).toBe("Pagado");
		expect(payoutStatusLabel("failed")).toBe("Fallido");
	});

	test("estado de envío de correo", () => {
		expect(emailSendStatusLabel("queued")).toBe("En cola");
		expect(emailSendStatusLabel("delivered")).toBe("Entregado");
		expect(emailSendStatusLabel("bounced")).toBe("Rebotado");
		expect(emailSendStatusLabel("complained")).toBe("Marcado como spam");
	});

	test("estado de orden", () => {
		expect(orderStatusLabel("pending")).toBe("Pendiente");
		expect(orderStatusLabel("confirmed")).toBe("Confirmada");
		expect(orderStatusLabel("ready_for_pickup")).toBe("Lista para recoger");
		expect(orderStatusLabel("picked_up")).toBe("Recogida");
		expect(orderStatusLabel("completed")).toBe("Completada");
		expect(orderStatusLabel("cancelled")).toBe("Cancelada");
		expect(orderStatusLabel("expired")).toBe("Vencida");
	});

	// Un valor fuera del contrato no se inventa: se muestra tal cual para que el
	// operador vea el dato real y no una etiqueta que miente.
	test("un valor desconocido se devuelve sin inventar traducción", () => {
		expect(businessVerificationLabel("archived")).toBe("archived");
		expect(payoutStatusLabel("on_hold")).toBe("on_hold");
		expect(orderStatusLabel("refunded")).toBe("refunded");
	});
});
