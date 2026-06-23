import Parser, { type Attachment } from "postal-mime";
import { getSession } from "~/.server/session";
import { MAIL_RETENTION_MS } from "~/utils/mail-retention";
import type { Route } from "./+types/api.email.attachment";

function attachmentContentToUint8Array(content: Attachment["content"]): Uint8Array {
	if (typeof content === "string") {
		return new TextEncoder().encode(content);
	}
	return content instanceof Uint8Array ? content : new Uint8Array(content);
}

function attachmentContentToArrayBuffer(content: Attachment["content"]): ArrayBuffer {
	const bytes = attachmentContentToUint8Array(content);
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
	const { id, filename } = params;
	if (!id || !filename) {
		throw new Response("Not found", { status: 404 });
	}

	const d1 = context.cloudflare.env.D1;
	const r2 = context.cloudflare.env.R2;

	const mail = await d1
		.prepare("SELECT * FROM emails WHERE id = ?")
		.bind(id)
		.first<{ to_address: string }>();
	if (!mail) {
		throw new Response("Not found", { status: 404 });
	}

	const session = await getSession(request.headers.get("Cookie"));
	const addresses = session.get("addresses") || [];
	const addressIssuedAt = session.get("addressIssuedAt");
	const isAddressExpired =
		typeof addressIssuedAt === "number" &&
		Date.now() - addressIssuedAt >= MAIL_RETENTION_MS;
	if (isAddressExpired || !addresses.includes(mail.to_address)) {
		throw new Response("Unauthorized", { status: 403 });
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
