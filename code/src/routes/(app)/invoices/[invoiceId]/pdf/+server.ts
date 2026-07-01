import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

function canManageInvoices(role: string) {
	return role === 'admin' || role === 'accountant';
}

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user || !canManageInvoices(locals.user.role)) {
		throw error(403, 'Нямате права за тази операция.');
	}

	const invoice = await db.invoice.findFirst({
		where: {
			id: params.invoiceId,
			status: { not: 'draft' }
		},
		select: {
			issuedPdfBlob: true,
			issuedPdfContentType: true,
			issuedPdfFilename: true
		}
	});

	if (!invoice || !invoice.issuedPdfBlob || !invoice.issuedPdfContentType) {
		throw error(404, 'PDF файлът не е намерен.');
	}

	return new Response(invoice.issuedPdfBlob, {
		headers: {
			'content-type': invoice.issuedPdfContentType,
			'content-disposition': `inline; filename="${invoice.issuedPdfFilename ?? 'invoice.pdf'}"`
		}
	});
};
