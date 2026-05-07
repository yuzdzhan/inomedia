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
			include: { taskList: { include: { project: { select: { name: true, id: true } } } } },
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

	// admin — full dashboard
	const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

	const [
		overdueTaskCount,
		unpaidExpensesCount,
		statementMatchCounts,
		recentAuditEvents,
		activeProjectsList,
		unpaidInvoicesList,
		recentBankRows,
		monthlyIncomeEntries
	] = await Promise.all([
		db.task.count({
			where: { status: { in: ['todo', 'in_progress'] }, deadlineDate: { lt: today } }
		}),
		db.expense.count({ where: { status: 'unpaid' } }),
		db.bankStatementRow.groupBy({
			by: ['matchState'],
			_count: { _all: true }
		}),
		db.auditEvent.findMany({
			orderBy: { createdAt: 'desc' },
			take: 6,
			include: {
				actor: { select: { firstName: true, lastName: true } }
			}
		}),
		db.project.findMany({
			where: { status: 'active', ...(company ? { client: { companyId: company.id } } : {}) },
			select: {
				id: true,
				name: true,
				budgetAmountCents: true,
				client: { select: { legalName: true } },
				taskLists: {
					select: {
						tasks: {
							select: {
								timeLogs: { select: { durationMinutes: true } }
							}
						}
					}
				}
			},
			orderBy: { updatedAt: 'desc' },
			take: 6
		}),
		db.invoice.findMany({
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
			take: 6
		}),
		db.bankStatementRow.findMany({
			orderBy: { transactionDate: 'desc' },
			take: 5,
			select: {
				id: true,
				transactionDate: true,
				description: true,
				amountCents: true,
				matchState: true
			}
		}),
		db.ledgerEntry.findMany({
			where: {
				entryDate: { gte: startOfMonth },
				amountCents: { gt: 0 }
			},
			select: { amountCents: true }
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

	const cashBalanceCents = balances.reduce((s, b) => s + b.balance, 0);
	const monthlyIncomeCents = monthlyIncomeEntries.reduce((s, e) => s + e.amountCents, 0);

	const overdueInvoices = unpaidInvoicesList.filter((inv) => inv.status === 'overdue');
	const overdueAmountCents = overdueInvoices.reduce(
		(s, inv) => s + (inv.grossTotalCents - inv.paidTotalCents),
		0
	);

	const matchCountMap: Record<string, number> = {};
	for (const row of statementMatchCounts) {
		matchCountMap[String(row.matchState)] = row._count._all;
	}

	const activeProjects = activeProjectsList.map((p) => {
		const totalMinutes = p.taskLists
			.flatMap((tl) => tl.tasks)
			.flatMap((t) => t.timeLogs)
			.reduce((s, l) => s + l.durationMinutes, 0);
		const loggedHours = Math.round(totalMinutes / 60);
		const budgetHours = p.budgetAmountCents ? Math.round(p.budgetAmountCents / 10000) : null;
		const pct = budgetHours && budgetHours > 0 ? Math.min(Math.round((loggedHours / budgetHours) * 100), 100) : null;
		return {
			id: p.id,
			name: p.name,
			clientName: p.client.legalName,
			loggedHours,
			budgetHours,
			pct
		};
	});

	return {
		role: user.role as 'admin',
		firstName: user.firstName,
		overdueTaskCount,
		unpaidExpensesCount,
		overdueAmountCents,
		cashBalanceCents,
		monthlyIncomeCents,
		balances,
		activeProjects,
		unpaidInvoices: unpaidInvoicesList,
		recentBankRows,
		bankMatchCounts: {
			auto: matchCountMap['auto_matched'] ?? 0,
			review: matchCountMap['needs_review'] ?? 0,
			unmatched: matchCountMap['unmatched'] ?? 0
		},
		recentAuditEvents,
		recentLedgerEntries: []
	};
};
