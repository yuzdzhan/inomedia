import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	const company = await db.company.findFirst();

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	if (user.role === 'employee') {
		const assignedTasks = await db.task.findMany({
			where: {
				assignees: { some: { userId: user.id } },
				status: { in: ['todo', 'in_progress'] }
			},
			include: { taskList: { include: { project: { select: { name: true } } } } },
			orderBy: [{ deadlineDate: 'asc' }, { priority: 'desc' }],
			take: 10
		});
		const overdueTasks = await db.task.count({
			where: {
				assignees: { some: { userId: user.id } },
				status: { in: ['todo', 'in_progress'] },
				deadlineDate: { lt: today }
			}
		});
		const uninvoicedTimeLogs = await db.taskTimeLog.aggregate({
			where: { userId: user.id, invoicedAt: null },
			_sum: { durationMinutes: true },
			_count: true
		});
		return { role: user.role as 'employee', assignedTasks, overdueTasks, uninvoicedTimeLogs };
	}

	if (user.role === 'manager') {
		const managedProjects = await db.project.findMany({
			where: {
				OR: [
					{ primaryManagerUserId: user.id },
					{ members: { some: { userId: user.id } } }
				],
				status: 'active'
			},
			include: {
				client: { select: { legalName: true } },
				_count: { select: { taskLists: true } }
			},
			orderBy: { name: 'asc' },
			take: 10
		});
		const overdueTasks = await db.task.count({
			where: {
				taskList: {
					project: {
						OR: [
							{ primaryManagerUserId: user.id },
							{ members: { some: { userId: user.id } } }
						]
					}
				},
				status: { in: ['todo', 'in_progress'] },
				deadlineDate: { lt: today }
			}
		});
		const uninvoicedTaskCount = await db.task.count({
			where: {
				taskList: {
					project: {
						OR: [
							{ primaryManagerUserId: user.id },
							{ members: { some: { userId: user.id } } }
						]
					}
				},
				billingType: { in: ['hourly', 'flat_fee'] },
				status: { not: 'cancelled' },
				invoiceSelections: { none: {} }
			}
		});
		return { role: user.role as 'manager', managedProjects, overdueTasks, uninvoicedTaskCount };
	}

	if (user.role === 'accountant') {
		const unpaidInvoices = await db.invoice.findMany({
			where: { status: { in: ['issued', 'partially_paid', 'overdue'] } },
			select: {
				id: true,
				invoiceNumber: true,
				status: true,
				dueDate: true,
				grossTotalCents: true,
				paidTotalCents: true,
				client: { select: { legalName: true } }
			},
			orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
			take: 10
		});
		const upcomingExpenses = await db.expense.findMany({
			where: {
				isFromTemplate: true,
				status: 'unpaid',
				incurredDate: {
					gte: today,
					lte: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
				}
			},
			include: { category: { select: { name: true } } },
			orderBy: { incurredDate: 'asc' },
			take: 10
		});
		const statementReviewCount = await db.bankStatementRow.count({
			where: { matchState: { in: ['unmatched', 'needs_review'] } }
		});
		return {
			role: user.role as 'accountant',
			unpaidInvoices,
			upcomingExpenses,
			statementReviewCount
		};
	}

	// admin — combined view
	const [
		unpaidInvoicesCount,
		overdueTaskCount,
		unpaidExpensesCount,
		statementReviewCount,
		recentLedgerEntries
	] = await Promise.all([
		db.invoice.count({ where: { status: { in: ['issued', 'partially_paid', 'overdue'] } } }),
		db.task.count({
			where: { status: { in: ['todo', 'in_progress'] }, deadlineDate: { lt: today } }
		}),
		db.expense.count({ where: { status: 'unpaid' } }),
		db.bankStatementRow.count({
			where: { matchState: { in: ['unmatched', 'needs_review'] } }
		}),
		db.ledgerEntry.findMany({
			orderBy: { createdAt: 'desc' },
			take: 5,
			include: { container: { select: { name: true, containerType: true } } }
		})
	]);

	const containers = await db.moneyContainer.findMany({
		where: company ? { companyId: company.id } : {},
		include: { ledgerEntries: { select: { amountCents: true } } }
	});
	const balances = containers.map((c) => ({
		name: c.name,
		containerType: c.containerType,
		balance: c.openingBalanceCents + c.ledgerEntries.reduce((s, e) => s + e.amountCents, 0)
	}));

	return {
		role: user.role as 'admin',
		unpaidInvoicesCount,
		overdueTaskCount,
		unpaidExpensesCount,
		statementReviewCount,
		recentLedgerEntries,
		balances
	};
};
