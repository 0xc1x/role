export class ApiClientError extends Error {
	status: number;
	error?: string;
	details?: unknown;
	path?: string;

	constructor(opts: {
		status: number;
		message: string | string[];
		error?: string;
		details?: unknown;
		path?: string;
	}) {
		const msg = Array.isArray(opts.message)
			? opts.message.join(", ")
			: opts.message;
		super(msg);
		this.name = "ApiClientError";
		this.status = opts.status;
		this.error = opts.error;
		this.details = opts.details;
		this.path = opts.path;
	}
}

export async function throwFromResponse(response: Response): Promise<never> {
	let body: Record<string, unknown> = {};
	try {
		body = (await response.json()) as Record<string, unknown>;
	} catch {
		throw new ApiClientError({
			status: response.status,
			message: `Request failed with status ${response.status}`,
		});
	}
	throw new ApiClientError({
		status: response.status,
		message: (body.message as string | string[]) ?? "Unknown error",
		error: body.error as string | undefined,
		details: body.details,
		path: body.path as string | undefined,
	});
}
