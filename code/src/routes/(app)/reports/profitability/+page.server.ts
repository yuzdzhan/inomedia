import { redirect, error, isHttpError, isRedirect } from '@sveltejs/kit';
import type { InvoiceStatus } from '@prisma/client';
import { db } from '$lib/server/db';

function canViewProfitability(role: string) {
	return role === 'admin' || role === 'accountant' || role === 'manager';
}

async function getCompanyOrRedirect() {
	const company = await db.company.findFirst({ select: { id: true, currency: true } });
	if (!company) {
		redirect(302, '/bootstrap');
	}
	return company;
}

async function getManagedScope(userId: string) {
	const projects = await db.project.findMany({
		where: {
			OR: [
				{ primaryManagerUserId: userId },
				{ members: { some: { userId } } }
			]
		},
		select: { id: true, clientId: true }
	});
	const managedProjectIds = projects.map((p) => p.id);
	const managedClientIds = [...new Set(projects.map((p) => p.clientId))];
	return { managedProjectIds, managedClientIds };
}

// Valid non-draft, non-voided statuses
const issuedStatuses: InvoiceStatus[] = ['issued', 'partially_paid', 'paid', 'overdue'];

export async function load({ parent, url }: { parent: () => Promise<{ user: { id: string; role: string } }>; url: URL }) {
	try {
	const { user } = await parent();

	if (!canViewProfitability(user.role)) {
		redirect(302, '/dashboard');
	}

	const company = await getCompanyOrRedirect();

	// URL params
	const dateFrom = url.searchParams.get('dateFrom') ?? '';
	const dateTo = url.searchParams.get('dateTo') ?? '';
	const scope = url.searchParams.get('scope') ?? 'company'; // company | client | project
	const filterClientId = url.searchParams.get('clientId') ?? '';

	// Manager scoping
	let managedProjectIds: string[] | null = null;
	let managedClientIds: string[] | null = null;
	if (user.role === 'manager') {
		const s = await getManagedScope(user.id);
		managedProjectIds = s.managedProjectIds;
		managedClientIds = s.managedClientIds;
	}

	// Date filter helpers
	const issueDateFilter =
		dateFrom || dateTo
			? {
					issueDate: {
						...(dateFrom ? { gte: new Date(dateFrom) } : {}),
						...(dateTo ? { lte: new Date(dateTo) } : {})
					}
				}
			: {};

	const workDateFilter =
		dateFrom || dateTo
			? {
					workDate: {
						...(dateFrom ? { gte: new Date(dateFrom) } : {}),
						...(dateTo ? { lte: new Date(dateTo) } : {})
					}
				}
			: {};

	const incurredDateFilter =
		dateFrom || dateTo
			? {
					incurredDate: {
						...(dateFrom ? { gte: new Date(dateFrom) } : {}),
						...(dateTo ? { lte: new Date(dateTo) } : {})
					}
				}
			: {};

	// ─── Company-level view ───────────────────────────────────────────────────
	if (scope === 'company') {
		const invoiceClientFilter =
			filterClientId
				? { clientId: filterClientId }
				: managedClientIds !== null
					? { clientId: { in: managedClientIds } }
					: {};

		// Revenue
		const revenueAgg = await db.invoice.aggregate({
			where: { status: { in: issuedStatuses }, ...issueDateFilter, ...invoiceClientFilter },
			_sum: { grossTotalCents: true }
		});
		const revenueCents = revenueAgg._sum?.grossTotalCents ?? 0;

		// Labor cost
		const laborLogs = await db.taskTimeLog.findMany({
			where: {
				...workDateFilter,
				snapshotCostRateCents: { not: null },
				...(managedProjectIds !== null
					? { task: { taskList: { projectId: { in: managedProjectIds } } } }
					: {})
			},
			select: { durationMinutes: true, snapshotCostRateCents: true }
		});
		const laborCostCents = laborLogs.reduce(
			(sum, l) => sum + Math.round((l.durationMinutes / 60) * (l.snapshotCostRateCents ?? 0)),
			0
		);

		// Direct expenses (linked to client or project, paid)
		const directExpAgg = await db.expense.aggregate({
			where: {
				companyId: company.id,
				status: 'paid',
				...incurredDateFilter,
				NOT: [{ clientId: null, projectId: null }],
				...(managedProjectIds !== null ? { projectId: { in: managedProjectIds } } : {})
			},
			_sum: { amountCents: true }
		});
		const directExpCents = directExpAgg._sum?.amountCents ?? 0;

		// Overhead (paid, no client, no project) — admin/accountant only
		let overheadCents = 0;
		if (user.role !== 'manager') {
			const overheadAgg = await db.expense.aggregate({
				where: {
					companyId: company.id,
					status: 'paid',
					clientId: null,
					projectId: null,
					...incurredDateFilter
				},
				_sum: { amountCents: true }
			});
			overheadCents = overheadAgg._sum?.amountCents ?? 0;
		}

		const profitabilityCents = revenueCents - laborCostCents - directExpCents;

		const clients = await db.client.findMany({
			where: {
				companyId: company.id,
				...(managedClientIds !== null ? { id: { in: managedClientIds } } : {})
			},
			orderBy: { legalName: 'asc' },
			select: { id: true, legalName: true }
		});

		return {
			scope: 'company' as const,
			filters: { dateFrom, dateTo, scope, clientId: filterClientId },
			company: { revenueCents, laborCostCents, directExpCents, overheadCents, profitabilityCents },
			clientRows: null,
			clientTotals: null,
			projectRows: null,
			projectTotals: null,
			clients,
			currency: company.currency,
			isManager: user.role === 'manager'
		};
	}

	// ─── Per-client view ──────────────────────────────────────────────────────
	if (scope === 'client') {
		const clientWhere =
			managedClientIds !== null
				? { companyId: company.id, id: { in: managedClientIds } }
				: { companyId: company.id };
		const allClients = await db.client.findMany({
			where: clientWhere,
			select: { id: true, legalName: true }
		});

		// Revenue per client (from invoices)
		const invoiceRows = await db.invoice.findMany({
			where: {
				status: { in: issuedStatuses },
				...issueDateFilter,
				...(managedClientIds !== null ? { clientId: { in: managedClientIds } } : {})
			},
			select: { clientId: true, grossTotalCents: true }
		});

		// Labor cost — need clientId via task->taskList->project
		const laborLogsFull = await db.taskTimeLog.findMany({
			where: {
				...workDateFilter,
				snapshotCostRateCents: { not: null },
				...(managedProjectIds !== null
					? { task: { taskList: { projectId: { in: managedProjectIds } } } }
					: {})
			},
			select: {
				durationMinutes: true,
				snapshotCostRateCents: true,
				task: {
					select: {
						taskList: { select: { project: { select: { clientId: true } } } }
					}
				}
			}
		});

		// Direct expenses per client
		const directExpFull = await db.expense.findMany({
			where: {
				companyId: company.id,
				status: 'paid',
				...incurredDateFilter,
				NOT: [{ clientId: null, projectId: null }],
				...(managedProjectIds !== null ? { projectId: { in: managedProjectIds } } : {})
			},
			select: { amountCents: true, clientId: true, projectId: true }
		});

		// Overhead for admin/accountant
		let overheadCents = 0;
		if (user.role !== 'manager') {
			const overheadAgg = await db.expense.aggregate({
				where: {
					companyId: company.id,
					status: 'paid',
					clientId: null,
					projectId: null,
					...incurredDateFilter
				},
				_sum: { amountCents: true }
			});
			overheadCents = overheadAgg._sum?.amountCents ?? 0;
		}

		// Project->client mapping for expenses with projectId only
		const projectClientMap = new Map<string, string>();
		const expWithProjectOnly = directExpFull.filter(
			(e) => e.clientId === null && e.projectId !== null
		);
		if (expWithProjectOnly.length > 0) {
			const projs = await db.project.findMany({
				where: { id: { in: expWithProjectOnly.map((e) => e.projectId as string) } },
				select: { id: true, clientId: true }
			});
			projs.forEach((p) => projectClientMap.set(p.id, p.clientId));
		}

		const revenueByClient = new Map<string, number>();
		const laborByClient = new Map<string, number>();
		const expByClient = new Map<string, number>();

		for (const inv of invoiceRows) {
			revenueByClient.set(inv.clientId, (revenueByClient.get(inv.clientId) ?? 0) + inv.grossTotalCents);
		}
		for (const log of laborLogsFull) {
			const cid = log.task.taskList.project.clientId;
			const cost = Math.round((log.durationMinutes / 60) * (log.snapshotCostRateCents ?? 0));
			laborByClient.set(cid, (laborByClient.get(cid) ?? 0) + cost);
		}
		for (const exp of directExpFull) {
			const cid = exp.clientId ?? (exp.projectId ? projectClientMap.get(exp.projectId) : null);
			if (cid) expByClient.set(cid, (expByClient.get(cid) ?? 0) + exp.amountCents);
		}

		const clientRows = allClients
			.map((c) => {
				const rev = revenueByClient.get(c.id) ?? 0;
				const labor = laborByClient.get(c.id) ?? 0;
				const exp = expByClient.get(c.id) ?? 0;
				return {
					clientId: c.id,
					legalName: c.legalName,
					revenueCents: rev,
					laborCostCents: labor,
					directExpCents: exp,
					profitabilityCents: rev - labor - exp
				};
			})
			.sort((a, b) => a.legalName.localeCompare(b.legalName, 'bg'));

		const totRevenue = clientRows.reduce((s, r) => s + r.revenueCents, 0);
		const totLabor = clientRows.reduce((s, r) => s + r.laborCostCents, 0);
		const totExp = clientRows.reduce((s, r) => s + r.directExpCents, 0);

		const clients = await db.client.findMany({
			where: {
				companyId: company.id,
				...(managedClientIds !== null ? { id: { in: managedClientIds } } : {})
			},
			orderBy: { legalName: 'asc' },
			select: { id: true, legalName: true }
		});

		return {
			scope: 'client' as const,
			filters: { dateFrom, dateTo, scope, clientId: filterClientId },
			company: null,
			clientRows,
			clientTotals: {
				revenueCents: totRevenue,
				laborCostCents: totLabor,
				directExpCents: totExp,
				profitabilityCents: totRevenue - totLabor - totExp,
				overheadCents
			},
			projectRows: null,
			projectTotals: null,
			clients,
			currency: company.currency,
			isManager: user.role === 'manager'
		};
	}

	// ─── Per-project view (default fallback) ─────────────────────────────────
	const projectWhere =
		managedProjectIds !== null
			? { id: { in: managedProjectIds } }
			: {};
	const projectWhereWithClient =
		filterClientId ? { ...projectWhere, clientId: filterClientId } : projectWhere;

	const allProjects = await db.project.findMany({
		where: projectWhereWithClient,
		select: { id: true, name: true, clientId: true, client: { select: { legalName: true } } },
		orderBy: { name: 'asc' }
	});

	const allProjectIds = allProjects.map((p) => p.id);

	// Revenue by project via invoice task selections
	const taskSelectionsRev = await db.invoiceTaskSelection.findMany({
		where: {
			invoice: { status: { in: issuedStatuses }, ...issueDateFilter },
			task: { taskList: { projectId: { in: allProjectIds } } }
		},
		select: {
			hourlyUninvoicedValueCents: true,
			flatFeeValueCents: true,
			task: { select: { taskList: { select: { projectId: true } } } }
		}
	});

	// Labor cost by project
	const laborLogsProj = await db.taskTimeLog.findMany({
		where: {
			...workDateFilter,
			snapshotCostRateCents: { not: null },
			task: { taskList: { projectId: { in: allProjectIds } } }
		},
		select: {
			durationMinutes: true,
			snapshotCostRateCents: true,
			task: { select: { taskList: { select: { projectId: true } } } }
		}
	});

	// Direct expenses by project
	const directExpProj = await db.expense.findMany({
		where: {
			companyId: company.id,
			status: 'paid',
			...incurredDateFilter,
			NOT: [{ clientId: null, projectId: null }],
			OR: [
				{ projectId: { in: allProjectIds } },
				...(filterClientId ? [{ clientId: filterClientId, projectId: null }] : [])
			]
		},
		select: { amountCents: true, clientId: true, projectId: true }
	});

	// Overhead for admin/accountant
	let overheadCentsProj = 0;
	if (user.role !== 'manager') {
		const overheadAgg = await db.expense.aggregate({
			where: {
				companyId: company.id,
				status: 'paid',
				clientId: null,
				projectId: null,
				...incurredDateFilter
			},
			_sum: { amountCents: true }
		});
		overheadCentsProj = overheadAgg._sum?.amountCents ?? 0;
	}

	const revenueByProject = new Map<string, number>();
	const laborByProject = new Map<string, number>();
	const expByProject = new Map<string, number>();

	for (const sel of taskSelectionsRev) {
		const pid = sel.task.taskList.projectId;
		const val = (sel.hourlyUninvoicedValueCents ?? 0) + (sel.flatFeeValueCents ?? 0);
		revenueByProject.set(pid, (revenueByProject.get(pid) ?? 0) + val);
	}
	for (const log of laborLogsProj) {
		const pid = log.task.taskList.projectId;
		const cost = Math.round((log.durationMinutes / 60) * (log.snapshotCostRateCents ?? 0));
		laborByProject.set(pid, (laborByProject.get(pid) ?? 0) + cost);
	}
	for (const exp of directExpProj) {
		if (exp.projectId && allProjectIds.includes(exp.projectId)) {
			expByProject.set(exp.projectId, (expByProject.get(exp.projectId) ?? 0) + exp.amountCents);
		}
	}

	const projectRows = allProjects.map((p) => {
		const rev = revenueByProject.get(p.id) ?? 0;
		const labor = laborByProject.get(p.id) ?? 0;
		const exp = expByProject.get(p.id) ?? 0;
		return {
			projectId: p.id,
			projectName: p.name,
			clientId: p.clientId,
			clientName: p.client.legalName,
			revenueCents: rev,
			laborCostCents: labor,
			directExpCents: exp,
			profitabilityCents: rev - labor - exp
		};
	});

	const totRevenue = projectRows.reduce((s, r) => s + r.revenueCents, 0);
	const totLabor = projectRows.reduce((s, r) => s + r.laborCostCents, 0);
	const totExp = projectRows.reduce((s, r) => s + r.directExpCents, 0);

	const clients = await db.client.findMany({
		where: {
			companyId: company.id,
			...(managedClientIds !== null ? { id: { in: managedClientIds } } : {})
		},
		orderBy: { legalName: 'asc' },
		select: { id: true, legalName: true }
	});

	return {
		scope: 'project' as const,
		filters: { dateFrom, dateTo, scope, clientId: filterClientId },
		company: null,
		clientRows: null,
		clientTotals: null,
		projectRows,
		projectTotals: {
			revenueCents: totRevenue,
			laborCostCents: totLabor,
			directExpCents: totExp,
			profitabilityCents: totRevenue - totLabor - totExp,
			overheadCents: overheadCentsProj
		},
		clients,
		currency: company.currency,
		isManager: user.role === 'manager'
	};
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане на данните.');
	}
}
