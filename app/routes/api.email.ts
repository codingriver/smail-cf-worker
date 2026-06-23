import Parser, { type Attachment } from "postal-mime";
import { getSession } from "~/.server/session";
import type { EmailDetail } from "~/types/email";
import { MAIL_RETENTION_MS } from "~/utils/mail-retention";
import type { Route } from "./+types/api.email";

function attachmentContentToUint8Array(content: Attachment["content"]): Uint8Array {
	if (typeof content === "string") {
		return new TextEncoder().encode(content);
	}
	return content instanceof Uint8Array ? content : new Uint8Array(content);
}

function attachmentContentToBase64(content: Attachment["content"]): string {
	const bytes = attachmentContentToUint8Array(content);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function replaceInlineImages(
	html: string,
	attachments: Attachment[],
): string {
	let result = html;
	for (const att of attachments) {
		if (att.disposition !== "inline" || !att.contentId || !att.content) {
			continue;
		}
		const cid = att.contentId.replace(/^<|>$/g, "");
		const base64 = attachmentContentToBase64(att.content);
		const dataUri = `data:${att.mimeType || "image/png"};base64,${base64}`;
		// Replace both cid:xxx and cid:"xxx" variants
		result = result.replace(
			new RegExp(`cid:["']?${cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?`, "gi"),
			dataUri,
		);
	}
	return result;
}

function wrapEmailContent(content: string): string {
	return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            margin: 16px;
            color: #333;
            background: white;
        }
        .email-content {
            max-width: 100%;
            word-wrap: break-word;
        }
        img {
            max-width: 100%;
            height: auto;
        }
        a {
            color: #2563eb;
        }
        blockquote {
            border-left: 4px solid #e5e7eb;
            margin: 1em 0;
            padding: 0 1em;
            color: #6b7280;
        }
        pre {
            background: #f3f4f6;
            padding: 1em;
            border-radius: 6px;
            overflow-x: auto;
            white-space: pre-wrap;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }
        th, td {
            border: 1px solid #e5e7eb;
            padding: 8px 12px;
            text-align: left;
        }
        th {
            background: #f9fafb;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="email-content">${content}</div>
</body>
</html>`;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
	const { id } = params;
	if (!id) {
		throw new Response("Not found", { status: 404 });
	}
	const d1 = context.cloudflare.env.D1;
	const r2 = context.cloudflare.env.R2;
	const mail = await d1
		.prepare("SELECT * FROM emails WHERE id = ?")
		.bind(id)
		.first<EmailDetail>();
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
	let content = message.html || message.text || "";

	// Replace inline CID images with base64 data URIs
	if (message.html && message.attachments?.length) {
		content = replaceInlineImages(content, message.attachments);
	}

	// Collect attachment metadata (excluding inline images shown in body)
	const attachments = (message.attachments || [])
		.filter((att) => att.disposition === "attachment")
		.map((att) => ({
			filename: att.filename || "unnamed",
			mimeType: att.mimeType || "application/octet-stream",
			size: attachmentContentToUint8Array(att.content).byteLength,
		}));

	return {
		body: wrapEmailContent(content),
		attachments,
	};
}
