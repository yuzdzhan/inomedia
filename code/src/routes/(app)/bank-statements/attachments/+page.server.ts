import { redirect, error, isHttpError, isRedirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

function canManageStatements(role: string) {
	return role === 'admin' || role === 'accountant';
}

export const load: PageServerLoad = async ({ parent, url }) => {
	try {
		const { user } = await parent();
		if (!canManageStatements(user.role)) {
			redirect(302, '/dashboard');
		}

		const company = await db.company.findFirst({ select: { id: true } });
		if (!company) redirect(302, '/bootstrap');

		const monthParam = url.searchParams.get('month');
		let year: number, month: number;
		if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
			[year, month] = monthParam.split('-').map(Number);
		} else {
			const now = new Date();
			year = now.getFullYear();
			month = now.getMonth() + 1;
		}

		const startDate = new Date(year, month - 1, 1);
		const endDate = new Date(year, month, 0);

		const [incomes, expenses] = await Promise.all([
			db.standaloneIncome.findMany({
				where: { companyId: company.id, incomeDate: { gte: startDate, lte: endDate } },
				orderBy: { incomeDate: 'asc' },
				select: {
					id: true,
					incomeDate: true,
					description: true,
					source: true,
					amountCents: true,
					attachments: {
						select: { id: true, originalFilename: true },
						orderBy: { createdAt: 'asc' }
					}
				}
			}),
			db.expense.findMany({
				where: { companyId: company.id, incurredDate: { gte: startDate, lte: endDate } },
				orderBy: { incurredDate: 'asc' },
				select: {
					id: true,
					incurredDate: true,
					description: true,
					amountCents: true,
					category: { select: { name: true } },
					attachments: {
						select: { id: true, originalFilename: true },
						orderBy: { createdAt: 'asc' }
					}
				}
			})
		]);

		return {
			year,
			month,
			incomes: incomes.map((i) => ({
				id: i.id,
				date: i.incomeDate,
				description: i.description,
				source: i.source,
				amountCents: i.amountCents,
				attachments: i.attachments
			})),
			expenses: expenses.map((e) => ({
				id: e.id,
				date: e.incurredDate,
				description: e.description,
				categoryName: e.category.name,
				amountCents: e.amountCents,
				attachments: e.attachments
			}))
		};
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане на данните.');
	}
};
