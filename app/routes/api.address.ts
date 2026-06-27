import { commitSession, getSession } from "~/.server/session";
import { jsonNoStore } from "~/utils/api-response.server";
import { generateEmailAddress } from "~/utils/mail";
import { MAIL_RETENTION_MS } from "~/utils/mail-retention";
import type { Route } from "./+types/api.address";

export async function loader({ request }: Route.LoaderArgs) {
	const session = await getSession(request.headers.get("Cookie"));
	const addresses = (session.get("addresses") || []) as string[];
	const addressIssuedAt = session.get("addressIssuedAt");
	return jsonNoStore({
		addresses,
		addressIssuedAt,
		expiresAt:
			typeof addressIssuedAt === "number"
				? addressIssuedAt + MAIL_RETENTION_MS
				: null,
	});
}

export async function action({ request }: Route.ActionArgs) {
	if (request.method !== "POST") {
		return jsonNoStore({ error: "Method not allowed" }, { status: 405 });
	}

	const session = await getSession(request.headers.get("Cookie"));
	const now = Date.now();
	const address = generateEmailAddress();
	session.set("addresses", [address]);
	session.set("addressIssuedAt", now);

	return jsonNoStore(
		{
			address,
			addresses: [address],
			addressIssuedAt: now,
			expiresAt: now + MAIL_RETENTION_MS,
		},
		{
			headers: {
				"Set-Cookie": await commitSession(session),
			},
		},
	);
}
