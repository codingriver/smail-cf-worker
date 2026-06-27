import Parser from "postal-mime";
import { canAccessAddress, requireApiAuth } from "~/utils/api-auth.server";
import { attachmentContentToArrayBuffer } from "~/utils/email-content.server";
import type { Route } from "./+types/api.email.attachment";

export async function loader({ request, params, context }: Route.LoaderArgs) {
	const { id, filename } = params;
	if (!id || !filename) {
		throw new Response("Not found", { status: 404 });
	}

	const d1 = context.cloudflare.env.D1;
	const r2 = context.cloudflare.env.R2;
	const auth = await requireApiAuth(request, context.cloudflare.env);

	const mail = await d1
		.prepare("SELECT * FROM emails WHERE id = ?")
		.bind(id)
		.first<{ to_address: string }>();
	if (!mail) {
		throw new Response("Not found", { status: 404 });
	}

	if (!canAccessAddress(auth, mail.to_address)) {
		throw new Response("Forbidden", { status: 403 });
	}

	const object = await r2.get(id);
	if (!object) {
		throw new Response("Not found", { status: 404 });
	}

	const parser = new Parser();
	const message = await parser.parse(object.body);

	const decodedFilename = decodeURIComponent(filename);
	const attachment = (message.attachments || []).find(
		(att: { filename?: string | null }) => att.filename === decodedFilename,
	);

	if (!attachment || !attachment.content) {
		throw new Response("Attachment not found", { status: 404 });
	}

	return new Response(attachmentContentToArrayBuffer(attachment.content), {
		headers: {
			"Content-Type": attachment.mimeType || "application/octet-stream",
			"Content-Disposition": `attachment; filename="${decodedFilename.replace(/"/g, '\\"')}"`,
		},
	});
}
