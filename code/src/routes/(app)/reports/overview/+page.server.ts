import { redirect, error, isHttpError, isRedirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { ensureMoneyContainers } from '$lib/server/ledger';
import type { PageServerLoad } from './$types';
import type { InvoiceStatus } from '@prisma/client';

function canView(role: string) {
	return role === 'admin' || role === 'accountant';
}

const MONTH_LABELS = ['яну', 'фев', 'мар', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'];
const MONTH_NAMES = ['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември'];
const ISSUED_STATUSES: InvoiceStatus[] = ['issued', 'partially_paid', 'paid', 'overdue'];

function buildMonthSlots(count: number) {
	const slots = [];
	const now = new Date();
	for (let i = count - 1; i >= 0; i--) {
		let yr = now.getFullYear();
		let mo = now.getMonth() + 1 - i;
		if (mo <= 0) { yr--; mo += 12; }
		const key = `${yr}-${String(mo).padStart(2, '0')}`;
		const label = `${MONTH_LABELS[mo - 1]} '${String(yr).slice(2)}`;
		slots.push({ key, label, year: yr, month: mo });
	}
	return slots;
}

export const load: PageServerLoad = async ({ parent }) => {
	try {
		const { user } = await parent();
		if (!canView(user.role)) redirect(302, '/dashboard');

		const company = await db.company.findFirst({
			select: { id: true, currency: true, vatRateBasisPoints: true, vatRegistered: true }
		});
		if (!company) redirect(302, '/bootstrap');

		const containers = await ensureMoneyContainers(company.id);
		const containerIds = containers.map((c) => c.id);
		const totalOpeningBalance = containers.reduce((sum, c) => sum + c.openingBalanceCents, 0);

		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth() + 1;
		const daysInMonth = new Date(year, month, 0).getDate();
		const daysElapsed = now.getDate();

		const monthStartISO = `${year}-${String(month).padStart(2, '0')}-01`;
		const nextYear = month === 12 ? year + 1 : year;
		const nextMonth = month === 12 ? 1 : month + 1;
		const nextMonthISO = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
		const monthStart = new Date(monthStartISO);
		const nextMonthStart = new Date(nextMonthISO);

		const monthSlots = buildMonthSlots(12);
		const twelveMonthsAgo = new Date(monthSlots[0].key + '-01');

		const [vatIssued, vatDrafts, revenueInvoices, allExpenses, invoiceGroups, allLedgerEntries, uninvoicedLogs] =
			await Promise.all([
				db.invoice.aggregate({
					where: {
						client: { companyId: company.id },
						status: { in: ISSUED_STATUSES },
						issueDate: { gte: monthStart, lt: nextMonthStart }
					},
					_sum: { vatTotalCents: true }
				}),
				db.invoice.aggregate({
					where: {
						client: { companyId: company.id },
						status: 'draft',
						createdAt: { gte: monthStart, lt: nextMonthStart }
					},
					_sum: { vatTotalCents: true }
				}),
				db.invoice.findMany({
					where: {
						client: { companyId: company.id },
						status: { in: ISSUED_STATUSES },
						issueDate: { gte: twelveMonthsAgo }
					},
					select: { issueDate: true, grossTotalCents: true }
				}),
				db.expense.findMany({
					where: { companyId: company.id, incurredDate: { gte: twelveMonthsAgo } },
					select: { incurredDate: true, amountCents: true, category: { select: { name: true } } }
				}),
				db.invoice.groupBy({
					by: ['status'],
					where: {
						client: { companyId: company.id },
						status: { in: ISSUED_STATUSES }
					},
					_sum: { grossTotalCents: true },
					_count: true
				}),
				db.ledgerEntry.findMany({
					where: { containerId: { in: containerIds } },
					select: { entryDate: true, amountCents: true },
					orderBy: { entryDate: 'asc' }
				}),
				db.taskTimeLog.findMany({
					where: {
						invoicedAt: null,
						snapshotBillableRateCents: { not: null, gt: 0 },
						task: {
							billingType: 'hourly',
							taskList: { project: { isBillable: true, client: { companyId: company.id } } }
						},
						workDate: { gte: twelveMonthsAgo }
					},
					select: { workDate: true, durationMinutes: true, snapshotBillableRateCents: true }
				})
			]);

		// VAT forecast
		const vatConfirmedCents = vatIssued._sum.vatTotalCents ?? 0;
		const vatDraftCents = vatDrafts._sum.vatTotalCents ?? 0;
		const vatPotentialCents = vatConfirmedCents + vatDraftCents;
		const vatProjectedCents =
			daysElapsed > 0 ? Math.round((vatConfirmedCents / daysElapsed) * daysInMonth) : 0;

		// Monthly aggregations
		const revenueByMonth = new Map<string, number>();
		for (const inv of revenueInvoices) {
			if (!inv.issueDate) continue;
			const key = new Date(inv.issueDate).toISOString().slice(0, 7);
			revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + inv.grossTotalCents);
		}

		const expensesByMonth = new Map<string, number>();
		const expensesByCategory = new Map<string, number>();
		for (const exp of allExpenses) {
			const key = new Date(exp.incurredDate).toISOString().slice(0, 7);
			expensesByMonth.set(key, (expensesByMonth.get(key) ?? 0) + exp.amountCents);
			const name = exp.category.name;
			expensesByCategory.set(name, (expensesByCategory.get(name) ?? 0) + exp.amountCents);
		}

		const forecastByMonth = new Map<string, number>();
		for (const log of uninvoicedLogs) {
			const key = new Date(log.workDate).toISOString().slice(0, 7);
			const value = Math.round(((log.snapshotBillableRateCents ?? 0) * log.durationMinutes) / 60);
			forecastByMonth.set(key, (forecastByMonth.get(key) ?? 0) + value);
		}

		const monthlyData = monthSlots.map((slot) => ({
			month: slot.key,
			label: slot.label,
			revenueCents: revenueByMonth.get(slot.key) ?? 0,
			expensesCents: expensesByMonth.get(slot.key) ?? 0,
			netCents: (revenueByMonth.get(slot.key) ?? 0) - (expensesByMonth.get(slot.key) ?? 0),
			forecastUnbilledCents: forecastByMonth.get(slot.key) ?? 0
		}));

		const categoryBreakdown = [...expensesByCategory.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 8)
			.map(([name, totalCents]) => ({ name, totalCents }));

		const invoiceStatusData = invoiceGroups.map((g) => ({
			status: g.status as string,
			totalCents: g._sum.grossTotalCents ?? 0,
			count: g._count
		}));

		// Cash position: end-of-month balance for each slot
		const cashPositionData = monthSlots.map((slot) => {
			const lastDay = new Date(slot.year, slot.month, 0).getDate();
			const endOfMonth = new Date(`${slot.year}-${String(slot.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59Z`);
			const sum = allLedgerEntries
				.filter((e) => new Date(e.entryDate) <= endOfMonth)
				.reduce((s, e) => s + e.amountCents, 0);
			return { month: slot.key, label: slot.label, balanceCents: totalOpeningBalance + sum };
		});

		return {
			currency: company.currency,
			vatRegistered: company.vatRegistered,
			vat: {
				confirmedCents: vatConfirmedCents,
				draftCents: vatDraftCents,
				potentialCents: vatPotentialCents,
				projectedCents: vatProjectedCents,
				daysElapsed,
				daysInMonth,
				monthName: MONTH_NAMES[month - 1]
			},
			monthlyData,
			categoryBreakdown,
			invoiceStatusData,
			cashPositionData
		};
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане на данните.');
	}
};
