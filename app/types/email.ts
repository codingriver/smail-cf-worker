export type Email = {
	id: string;
	to_address: string;
	from_name: string;
	from_address: string;
	subject: string;
	time: number;
};

export type AttachmentMeta = {
	filename: string;
	mimeType: string;
	size: number;
};

export type EmailDetail = Email & {
	body: string;
	attachments: AttachmentMeta[];
};
