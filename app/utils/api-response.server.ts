export function jsonNoStore<Data>(
	data: Data,
	init: ResponseInit = {},
): Response {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "application/json; charset=utf-8");
	headers.set("Cache-Control", "no-store");
	return new Response(JSON.stringify(data), {
		...init,
		headers,
	});
}

export function jsonError(message: string, status: number): Response {
	return jsonNoStore({ error: message }, { status });
}
