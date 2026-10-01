import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import { buildMonthlyPackage } from '$lib/server/monthly-report';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, getClientAddress, request }) => {
	if (!locals.user || !['admin', 'accountant'].includes(locals.user.role)) {
		error(403);
	}
	if (!/^\d{4}-\d{2}$/.test(params.month)) error(400, 'Невалиден месец');
	const company = await db.company.findFirst({ select: { id: true } });
	if (!company) error(404);

	const pkg = await buildMonthlyPackage(company.id, params.month);

	await logAuditEvent({
		actorUserId: locals.user.id,
		eventType: 'monthly_report_downloaded',
		entityType: 'monthly_report',
		entityId: params.month,
		newValueJson: { documents: pkg.documents, bytes: pkg.zip.length },
		ipAddress: getClientAddress(),
		userAgent: request.headers.get('user-agent') ?? undefined
	});

	return new Response(pkg.zip, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(pkg.filename)}`
		}
	});
};
