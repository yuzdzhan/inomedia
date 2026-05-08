import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

function contentDisposition(filename: string): string {
	const encoded = encodeURIComponent(filename);
	return `inline; filename*=UTF-8''${encoded}`;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user || !['admin', 'accountant'].includes(locals.user.role)) {
		error(403);
	}

	const { type, id } = params;
	const company = await db.company.findFirst({ select: { id: true } });
	if (!company) error(404);

	if (type === 'income') {
		const att = await db.standaloneIncomeAttachment.findFirst({
			where: { id, standaloneIncome: { companyId: company.id } },
			select: { blob: true, originalFilename: true, contentType: true }
		});
		if (!att) error(404);
		return new Response(att.blob, {
			headers: {
				'Content-Type': att.contentType,
				'Content-Disposition': contentDisposition(att.originalFilename)
			}
		});
	}

	if (type === 'expense') {
		const att = await db.expenseAttachment.findFirst({
			where: { id, expense: { companyId: company.id } },
			select: { blob: true, originalFilename: true, contentType: true }
		});
		if (!att) error(404);
		return new Response(att.blob, {
			headers: {
				'Content-Type': att.contentType,
				'Content-Disposition': contentDisposition(att.originalFilename)
			}
		});
	}

	error(400, 'Invalid type');
};
