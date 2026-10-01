import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user || !['admin', 'accountant'].includes(locals.user.role)) error(403);
	const doc = await db.inboxDocument.findUnique({
		where: { id: params.documentId },
		select: { blob: true, filename: true, contentType: true }
	});
	if (!doc) error(404);
	return new Response(doc.blob, {
		headers: {
			'Content-Type': doc.contentType,
			'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`
		}
	});
};
