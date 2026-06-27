import Parser, { type Attachment } from "postal-mime";

export function attachmentContentToUint8Array(
	content: Attachment["content"],
): Uint8Array {
	if (typeof content === "string") {
		return new TextEncoder().encode(content);
	}
	return content instanceof Uint8Array ? content : new Uint8Array(content);
}

export function attachmentContentToArrayBuffer(
	content: Attachment["content"],
): ArrayBuffer {
	const bytes = attachmentContentToUint8Array(content);
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
}

export function attachmentContentToBase64(content: Attachment["content"]): string {
	const bytes = attachmentContentToUint8Array(content);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

export function replaceInlineImages(
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
		result = result.replace(
			new RegExp(
				`cid:["']?${cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?`,
				"gi",
			),
			dataUri,
		);
	}
	return result;
}

export function wrapEmailContent(content: string): string {
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

export async function parseStoredEmail(object: R2ObjectBody) {
	const parser = new Parser();
	const message = await parser.parse(object.body);
	const html = message.html || "";
	const text = message.text || "";
	const displayContent =
		html && message.attachments?.length
			? replaceInlineImages(html, message.attachments)
			: html || text;

	const attachments = (message.attachments || [])
		.filter((att) => att.disposition === "attachment")
		.map((att) => ({
			filename: att.filename || "unnamed",
			mimeType: att.mimeType || "application/octet-stream",
			size: attachmentContentToUint8Array(att.content).byteLength,
		}));

	return {
		body: wrapEmailContent(displayContent),
		html,
		text,
		attachments,
	};
}
