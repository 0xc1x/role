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
			className="h-96 w-full rounded-lg border bg-white"
		/>
	);
}
