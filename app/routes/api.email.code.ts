import { canAccessAddress, requireApiAuth } from "~/utils/api-auth.server";
import { jsonError, jsonNoStore } from "~/utils/api-response.server";
import { extractVerificationCodes } from "~/utils/code-extract";
import { parseStoredEmail } from "~/utils/email-content.server";
import type { EmailDetail } from "~/types/email";
import type { Route } from "./+types/api.email.code";

export async function loader({ request, params, context }: Route.LoaderArgs) {
	const { id } = params;
	if (!id) {
		return jsonError("Not found", 404);
	}

	const auth = await requireApiAuth(request, context.cloudflare.env);
	const mail = await context.cloudflare.env.D1.prepare(
		"SELECT * FROM emails WHERE id = ?",
	)
		.bind(id)
		.first<EmailDetail>();
	if (!mail) {
		return jsonError("Not found", 404);
	}
	if (!canAccessAddress(auth, mail.to_address)) {
		return jsonError("Forbidden", 403);
	}

	const object = await context.cloudflare.env.R2.get(id);
	if (!object) {
		return jsonError("Not found", 404);
	}

	const parsed = await parseStoredEmail(object);
	const url = new URL(request.url);
	const source = parsed.text || parsed.html || "";
	const candidates = extractVerificationCodes(source, url.searchParams.get("length"));

	return jsonNoStore({
		code: candidates[0] ?? null,
		candidates,
		source: parsed.text ? "text" : "html",
	});
}
