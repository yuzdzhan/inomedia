import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

function canViewExpenseReports(role: string) {
	return role === 'admin' || role === 'accountant' || role === 'manager';
}

async function getCompanyOrRedirect() {
	const company = await db.company.findFirst({ select: { id: true, currency: true } });
	if (!company) {
		redirect(302, '/bootstrap');
	}
	return company;
}

async function getManagedProjectIds(userId: string): Promise<string[]> {
	const projects = await db.project.findMany({
		where: {
			OR: [
				{ primaryManagerUserId: userId },
				{ members: { some: { userId } } }
			]
		},
		select: { id: true }
	});
	return projects.map((p) => p.id);
}

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();

	if (!canViewExpenseReports(user.role)) {
		redirect(302, '/dashboard');
	}

	const company = await getCompanyOrRedirect();

	// Filters from URL params
	const dateFrom = url.searchParams.get('dateFrom') ?? '';
	const dateTo = url.searchParams.get('dateTo') ?? '';
	const categoryId = url.searchParams.get('categoryId') ?? '';
	const projectId = url.searchParams.get('projectId') ?? '';
	const clientId = url.searchParams.get('clientId') ?? '';

	// Role-based project scoping for managers
	let managedProjectIds: string[] | null = null;
	if (user.role === 'manager') {
		managedProjectIds = await getManagedProjectIds(user.id);
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const in90Days = new Date(today);
	in90Days.setDate(in90Days.getDate() + 90);

	// Build date filter for actual expenses (incurredDate <= today)
	const actualDateFilter = {
		incurredDate: {
			lte: today,
			...(dateFrom ? { gte: new Date(dateFrom) } : {}),
			...(dateTo ? { lte: new Date(dateTo) < today ? new Date(dateTo) : today } : {})
		}
	};

	// Project scope filter
	const projectScopeFilter =
		projectId
			? { projectId }
			: managedProjectIds !== null
				? { projectId: { in: managedProjectIds } }
				: {};

	const categoryFilter = categoryId ? { categoryId } : {};

	// Client filter (only for admin/accountant)
	const clientFilter =
		clientId && user.role !== 'manager' ? { clientId } : {};

	const baseActualFilter = {
		companyId: company.id,
		...actualDateFilter,
		...projectScopeFilter,
		...categoryFilter,
		...clientFilter
	};

	// Actual expenses list
	const actualExpenses = await db.expense.findMany({
		where: baseActualFilter,
		orderBy: [{ incurredDate: 'desc' }, { createdAt: 'desc' }],
		select: {
			id: true,
			description: true,
			amountCents: true,
			incurredDate: true,
			status: true,
			isFromTemplate: true,
			category: { select: { id: true, name: true } },
			project: { select: { id: true, name: true } },
			client: { select: { id: true, legalName: true } }
		}
	});

	// Summary aggregates
	const totalActualCents = actualExpenses.reduce((sum, e) => sum + e.amountCents, 0);
	const unpaidActualCents = actualExpenses
		.filter((e) => e.status === 'unpaid')
		.reduce((sum, e) => sum + e.amountCents, 0);

	// By-category breakdown
	type CategoryBreakdown = {
		categoryId: string;
		categoryName: string;
		count: number;
		totalCents: number;
	};
	const categoryMap = new Map<string, CategoryBreakdown>();
	for (const exp of actualExpenses) {
		const existing = categoryMap.get(exp.category.id);
		if (existing) {
			existing.count += 1;
			existing.totalCents += exp.amountCents;
		} else {
			categoryMap.set(exp.category.id, {
				categoryId: exp.category.id,
				categoryName: exp.category.name,
				count: 1,
				totalCents: exp.amountCents
			});
		}
	}
	const categoryBreakdown = [...categoryMap.values()].sort((a, b) =>
		a.categoryName.localeCompare(b.categoryName, 'bg')
	);

	// Upcoming recurring expenses (next 90 days)
	const recurringProjectFilter =
		projectId
			? { projectId }
			: managedProjectIds !== null
				? { projectId: { in: managedProjectIds } }
				: {};

	const upcomingRecurring = await db.expense.findMany({
		where: {
			companyId: company.id,
			isFromTemplate: true,
			status: 'unpaid',
			incurredDate: {
				gt: today,
				lte: in90Days
			},
			...recurringProjectFilter,
			...(categoryId ? { categoryId } : {}),
			...(clientId && user.role !== 'manager' ? { clientId } : {})
		},
		orderBy: { incurredDate: 'asc' },
		select: {
			id: true,
			description: true,
			amountCents: true,
			incurredDate: true,
			category: { select: { id: true, name: true } },
			project: { select: { id: true, name: true } },
			client: { select: { id: true, legalName: true } }
		}
	});

	// Forecast: upcoming recurring totals for next 30/60/90 days
	const in30Days = new Date(today);
	in30Days.setDate(in30Days.getDate() + 30);
	const in60Days = new Date(today);
	in60Days.setDate(in60Days.getDate() + 60);

	const forecast30Cents = upcomingRecurring
		.filter((e) => new Date(e.incurredDate) <= in30Days)
		.reduce((sum, e) => sum + e.amountCents, 0);
	const forecast60Cents = upcomingRecurring
		.filter((e) => new Date(e.incurredDate) <= in60Days)
		.reduce((sum, e) => sum + e.amountCents, 0);
	const forecast90Cents = upcomingRecurring.reduce((sum, e) => sum + e.amountCents, 0);

	// Labor cost: TaskTimeLogs in date range
	const laborLogs = await db.taskTimeLog.findMany({
		where: {
			workDate: {
				gte: dateFrom ? new Date(dateFrom) : new Date('2000-01-01'),
				lte: dateTo ? new Date(dateTo) : today
			},
			snapshotCostRateCents: { not: null },
			...(managedProjectIds !== null
				? {
						task: {
							taskList: {
								projectId: { in: managedProjectIds }
							}
						}
					}
				: {})
		},
		select: { durationMinutes: true, snapshotCostRateCents: true }
	});

	const laborCostCents = laborLogs.reduce((sum, log) => {
		return sum + Math.round((log.durationMinutes / 60) * (log.snapshotCostRateCents ?? 0));
	}, 0);
	const totalMinutes = laborLogs.reduce((sum, log) => sum + log.durationMinutes, 0);
	const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

	// Filter options
	const categories = await db.expenseCategory.findMany({
		where: { companyId: company.id, isActive: true },
		orderBy: { name: 'asc' },
		select: { id: true, name: true }
	});

	// Projects for filter: managers see only their projects
	const projects = await db.project.findMany({
		where: {
			...(managedProjectIds !== null
				? { id: { in: managedProjectIds } }
				: {})
		},
		orderBy: { name: 'asc' },
		select: { id: true, name: true, client: { select: { legalName: true } } }
	});

	// Clients for filter (admin/accountant only)
	const clients =
		user.role !== 'manager'
			? await db.client.findMany({
					where: { companyId: company.id },
					orderBy: { legalName: 'asc' },
					select: { id: true, legalName: true }
				})
			: [];

	return {
		filters: { dateFrom, dateTo, categoryId, projectId, clientId },
		summary: {
			totalActualCents,
			unpaidActualCents,
			laborCostCents,
			forecast30Cents
		},
		categoryBreakdown,
		actualExpenses,
		upcomingRecurring,
		labor: {
			totalHours,
			laborCostCents,
			canSeeDetail: user.role === 'admin' || user.role === 'accountant'
		},
		forecast: {
			days30: forecast30Cents,
			days60: forecast60Cents,
			days90: forecast90Cents
		},
		categories,
		projects,
		clients,
		currency: company.currency,
		isManager: user.role === 'manager',
		isAdminOrAccountant: user.role === 'admin' || user.role === 'accountant'
	};
};
