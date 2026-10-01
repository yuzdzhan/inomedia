import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import { syncCashOnDelivery } from '$lib/server/cod-sync';
import type { Actions, PageServerLoad } from './$types';

function canManage(role: string) {
	return role === 'admin' || role === 'accountant';
}

async function getCompanyOrRedirect() {
	const company = await db.company.findFirst({ select: { id: true } });
	if (!company) {
		redirect(302, '/bootstrap');
	}
	return company;
}

/** "2026-09" → first and last day of that month as YYYY-MM-DD. */
function monthRange(month: string) {
	const [y, m] = month.split('-').map(Number);
	const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
	return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

function previousMonth() {
	const now = new Date();
	const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
	return d.toISOString().slice(0, 7);
}

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();
	if (!canManage(user.role)) {
		redirect(302, '/dashboard');
	}
	const company = await getCompanyOrRedirect();

	const monthParam = url.searchParams.get('month');
	const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : previousMonth();
	const { from, to } = monthRange(month);

	const payouts = await db.courierPayout.findMany({
		where: {
			companyId: company.id,
			payoutDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) }
		},
		orderBy: [{ payoutDate: 'asc' }, { courier: 'asc' }],
		select: {
			id: true,
			courier: true,
			externalRef: true,
			payoutDate: true,
			amountCents: true,
			paidInCash: true,
			statementRow: {
				select: { id: true, statementId: true, transactionDate: true, description: true, amountCents: true }
			},
			lines: {
				orderBy: { waybillNumber: 'asc' },
				select: {
					id: true,
					waybillNumber: true,
					amountCents: true,
					deliveryDate: true,
					recipient: true,
					reference: true,
					kind: true,
					note: true,
					shopOrder: {
						select: {
							id: true,
							orderNumber: true,
							orderDate: true,
							customerName: true,
							totalCents: true,
							documentNumber: true,
							pdfFilename: true
						}
					}
				}
			}
		}
	});

	const lines = payouts.flatMap((p) => p.lines);
	return {
		month,
		payouts,
		summary: {
			payoutCount: payouts.length,
			unmatchedPayouts: payouts.filter((p) => !p.paidInCash && !p.statementRow).length,
			totalCents: payouts.reduce((s, p) => s + p.amountCents, 0),
			lineCount: lines.length,
			shopOrderLines: lines.filter((l) => l.kind === 'shop_order').length,
			otherLines: lines.filter((l) => l.kind === 'other').length,
			unresolvedLines: lines.filter((l) => l.kind === 'unresolved').length,
			missingPdf: lines.filter((l) => l.kind === 'shop_order' && !l.shopOrder?.pdfFilename).length
		}
	};
};

export const actions: Actions = {
	sync: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManage(locals.user.role)) {
			return fail(403, { error: 'Нямате права за тази операция.' });
		}
		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const month = String(formData.get('month') ?? '');
		if (!/^\d{4}-\d{2}$/.test(month)) {
			return fail(422, { error: 'Невалиден месец.' });
		}

		const { from, to } = monthRange(month);
		const result = await syncCashOnDelivery(company.id, locals.user.id, from, to);

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'cod_synced',
			entityType: 'courier_payout',
			entityId: month,
			newValueJson: result,
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return {
			success: `Изплащания: ${result.payouts}, поръчки: ${result.orders}, свързани пратки: ${result.linked}, съвпаднали с банката: ${result.matched}.`,
			warnings: result.errors
		};
	},

	resolveLine: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManage(locals.user.role)) {
			return fail(403, { error: 'Нямате права за тази операция.' });
		}
		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const lineId = String(formData.get('lineId') ?? '');
		const kind = String(formData.get('kind') ?? '');
		const note = String(formData.get('note') ?? '').trim();
		const orderNumber = String(formData.get('orderNumber') ?? '').trim().replace(/^#/, '');

		const line = await db.courierPayoutLine.findFirst({
			where: { id: lineId, payout: { companyId: company.id } },
			select: { id: true, kind: true, note: true, shopOrderId: true }
		});
		if (!line) {
			return fail(404, { error: 'Пратката не е намерена.' });
		}

		let data: { kind: 'unresolved' | 'shop_order' | 'other'; note: string | null; shopOrderId: string | null };
		if (kind === 'other') {
			if (!note) {
				return fail(422, { error: 'Опишете какъв е приходът.' });
			}
			data = { kind: 'other', note, shopOrderId: null };
		} else if (kind === 'shop_order') {
			const order = await db.shopOrder.findFirst({
				where: { companyId: company.id, orderNumber },
				select: { id: true }
			});
			if (!order) {
				return fail(404, { error: `Поръчка #${orderNumber} не е синхронизирана.` });
			}
			data = { kind: 'shop_order', note: note || null, shopOrderId: order.id };
		} else if (kind === 'unresolved') {
			data = { kind: 'unresolved', note: null, shopOrderId: null };
		} else {
			return fail(422, { error: 'Невалиден вид.' });
		}

		await db.courierPayoutLine.update({ where: { id: line.id }, data });

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'cod_line_resolved',
			entityType: 'courier_payout_line',
			entityId: line.id,
			oldValueJson: { kind: line.kind, note: line.note, shopOrderId: line.shopOrderId },
			newValueJson: data,
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { success: 'Пратката е обновена.' };
	}
};
