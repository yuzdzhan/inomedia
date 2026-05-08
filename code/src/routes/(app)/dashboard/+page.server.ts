import { error, isHttpError, isRedirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	try {
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
		overdueInvoiceAggregate,
		statementMatchCounts,
		recentAuditEvents,
		activeProjectsList,
		unpaidInvoicesList,
		recentBankRows,
		monthlyIncomeEntries,
		uninvoicedTimeLogs,
		uninvoicedFlatFeeTasks
	] = await Promise.all([
		db.invoice.aggregate({
			where: { status: 'overdue' },
			_sum: { grossTotalCents: true, paidTotalCents: true },
			_count: { _all: true }
		}),
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
				entryType: { in: ['invoice_payment', 'standalone_income', 'generic_credit'] }
			},
			select: { amountCents: true }
		}),
		db.taskTimeLog.findMany({
			where: {
				invoicedAt: null,
				task: {
					billingType: 'hourly',
					taskList: { project: { isBillable: true, ...(company ? { client: { companyId: company.id } } : {}) } }
				}
			},
			select: {
				durationMinutes: true,
				snapshotBillableRateCents: true,
				task: { select: { taskList: { select: { project: { select: { client: { select: { id: true, legalName: true } } } } } } } }
			}
		}),
		db.task.findMany({
			where: {
				billingType: 'flat_fee',
				flatFeeAmountCents: { gt: 0 },
				invoiceSelections: { none: {} },
				taskList: { project: { isBillable: true, ...(company ? { client: { companyId: company.id } } : {}) } }
			},
			select: {
				flatFeeAmountCents: true,
				taskList: { select: { project: { select: { client: { select: { id: true, legalName: true } } } } } }
			}
		})
	]);

	const clientAmounts = new Map<string, { legalName: string; totalCents: number }>();
	for (const log of uninvoicedTimeLogs) {
		const client = log.task.taskList.project.client;
		const cents = Math.round(((log.snapshotBillableRateCents ?? 0) * log.durationMinutes) / 60);
		if (cents <= 0) continue;
		const prev = clientAmounts.get(client.id) ?? { legalName: client.legalName, totalCents: 0 };
		clientAmounts.set(client.id, { legalName: client.legalName, totalCents: prev.totalCents + cents });
	}
	for (const task of uninvoicedFlatFeeTasks) {
		const client = task.taskList.project.client;
		const cents = task.flatFeeAmountCents ?? 0;
		if (cents <= 0) continue;
		const prev = clientAmounts.get(client.id) ?? { legalName: client.legalName, totalCents: 0 };
		clientAmounts.set(client.id, { legalName: client.legalName, totalCents: prev.totalCents + cents });
	}
	const uninvoicedByClient = [...clientAmounts.entries()]
		.map(([id, v]) => ({ id, legalName: v.legalName, totalAmountCents: v.totalCents }))
		.sort((a, b) => b.totalAmountCents - a.totalAmountCents);
	const uninvoicedTotalCents = uninvoicedByClient.reduce((s, c) => s + c.totalAmountCents, 0);

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

	const overdueAmountCents =
		(overdueInvoiceAggregate._sum.grossTotalCents ?? 0) -
		(overdueInvoiceAggregate._sum.paidTotalCents ?? 0);
	const overdueInvoiceCount = overdueInvoiceAggregate._count._all;

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
		overdueAmountCents,
		overdueInvoiceCount,
		cashBalanceCents,
		monthlyIncomeCents,
		balances,
		uninvoicedByClient,
		uninvoicedTotalCents,
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
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане на данните.');
	}
};
