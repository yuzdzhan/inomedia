import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user || !['admin', 'accountant'].includes(locals.user.role)) {
		error(403);
	}

	const order = await db.shopOrder.findUnique({
		where: { id: params.orderId },
		select: { orderNumber: true, pdfBlob: true }
	});
	if (!order?.pdfBlob) error(404);

	return new Response(order.pdfBlob, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(`inobags-${order.orderNumber}.pdf`)}`
		}
	});
};
