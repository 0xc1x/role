/** Preview renderizado de un email (lienzo blanco intencional: los mails se diseñan sobre blanco). */
export function EmailPreview({
	html,
	title = "preview",
}: {
	html: string;
	title?: string;
}) {
	return (
		<iframe
			title={title}
			srcDoc={html}
			// Preview de HTML de mails: sin scripts ni acceso al parent.
			// Los estilos inline/<style> e imágenes siguen funcionando.
			sandbox=""
			className="h-96 w-full rounded-lg border bg-white"
		/>
	);
}
