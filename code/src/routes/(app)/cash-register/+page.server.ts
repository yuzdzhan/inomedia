import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
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

/** WooCommerce statuses that never produce a receipt. */
const NON_SALE_STATUSES = ['cancelled', 'failed', 'refunded', 'pending', 'checkout-draft', 'trash'];

/** "426.50" / "426,50" → 42650; empty → 0. */
function toCents(value: FormDataEntryValue | null): number | null {
	const text = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
	if (text === '') return 0;
	const n = Number(text);
	return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const toDate = (value: FormDataEntryValue | null) => {
	const text = String(value ?? '');
	return /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00Z`) : null;
};

/**
 * What the register's turnover should be made of, for one period.
 * A receipt is issued for the goods only (the customer pays shipping to the
 * courier) when the order is marked completed, so shop orders count by their
 * completion date and without shipping.
 */
async function reconcile(companyId: string, from: Date, to: Date, cashSalesCents: number) {
	const toExclusive = new Date(to.getTime() + 86400_000);
	// Completion happens after creation; look back far enough to catch late completions.
	const candidates = await db.shopOrder.findMany({
		where: {
			companyId,
			orderDate: { gte: new Date(from.getTime() - 60 * 86400_000), lt: toExclusive },
			status: { notIn: NON_SALE_STATUSES }
		},
		select: { orderNumber: true, totalCents: true, rawJson: true, receiptDate: true }
	});
	const orders: Array<{ orderNumber: string; receiptDate: Date; goodsCents: number; receiptDateSet: boolean }> = [];
	for (const o of candidates) {
		const raw = o.rawJson as { date_completed?: string | null; shipping_total?: string; shipping_tax?: string };
		const receiptDate =
			o.receiptDate ?? (raw.date_completed ? new Date(`${raw.date_completed.slice(0, 10)}T00:00:00Z`) : null);
		if (!receiptDate || receiptDate < from || receiptDate >= toExclusive) continue;
		const shipping = Math.round((parseFloat(raw.shipping_total ?? '0') + parseFloat(raw.shipping_tax ?? '0')) * 100);
		orders.push({ orderNumber: o.orderNumber, receiptDate, goodsCents: o.totalCents - shipping, receiptDateSet: Boolean(o.receiptDate) });
	}
	orders.sort((a, b) => a.receiptDate.getTime() - b.receiptDate.getTime());
	const shopOrdersCents = orders.reduce((sum, o) => sum + o.goodsCents, 0);
	const shopOrdersCount = orders.length;
	const handmadeCod = await db.courierPayoutLine.aggregate({
		where: { kind: 'other', payout: { companyId, payoutDate: { gte: from, lte: to } } },
		_sum: { amountCents: true },
		_count: true
	});
	const expected = shopOrdersCents + (handmadeCod._sum.amountCents ?? 0) + cashSalesCents;
	return {
		shopOrdersCents,
		shopOrdersCount,
		handmadeCodCents: handmadeCod._sum.amountCents ?? 0,
		handmadeCodCount: handmadeCod._count,
		cashSalesCents,
		expectedCents: expected,
		orders
	};
}

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!canManage(user.role)) {
		redirect(302, '/dashboard');
	}
	const company = await getCompanyOrRedirect();

	const reports = await db.cashRegisterReport.findMany({
		where: { companyId: company.id },
		orderBy: { periodFrom: 'desc' },
		select: {
			id: true,
			periodFrom: true,
			periodTo: true,
			deviceNumber: true,
			fiscalMemoryNumber: true,
			documentNumber: true,
			reportDate: true,
			firstZReport: true,
			lastZReport: true,
			lastReceiptNumber: true,
			turnoverACents: true,
			turnoverBCents: true,
			turnoverVCents: true,
			turnoverGCents: true,
			totalTurnoverCents: true,
			totalVatCents: true,
			stornoTurnoverCents: true,
			cashSalesCents: true,
			notes: true,
			attachmentFilename: true
		}
	});

	const withReconciliation = await Promise.all(
		reports.map(async (r) => ({
			...r,
			reconciliation: await reconcile(company.id, r.periodFrom, r.periodTo, r.cashSalesCents)
		}))
	);

	// Prefill the device from the latest report.
	const last = reports[0];
	return {
		reports: withReconciliation,
		defaults: {
			deviceNumber: last?.deviceNumber ?? '',
			fiscalMemoryNumber: last?.fiscalMemoryNumber ?? '',
			nextZReport: last?.lastZReport != null ? last.lastZReport + 1 : null
		}
	};
};

export const actions: Actions = {
	setReceiptDate: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManage(locals.user.role)) {
			return fail(403, { error: 'Нямате права за тази операция.' });
		}
		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const orderNumber = String(formData.get('orderNumber') ?? '').trim().replace(/^#/, '');
		const dateText = String(formData.get('receiptDate') ?? '');
		const receiptDate = dateText ? toDate(dateText) : null;
		if (dateText && !receiptDate) {
			return fail(422, { error: 'Невалидна дата.' });
		}

		const order = await db.shopOrder.findFirst({
			where: { companyId: company.id, orderNumber },
			select: { id: true, receiptDate: true }
		});
		if (!order) {
			return fail(404, { error: `Поръчка #${orderNumber} не е синхронизирана.` });
		}
		await db.shopOrder.update({ where: { id: order.id }, data: { receiptDate } });

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'shop_order_receipt_date_set',
			entityType: 'shop_order',
			entityId: order.id,
			oldValueJson: { receiptDate: order.receiptDate },
			newValueJson: { orderNumber, receiptDate },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { success: receiptDate ? `Датата на бележката за #${orderNumber} е записана.` : `Датата на бележката за #${orderNumber} е изчистена.` };
	},

	save: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManage(locals.user.role)) {
			return fail(403, { error: 'Нямате права за тази операция.' });
		}
		const company = await getCompanyOrRedirect();
		const formData = await request.formData();

		const periodFrom = toDate(formData.get('periodFrom'));
		const periodTo = toDate(formData.get('periodTo'));
		const reportDate = toDate(formData.get('reportDate'));
		const deviceNumber = String(formData.get('deviceNumber') ?? '').trim();
		const fiscalMemoryNumber = String(formData.get('fiscalMemoryNumber') ?? '').trim();
		const documentNumber = String(formData.get('documentNumber') ?? '').trim();
		if (!periodFrom || !periodTo || !reportDate || periodTo < periodFrom) {
			return fail(422, { error: 'Попълнете период и дата на отчета.' });
		}
		if (!deviceNumber || !fiscalMemoryNumber || !documentNumber) {
			return fail(422, { error: 'Попълнете № на ФУ, № на ФП и № на документа.' });
		}

		const money: Record<string, number> = {};
		for (const field of [
			'turnoverA', 'vatA', 'turnoverB', 'vatB', 'turnoverV', 'vatV', 'turnoverG', 'vatG',
			'stornoTurnover', 'stornoVat', 'cashSales'
		]) {
			const cents = toCents(formData.get(field));
			if (cents === null || cents < 0) {
				return fail(422, { error: `Невалидна сума в поле ${field}.` });
			}
			money[field] = cents;
		}
		const totalTurnoverCents = money.turnoverA + money.turnoverB + money.turnoverV + money.turnoverG;
		const totalVatCents = money.vatA + money.vatB + money.vatV + money.vatG;
		const enteredTotal = toCents(formData.get('totalTurnover'));
		if (enteredTotal && enteredTotal !== totalTurnoverCents) {
			return fail(422, {
				error: `Сборът по групи (${(totalTurnoverCents / 100).toFixed(2)}) не съвпада с общия оборот (${(enteredTotal / 100).toFixed(2)}).`
			});
		}

		const intOrNull = (v: FormDataEntryValue | null) => {
			const n = parseInt(String(v ?? ''), 10);
			return Number.isFinite(n) ? n : null;
		};
		const photo = formData.get('attachment');
		const file = photo instanceof File && photo.size > 0 ? photo : null;

		const cashbox = await db.moneyContainer.findUnique({
			where: { companyId_containerType: { companyId: company.id, containerType: 'cashbox' } },
			select: { id: true }
		});
		if (money.cashSales > 0 && !cashbox) {
			return fail(404, { error: 'Касата не е намерена. Моля, посетете Паричен поток първо.' });
		}

		const existing = await db.cashRegisterReport.findUnique({
			where: { companyId_periodFrom: { companyId: company.id, periodFrom } },
			select: { id: true, standaloneIncomeId: true }
		});

		const data = {
			periodTo,
			deviceNumber,
			fiscalMemoryNumber,
			documentNumber,
			reportDate,
			firstZReport: intOrNull(formData.get('firstZReport')),
			lastZReport: intOrNull(formData.get('lastZReport')),
			lastReceiptNumber: String(formData.get('lastReceiptNumber') ?? '').trim() || null,
			turnoverACents: money.turnoverA,
			vatACents: money.vatA,
			turnoverBCents: money.turnoverB,
			vatBCents: money.vatB,
			turnoverVCents: money.turnoverV,
			vatVCents: money.vatV,
			turnoverGCents: money.turnoverG,
			vatGCents: money.vatG,
			totalTurnoverCents,
			totalVatCents,
			stornoTurnoverCents: money.stornoTurnover,
			stornoVatCents: money.stornoVat,
			cashSalesCents: money.cashSales,
			notes: String(formData.get('notes') ?? '').trim() || null,
			...(file
				? {
						attachmentFilename: file.name,
						attachmentType: file.type || 'application/octet-stream',
						attachmentBlob: new Uint8Array(await file.arrayBuffer())
					}
				: {})
		};

		const period = `${periodFrom.toISOString().slice(0, 10)} – ${periodTo.toISOString().slice(0, 10)}`;
		const report = await db.$transaction(async (tx) => {
			// Re-book the cash sales income from scratch so edits stay consistent.
			if (existing?.standaloneIncomeId) {
				await tx.ledgerEntry.deleteMany({ where: { standaloneIncomeId: existing.standaloneIncomeId } });
				await tx.cashRegisterReport.update({ where: { id: existing.id }, data: { standaloneIncomeId: null } });
				await tx.standaloneIncome.delete({ where: { id: existing.standaloneIncomeId } });
			}

			let standaloneIncomeId: string | null = null;
			if (money.cashSales > 0 && cashbox) {
				const description = `Продажби в брой (ръчна изработка), касов апарат ${period}`;
				const income = await tx.standaloneIncome.create({
					data: {
						companyId: company.id,
						containerId: cashbox.id,
						description,
						amountCents: money.cashSales,
						incomeDate: periodTo,
						notes: `Отчет на ФП №${documentNumber}`,
						source: 'cash-register',
						createdByUserId: locals.user!.id
					}
				});
				await tx.ledgerEntry.create({
					data: {
						containerId: cashbox.id,
						entryType: 'standalone_income',
						amountCents: money.cashSales,
						entryDate: periodTo,
						description,
						standaloneIncomeId: income.id,
						createdByUserId: locals.user!.id
					}
				});
				standaloneIncomeId = income.id;
			}

			return existing
				? tx.cashRegisterReport.update({ where: { id: existing.id }, data: { ...data, standaloneIncomeId } })
				: tx.cashRegisterReport.create({
						data: { ...data, companyId: company.id, periodFrom, standaloneIncomeId, createdByUserId: locals.user!.id }
					});
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: existing ? 'cash_register_report_updated' : 'cash_register_report_created',
			entityType: 'cash_register_report',
			entityId: report.id,
			newValueJson: { period, documentNumber, totalTurnoverCents, totalVatCents, cashSalesCents: money.cashSales },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { success: existing ? 'Отчетът е обновен.' : 'Отчетът е записан.' };
	}
};
