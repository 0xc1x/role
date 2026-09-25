export function json(data: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			"Content-Type": "application/json",
			...init.headers,
		},
	});
}

export function badRequest(message: string, details?: unknown): Response {
	return json({ error: message, details }, { status: 400 });
}
