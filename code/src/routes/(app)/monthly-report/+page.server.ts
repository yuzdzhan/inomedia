import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { checklist, loadMonth } from '$lib/server/monthly-report';
import type { PageServerLoad } from './$types';

function previousMonth() {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();
	if (user.role !== 'admin' && user.role !== 'accountant') {
		redirect(302, '/dashboard');
	}
	const company = await db.company.findFirst({ select: { id: true } });
	if (!company) redirect(302, '/bootstrap');

	const param = url.searchParams.get('month');
	const month = param && /^\d{4}-\d{2}$/.test(param) ? param : previousMonth();
	const data = await loadMonth(company.id, month);

	return {
		month,
		status: checklist(data),
		counts: {
			bankRows: data.bankRows.length,
			cashEntries: data.cashEntries.length,
			issuedInvoices: data.issuedInvoices.length
		},
		balances: { bank: data.bank, cash: data.cash }
	};
};
