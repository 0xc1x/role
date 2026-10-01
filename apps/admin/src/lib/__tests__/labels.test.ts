import { describe, expect, test } from "bun:test";
import {
	businessVerificationLabel,
	contactDeliveryStatusLabel,
	emailSendStatusLabel,
	orderStatusLabel,
	payoutStatusLabel,
	reviewModerationReasonLabel,
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

	test("estado de entrega de un mensaje de contacto", () => {
		// Estos valores ya vienen en español, pero se renombran igual: el
		// `delivery_status` de `app_store` lo mueve el camino público cuando se
		// ENTREGA el correo de aviso, no cuando alguien lee el mensaje.
		// "Pendiente" a secas haría leer la fila como "sin leer".
		expect(contactDeliveryStatusLabel("PENDIENTE")).toBe("Entrega pendiente");
		expect(contactDeliveryStatusLabel("PROCESADO")).toBe("Notificado");
		expect(contactDeliveryStatusLabel("ERROR")).toBe("Error");
	});

	test("motivo de moderación", () => {
		expect(reviewModerationReasonLabel("insults_or_hate_speech")).toBe(
			"Insultos, acoso o lenguaje de odio",
		);
		expect(reviewModerationReasonLabel("fake_or_unverified_purchase")).toBe(
			"Reseña falsa o que no corresponde a una reserva real",
		);
	});

	// Un valor fuera del contrato no se inventa: se muestra tal cual para que el
	// operador vea el dato real y no una etiqueta que miente.
	test("un valor desconocido se devuelve sin inventar traducción", () => {
		expect(businessVerificationLabel("archived")).toBe("archived");
		expect(payoutStatusLabel("on_hold")).toBe("on_hold");
		expect(orderStatusLabel("refunded")).toBe("refunded");
		expect(contactDeliveryStatusLabel("NUEVO")).toBe("NUEVO");
		// Un motivo retirado del contrato con reseñas ya moderadas es un caso
		// real, y "Desconocido" escondería que la fila dice algo que el panel ya
		// no sabe nombrar.
		expect(reviewModerationReasonLabel("motivo_retirado")).toBe(
			"motivo_retirado",
		);
	});
});
