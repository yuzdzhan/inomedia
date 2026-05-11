import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { PDFDocument } from 'pdf-lib';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user || !['admin', 'accountant'].includes(locals.user.role)) {
		error(403);
	}

	const company = await db.company.findFirst({ select: { id: true } });
	if (!company) error(404);

	// Expects: ?items=income:id1,expense:id2,...
	const itemsParam = url.searchParams.get('items');
	if (!itemsParam) error(400, 'Missing items');

	const items = itemsParam.split(',').map((s) => {
		const [type, id] = s.split(':');
		return { type, id };
	});

	const merged = await PDFDocument.create();

	for (const { type, id } of items) {
		let blob: Buffer | null = null;

		if (type === 'income') {
			const att = await db.standaloneIncomeAttachment.findFirst({
				where: { id, standaloneIncome: { companyId: company.id } },
				select: { blob: true, contentType: true }
			});
			if (att && att.contentType === 'application/pdf') blob = att.blob;
		} else if (type === 'expense') {
			const att = await db.expenseAttachment.findFirst({
				where: { id, expense: { companyId: company.id } },
				select: { blob: true, contentType: true }
			});
			if (att && att.contentType === 'application/pdf') blob = att.blob;
		}

		if (!blob) continue;

		try {
			const srcDoc = await PDFDocument.load(blob);
			const pageIndices = srcDoc.getPageIndices();
			const copiedPages = await merged.copyPages(srcDoc, pageIndices);
			copiedPages.forEach((page) => merged.addPage(page));
		} catch {
			// skip corrupt/unreadable PDFs
		}
	}

	const pdfBytes = await merged.save();

	return new Response(pdfBytes, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': 'inline; filename="attachments.pdf"'
		}
	});
};
