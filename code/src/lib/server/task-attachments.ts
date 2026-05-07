const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

const PREVIEWABLE_IMAGE_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/svg+xml',
	'image/bmp'
]);

const FALLBACK_CONTENT_TYPE = 'application/octet-stream';

export type PreparedAttachment = {
	originalFilename: string;
	contentType: string;
	sizeBytes: number;
	blob: Uint8Array;
};

function normalizeFilename(name: string) {
	return name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isPreviewableImageType(contentType: string | null | undefined) {
	return PREVIEWABLE_IMAGE_TYPES.has((contentType ?? '').toLowerCase());
}

export function formatAttachmentSize(sizeBytes: number) {
	if (sizeBytes < 1024) {
		return `${sizeBytes} B`;
	}

	if (sizeBytes < 1024 * 1024) {
		return `${(sizeBytes / 1024).toFixed(1)} KB`;
	}

	return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildAttachmentContentDisposition(filename: string, inline: boolean) {
	const sanitized = normalizeFilename(filename) || 'download';
	const utf8Name = encodeURIComponent(sanitized);
	const mode = inline ? 'inline' : 'attachment';
	return `${mode}; filename="${sanitized.replace(/"/g, "'")}"; filename*=UTF-8''${utf8Name}`;
}

export async function prepareAttachments(input: FormDataEntryValue[]) {
	const files = input.filter((entry): entry is File => entry instanceof File && entry.size > 0);
	const errors: string[] = [];
	const attachments: PreparedAttachment[] = [];

	for (const file of files) {
		const originalFilename = normalizeFilename(file.name);
		if (!originalFilename) {
			errors.push('Всеки файл трябва да има име.');
			continue;
		}

		if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
			errors.push(`Файлът "${originalFilename}" надвишава лимита от 10 MB.`);
			continue;
		}

		const arrayBuffer = await file.arrayBuffer();
		const blob = Uint8Array.from(new Uint8Array(arrayBuffer)) as Uint8Array<ArrayBuffer>;
		attachments.push({
			originalFilename,
			contentType: file.type || FALLBACK_CONTENT_TYPE,
			sizeBytes: file.size,
			blob
		});
	}

	return { attachments, errors };
}
