import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user || !['admin', 'accountant'].includes(locals.user.role)) {
		error(403);
	}

	const report = await db.cashRegisterReport.findUnique({
		where: { id: params.reportId },
		select: { attachmentBlob: true, attachmentFilename: true, attachmentType: true }
	});
	if (!report?.attachmentBlob) error(404);

	return new Response(report.attachmentBlob, {
		headers: {
			'Content-Type': report.attachmentType ?? 'application/octet-stream',
			'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(report.attachmentFilename ?? 'otchet')}`
		}
	});
};
