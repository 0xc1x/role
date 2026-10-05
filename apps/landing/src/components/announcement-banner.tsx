import type { Announcement } from "@0xc1x/role-commons";
import { Megaphone } from "lucide-react";

/**
 * Los avisos del operador, como una BANDA en el flujo de la página.
 *
 * ─── POR QUÉ EN EL FLUJO Y NO EN UN OVERLAY ───────────────────────────────────
 *
 * La landing existe para que alguien se suscriba. Un `fixed` sobre el fondo
 * —como el de cookies, que sí tiene que competir con el contenido porque su
 * contenido es un consentimiento— tapa el CTA y lo convierte en algo que hay
 * que cerrar primero. El aviso no es eso: se lee y se sigue bajando. Por eso va
 * como una fila más arriba del `<main>`, entre el navbar y el hero.
 *
 * ─── POR QUÉ `body` ES TEXTO Y NUNCA HTML ─────────────────────────────────────
 *
 * `body` lo escribe una persona en el formulario del panel y el contrato lo
 * declara `z.string()`: es texto, sin formato. Acá eso no es una convención, es
 * una frontera de seguridad, y es la diferencia entre esta landing y el móvil:
 * el `Text` de React Native no interpreta nada, pero ESTA página corre en un
 * navegador, donde un `<script>alert(1)</script>` pegado en el cuerpo del aviso
 * se ejecutaría.
 *
 * Por eso el título y el cuerpo entran al árbol como **nodo de texto** y no como
 * marcado. React escapa el contenido de un nodo de texto, así que lo que el
 * operador escribió aparece literal —`&lt;b&gt;` en el HTML servido, `<b>`
 * escrito en la pantalla— y el navegador no construye ningún elemento. Esa es
 * la garantía, y hay un test que la afirma por AUSENCIA: que no exista un
 * `<script>`, ni un `<b>`, ni un `<img onerror>` en lo que se pintó.
 *
 * DOS PROHIBICIONES ABSOLUTAS, para el que venga a "mejorar" el aviso:
 *
 *  1. NUNCA `dangerouslySetInnerHTML`. Es la puerta por la que un aviso pasa de
 *     ser texto a ser código, y no hay sanitizado que la vuelva segura.
 *  2. NUNCA markdown a HTML sin sanitizar. `marked()` o `remark` sobre un texto
 *     de un operador es XSS con dos funciones de por medio. Si algún día se
 *     quiere markdown, el sanitizado —y la decisión de qué etiquetas se
 *     permiten— es parte de ESE trabajo, con su propio test y su propia revisión;
 *     no es un afterthought de agregar acá un `dangerouslySetInnerHTML`. El bloque
 *     de este docblock es el lugar donde se escribe por qué no.
 *
 * ─── LO QUE EL BANNER NO DECIDE ───────────────────────────────────────────────
 *
 * `severity` no cambia ni un píxel acá, y `info` y `required` se pintan
 * EXACTAMENTE igual. El banner no es el canal del acknowledgement: eso vive en
 * el móvil, contra la tabla y su policy, y esta página no tiene ni sesión ni
 * forma de registrar que alguien entendió algo. Un rótulo de "obligatorio"
 * acá sería una promesa que la landing no puede cumplir —y para el anónimo ni
 * siquiera puede llegar: la policy corta los `required` sin `auth.uid()`.
 *
 * Tampoco decide cuál de varios avisos se muestra. Se pintan todos, en el orden
 * en que los manda la API —que los ordena por `priority desc, created_at desc`
 * — porque elegir uno sería inventar una regla de presentación que no existe en
 * ningún lado, y dejaría avisos publicados que nadie llega a ver.
 *
 * ─── POR QUÉ EL CUERPO NO SE TRUNCA ───────────────────────────────────────────
 *
 * El `body` llega a 2000 caracteres por el CHECK de la tabla y se pinta entero.
 * Un corte se decidiría sobre el TEXTO PLANO —nunca sobre markup, que acá no
 * existe— y por dos razones, en orden: truncar es dejar de publicar lo que el
 * operador escribió, y en un aviso `required` la parte que falta puede ser
 * justo la instrucción. Una banda que scrollea es un costo de diseño; un aviso
 * incompleto es información falsa.
 */
export function AnnouncementBanner({
	announcements,
}: {
	announcements: readonly Announcement[];
}) {
	// Sin avisos no hay banda. Devolver `null` y no una caja vacía: una franja
	// en blanco arriba de la página es ruido que alguien va a preguntar qué es.
	if (announcements.length === 0) return null;

	// `<section aria-label>` y no `<div role="region">`: el elemento semántico ES
	// la región, y con nombre accesible es un landmark — lo mismo que anuncia el
	// banner de cookies, sin el `role` escrito a mano.
	return (
		<section
			aria-label="Avisos de Rolé"
			className="border-b border-role-border bg-role-surface-muted"
		>
			<div className="mx-auto flex w-full max-w-6xl items-start gap-3 px-5 py-3 md:px-8">
				<span aria-hidden="true" className="mt-0.5 shrink-0 text-role-primary">
					<Megaphone className="h-4 w-4" />
				</span>
				<ul className="min-w-0 flex-1 space-y-2">
					{announcements.map((announcement) => (
						<li key={announcement.id}>
							<p className="font-heading text-sm font-bold text-role-foreground">
								{announcement.title}
							</p>
							{/*
							  Nodo de texto de React y nada más. `whitespace-pre-line`
							  conserva los saltos que el operador escribió —el `Text`
							  del móvil también los conserva, así que el mismo `body`
							  se ve igual en las dos superficies— y NO interpreta
							  nada: el navegador sigue viendo el `<b>` del operador
							  como los caracteres `<b>`.
							*/}
							<p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-role-muted-foreground">
								{announcement.body}
							</p>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
