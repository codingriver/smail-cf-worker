import { canAccessAddress, requireApiAuth } from "~/utils/api-auth.server";
import { jsonError, jsonNoStore } from "~/utils/api-response.server";
import type { Email } from "~/types/email";
import type { Route } from "./+types/api.emails";

function parseLimit(value: string | null): number {
	const limit = Number(value);
	if (!Number.isInteger(limit)) {
		return 100;
	}
	return Math.min(Math.max(limit, 1), 100);
}

async function getEmails(d1: D1Database, address: string, limit: number) {
	const { results } = await d1
		.prepare(
			"SELECT * FROM emails WHERE to_address = ? ORDER BY time DESC LIMIT ?",
		)
		.bind(address, limit)
		.all();
	return results as Email[];
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const auth = await requireApiAuth(request, context.cloudflare.env);
	const url = new URL(request.url);
	const requestedAddress = url.searchParams.get("address")?.trim();
	const limit = parseLimit(url.searchParams.get("limit"));

	let address = requestedAddress;
	if (!address && auth.role === "session") {
		address = auth.addresses[0];
	}

	if (!address) {
		return jsonError("address is required", 400);
	}
	if (!canAccessAddress(auth, address)) {
		return jsonError("Forbidden", 403);
	}

	return jsonNoStore({
		address,
		emails: await getEmails(context.cloudflare.env.D1, address, limit),
	});
}
