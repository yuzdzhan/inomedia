import { redirect, error, isHttpError, isRedirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { ensureMoneyContainers } from '$lib/server/ledger';
import type { PageServerLoad } from './$types';

function canViewCashPosition(role: string) {
	return role === 'admin' || role === 'accountant';
}

async function getCompanyOrRedirect() {
	const company = await db.company.findFirst({ select: { id: true } });
	if (!company) {
		redirect(302, '/bootstrap');
	}
	return company;
}

async function getBalanceAsOf(
	containerId: string,
	openingBalanceCents: number,
	asOfDate: Date
): Promise<number> {
	const entries = await db.ledgerEntry.aggregate({
		where: {
			containerId,
			entryDate: { lte: asOfDate }
		},
		_sum: { amountCents: true }
	});
	return openingBalanceCents + (entries._sum.amountCents ?? 0);
}

export const load: PageServerLoad = async ({ parent, url }) => {
	try {
	const { user } = await parent();
	if (!canViewCashPosition(user.role)) {
		redirect(302, '/dashboard');
	}

	const company = await getCompanyOrRedirect();
	const containers = await ensureMoneyContainers(company.id);

	// Parse URL params
	const today = new Date();
	const todayStr = today.toISOString().slice(0, 10);

	const asOfDateParam = url.searchParams.get('asOfDate') ?? todayStr;
	const dateFromParam = url.searchParams.get('dateFrom') ?? '';
	const dateToParam = url.searchParams.get('dateTo') ?? todayStr;

	// Build "as of" date (end of day)
	const asOfDate = new Date(asOfDateParam);
	asOfDate.setHours(23, 59, 59, 999);

	// Build movement period dates
	const dateTo = new Date(dateToParam);
	dateTo.setHours(23, 59, 59, 999);

	const dateFrom = dateFromParam ? new Date(dateFromParam) : null;

	// Compute balances as-of for each container
	const bankContainer = containers.find((c) => c.containerType === 'bank');
	const cashboxContainer = containers.find((c) => c.containerType === 'cashbox');

	const [bankBalanceCents, cashboxBalanceCents] = await Promise.all([
		bankContainer
			? getBalanceAsOf(bankContainer.id, bankContainer.openingBalanceCents, asOfDate)
			: Promise.resolve(0),
		cashboxContainer
			? getBalanceAsOf(cashboxContainer.id, cashboxContainer.openingBalanceCents, asOfDate)
			: Promise.resolve(0)
	]);

	const combinedBalanceCents = bankBalanceCents + cashboxBalanceCents;

	// Movement breakdown: group by containerId + entryType for the period
	const containerIds = containers.map((c) => c.id);

	const movementWhere = {
		containerId: { in: containerIds },
		...(dateFrom || dateToParam
			? {
					entryDate: {
						...(dateFrom ? { gte: dateFrom } : {}),
						lte: dateTo
					}
				}
			: {})
	};

	const [movementSummary, ledgerEntries] = await Promise.all([
		db.ledgerEntry.groupBy({
			by: ['containerId', 'entryType'],
			where: movementWhere,
			_sum: { amountCents: true },
			_count: true
		}),
		db.ledgerEntry.findMany({
			where: movementWhere,
			orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
			include: {
				container: { select: { id: true, name: true, containerType: true } }
			}
		})
	]);

	// Compute opening balance (balance at start of dateFrom, i.e. balance as of dateFrom - 1 day)
	// We need this per container to compute running balance in the ledger table
	const openingBalances: Record<string, number> = {};
	if (dateFrom) {
		const dayBeforeDateFrom = new Date(dateFrom);
		dayBeforeDateFrom.setDate(dayBeforeDateFrom.getDate() - 1);
		dayBeforeDateFrom.setHours(23, 59, 59, 999);

		await Promise.all(
			containers.map(async (c) => {
				openingBalances[c.id] = await getBalanceAsOf(
					c.id,
					c.openingBalanceCents,
					dayBeforeDateFrom
				);
			})
		);
	} else {
		// No dateFrom: opening balance is the container's opening balance (no prior entries counted)
		for (const c of containers) {
			openingBalances[c.id] = c.openingBalanceCents;
		}
	}

	// Compute running balance per container, attached to each entry
	const runningBalances: Record<string, number> = { ...openingBalances };

	const ledgerEntriesWithRunningBalance = ledgerEntries.map((entry) => {
		const prevBalance = runningBalances[entry.containerId] ?? 0;
		const newBalance = prevBalance + entry.amountCents;
		runningBalances[entry.containerId] = newBalance;
		return {
			id: entry.id,
			entryDate: entry.entryDate,
			entryType: entry.entryType,
			description: entry.description,
			amountCents: entry.amountCents,
			containerId: entry.containerId,
			containerName: entry.container.name,
			containerType: entry.container.containerType,
			runningBalanceCents: newBalance
		};
	});

	// Enrich movement summary with container names
	const containerMap = Object.fromEntries(containers.map((c) => [c.id, c]));

	type MovementRow = {
		containerId: string;
		containerName: string;
		containerType: string;
		entryType: string;
		totalCents: number;
		count: number;
	};

	const movementRows: MovementRow[] = movementSummary.map((row) => ({
		containerId: row.containerId,
		containerName: containerMap[row.containerId]?.name ?? row.containerId,
		containerType: containerMap[row.containerId]?.containerType ?? '',
		entryType: row.entryType,
		totalCents: row._sum.amountCents ?? 0,
		count: row._count
	}));

	// Sort by container type then entry type
	movementRows.sort((a, b) => {
		if (a.containerType !== b.containerType) {
			return a.containerType.localeCompare(b.containerType);
		}
		return a.entryType.localeCompare(b.entryType);
	});

	return {
		bank: bankContainer
			? {
					...bankContainer,
					balanceCents: bankBalanceCents
				}
			: null,
		cashbox: cashboxContainer
			? {
					...cashboxContainer,
					balanceCents: cashboxBalanceCents
				}
			: null,
		combinedBalanceCents,
		movementRows,
		ledgerEntries: ledgerEntriesWithRunningBalance,
		openingBalances,
		filters: {
			asOfDate: asOfDateParam,
			dateFrom: dateFromParam,
			dateTo: dateToParam
		}
	};
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане на данните.');
	}
};
