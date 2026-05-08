import { redirect, error, isHttpError, isRedirect } from '@sveltejs/kit';
import type { InvoiceStatus } from '@prisma/client';
import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

function canViewBillingReports(role: string) {
	return role === 'admin' || role === 'accountant' || role === 'manager';
}

async function getCompanyOrRedirect() {
	const company = await db.company.findFirst({ select: { id: true, currency: true } });
	if (!company) {
		redirect(302, '/bootstrap');
	}
	return company;
}

async function getManagedClientIds(userId: string): Promise<string[]> {
	const projects = await db.project.findMany({
		where: {
			OR: [
				{ primaryManagerUserId: userId },
				{ members: { some: { userId } } }
			]
		},
		select: { clientId: true }
	});
	return [...new Set(projects.map((p) => p.clientId))];
}

export const load: PageServerLoad = async ({ parent, url }) => {
	try {
	const { user } = await parent();

	if (!canViewBillingReports(user.role)) {
		redirect(302, '/dashboard');
	}

	const company = await getCompanyOrRedirect();

	// Filters from URL params
	const dateFrom = url.searchParams.get('dateFrom') ?? '';
	const dateTo = url.searchParams.get('dateTo') ?? '';
	const clientId = url.searchParams.get('clientId') ?? '';
	const status = url.searchParams.get('status') ?? '';

	// Role-based client scoping
	let allowedClientIds: string[] | null = null;
	if (user.role === 'manager') {
		allowedClientIds = await getManagedClientIds(user.id);
	}

	// Build shared filters
	const issueDateFilter =
		dateFrom || dateTo
			? {
					issueDate: {
						...(dateFrom ? { gte: new Date(dateFrom) } : {}),
						...(dateTo ? { lte: new Date(dateTo) } : {})
					}
				}
			: {};

	const paymentDateFilter =
		dateFrom || dateTo
			? {
					paymentDate: {
						...(dateFrom ? { gte: new Date(dateFrom) } : {}),
						...(dateTo ? { lte: new Date(dateTo) } : {})
					}
				}
			: {};

	const clientFilter = clientId
		? { clientId }
		: allowedClientIds !== null
			? { clientId: { in: allowedClientIds } }
			: {};

	// Valid non-draft, non-voided statuses for issued revenue
	const nonDraftVoidedStatuses: InvoiceStatus[] = ['issued', 'partially_paid', 'paid', 'overdue'];
	const isValidStatus = nonDraftVoidedStatuses.includes(status as InvoiceStatus);
	const statusFilter: { status: InvoiceStatus | { in: InvoiceStatus[] } } =
		status && isValidStatus
			? { status: status as InvoiceStatus }
			: { status: { in: nonDraftVoidedStatuses } };

	// Summary aggregates
	const [issuedTotals, collectedTotals, overdueCount] = await Promise.all([
		db.invoice.aggregate({
			where: {
				...statusFilter,
				...issueDateFilter,
				...clientFilter
			},
			_sum: {
				grossTotalCents: true,
				paidTotalCents: true
			}
		}),
		db.invoicePayment.aggregate({
			where: {
				...paymentDateFilter,
				...(clientId
					? { invoice: { clientId } }
					: allowedClientIds !== null
						? { invoice: { clientId: { in: allowedClientIds } } }
						: {})
			},
			_sum: { amountCents: true }
		}),
		db.invoice.count({
			where: {
				status: 'overdue',
				...clientFilter
			}
		})
	]);

	const issuedGrossCents = issuedTotals._sum.grossTotalCents ?? 0;
	const collectedCents = collectedTotals._sum.amountCents ?? 0;
	const outstandingCents = issuedGrossCents - collectedCents;

	// Per-client breakdown
	const clientBreakdownInvoices = await db.invoice.findMany({
		where: {
			...statusFilter,
			...issueDateFilter,
			...clientFilter
		},
		select: {
			clientId: true,
			grossTotalCents: true,
			paidTotalCents: true,
			client: {
				select: { id: true, legalName: true }
			}
		}
	});

	type ClientBreakdown = {
		clientId: string;
		legalName: string;
		issuedCents: number;
		collectedCents: number;
		outstandingCents: number;
	};

	const clientMap = new Map<string, ClientBreakdown>();
	for (const inv of clientBreakdownInvoices) {
		const existing = clientMap.get(inv.clientId);
		if (existing) {
			existing.issuedCents += inv.grossTotalCents;
			existing.collectedCents += inv.paidTotalCents;
			existing.outstandingCents = existing.issuedCents - existing.collectedCents;
		} else {
			clientMap.set(inv.clientId, {
				clientId: inv.clientId,
				legalName: inv.client.legalName,
				issuedCents: inv.grossTotalCents,
				collectedCents: inv.paidTotalCents,
				outstandingCents: inv.grossTotalCents - inv.paidTotalCents
			});
		}
	}
	const clientBreakdown = [...clientMap.values()].sort((a, b) =>
		a.legalName.localeCompare(b.legalName, 'bg')
	);

	// Invoice list
	const invoices = await db.invoice.findMany({
		where: {
			...statusFilter,
			...issueDateFilter,
			...clientFilter
		},
		orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
		select: {
			id: true,
			invoiceNumber: true,
			issueDate: true,
			dueDate: true,
			status: true,
			grossTotalCents: true,
			paidTotalCents: true,
			client: { select: { id: true, legalName: true } }
		}
	});

	// Payment list
	const payments = await db.invoicePayment.findMany({
		where: {
			...paymentDateFilter,
			...(clientId
				? { invoice: { clientId } }
				: allowedClientIds !== null
					? { invoice: { clientId: { in: allowedClientIds } } }
					: {})
		},
		orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
		select: {
			id: true,
			amountCents: true,
			paymentDate: true,
			paymentMethod: true,
			notes: true,
			invoice: {
				select: {
					id: true,
					invoiceNumber: true,
					client: { select: { id: true, legalName: true } }
				}
			}
		}
	});

	// Client list for filter select
	const clients = await db.client.findMany({
		where: {
			companyId: company.id,
			...(allowedClientIds !== null ? { id: { in: allowedClientIds } } : {})
		},
		orderBy: { legalName: 'asc' },
		select: { id: true, legalName: true }
	});

	return {
		filters: { dateFrom, dateTo, clientId, status },
		summary: {
			issuedGrossCents,
			collectedCents,
			outstandingCents,
			overdueCount
		},
		clientBreakdown,
		invoices,
		payments,
		clients,
		currency: company.currency,
		isManager: user.role === 'manager'
	};
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане на данните.');
	}
};
