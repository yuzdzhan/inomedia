import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import { ensureMoneyContainers } from '$lib/server/ledger';
import type { Actions, PageServerLoad } from './$types';

function canManageFinances(role: string) {
	return role === 'admin' || role === 'accountant';
}

async function getCompanyOrRedirect() {
	const company = await db.company.findFirst({ select: { id: true } });
	if (!company) {
		redirect(302, '/bootstrap');
	}
	return company;
}

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();
	if (!canManageFinances(user.role)) {
		redirect(302, '/dashboard');
	}

	const company = await getCompanyOrRedirect();

	// Bootstrap containers if they don't exist yet
	const containers = await ensureMoneyContainers(company.id);

	// Load ledger entries for each container with aggregated balance
	const [bankContainer, cashboxContainer] = await Promise.all(
		containers.map(async (container) => {
			const aggregate = await db.ledgerEntry.aggregate({
				where: { containerId: container.id },
				_sum: { amountCents: true }
			});
			const sumCents = aggregate._sum.amountCents ?? 0;
			return {
				...container,
				currentBalanceCents: container.openingBalanceCents + sumCents
			};
		})
	);

	// Filters
	const filterContainerId = url.searchParams.get('containerId') ?? '';
	const filterEntryType = url.searchParams.get('entryType') ?? '';
	const filterDateFrom = url.searchParams.get('dateFrom') ?? '';
	const filterDateTo = url.searchParams.get('dateTo') ?? '';
	const filterSearch = url.searchParams.get('search') ?? '';

	const containerIds = containers.map((c) => c.id);
	const validEntryTypes = [
		'invoice_payment',
		'standalone_income',
		'expense_payment',
		'generic_credit',
		'generic_debit',
		'transfer_out',
		'transfer_in'
	] as const;
	type EntryType = (typeof validEntryTypes)[number];

	const entriesWhere: Record<string, unknown> = {
		containerId: filterContainerId && containerIds.includes(filterContainerId)
			? filterContainerId
			: { in: containerIds },
		...(filterEntryType && validEntryTypes.includes(filterEntryType as EntryType)
			? { entryType: filterEntryType as EntryType }
			: {}),
		...(filterDateFrom || filterDateTo
			? {
					entryDate: {
						...(filterDateFrom ? { gte: new Date(filterDateFrom) } : {}),
						...(filterDateTo ? { lte: new Date(filterDateTo) } : {})
					}
				}
			: {}),
		...(filterSearch
			? { description: { contains: filterSearch, mode: 'insensitive' } }
			: {})
	};

	const recentEntries = await db.ledgerEntry.findMany({
		where: entriesWhere,
		orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
		take: 50,
		include: {
			container: { select: { id: true, name: true, containerType: true } },
			createdByUser: { select: { firstName: true, lastName: true } }
		}
	});

	return {
		bank: bankContainer,
		cashbox: cashboxContainer,
		containers,
		recentEntries,
		filters: {
			containerId: filterContainerId,
			entryType: filterEntryType,
			dateFrom: filterDateFrom,
			dateTo: filterDateTo,
			search: filterSearch
		},
		canManage: canManageFinances(user.role),
		isAdmin: user.role === 'admin'
	};
};

export const actions: Actions = {
	recordStandaloneIncome: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageFinances(locals.user.role)) {
			return fail(403, { incomeError: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const containerId = String(formData.get('containerId') ?? '');
		const description = String(formData.get('description') ?? '').trim();
		const amountInput = String(formData.get('amount') ?? '');
		const dateInput = String(formData.get('incomeDate') ?? '');
		const notes = String(formData.get('notes') ?? '').trim();

		if (!description) {
			return fail(422, { incomeError: 'Въведете описание на прихода.' });
		}

		const amountCents = Math.round(parseFloat(amountInput) * 100);
		if (!amountInput || isNaN(amountCents) || amountCents <= 0) {
			return fail(422, { incomeError: 'Сумата трябва да е по-голяма от нула.' });
		}

		const incomeDate = dateInput ? new Date(dateInput) : null;
		if (!incomeDate || isNaN(incomeDate.getTime())) {
			return fail(422, { incomeError: 'Невалидна дата.' });
		}

		const container = await db.moneyContainer.findFirst({
			where: { id: containerId, companyId: company.id }
		});

		if (!container) {
			return fail(404, { incomeError: 'Контейнерът не е намерен.' });
		}

		const income = await db.$transaction(async (tx) => {
			const income = await tx.standaloneIncome.create({
				data: {
					companyId: company.id,
					containerId: container.id,
					description,
					amountCents,
					incomeDate,
					notes: notes || null,
					createdByUserId: locals.user!.id
				}
			});

			await tx.ledgerEntry.create({
				data: {
					containerId: container.id,
					entryType: 'standalone_income',
					amountCents,
					entryDate: incomeDate,
					description,
					standaloneIncomeId: income.id,
					createdByUserId: locals.user!.id
				}
			});

			return income;
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'standalone_income_recorded',
			entityType: 'standalone_income',
			entityId: income.id,
			newValueJson: { containerId, description, amountCents, incomeDate: incomeDate.toISOString() },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { incomeSuccess: 'Приходът е записан.' };
	},

	recordGenericMovement: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageFinances(locals.user.role)) {
			return fail(403, { movementError: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const containerId = String(formData.get('containerId') ?? '');
		const description = String(formData.get('description') ?? '').trim();
		const amountInput = String(formData.get('amount') ?? '');
		const direction = String(formData.get('direction') ?? ''); // 'credit' or 'debit'
		const dateInput = String(formData.get('movementDate') ?? '');

		if (!description) {
			return fail(422, { movementError: 'Въведете описание на движението.' });
		}

		const rawAmount = Math.round(parseFloat(amountInput) * 100);
		if (!amountInput || isNaN(rawAmount) || rawAmount <= 0) {
			return fail(422, { movementError: 'Сумата трябва да е по-голяма от нула.' });
		}

		if (direction !== 'credit' && direction !== 'debit') {
			return fail(422, { movementError: 'Невалидна посока на движението.' });
		}

		const movementDate = dateInput ? new Date(dateInput) : null;
		if (!movementDate || isNaN(movementDate.getTime())) {
			return fail(422, { movementError: 'Невалидна дата.' });
		}

		const container = await db.moneyContainer.findFirst({
			where: { id: containerId, companyId: company.id }
		});

		if (!container) {
			return fail(404, { movementError: 'Контейнерът не е намерен.' });
		}

		const amountCents = direction === 'credit' ? rawAmount : -rawAmount;
		const entryType = direction === 'credit' ? 'generic_credit' : 'generic_debit';

		const entry = await db.ledgerEntry.create({
			data: {
				containerId: container.id,
				entryType,
				amountCents,
				entryDate: movementDate,
				description,
				createdByUserId: locals.user.id
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'ledger_generic_movement',
			entityType: 'ledger_entry',
			entityId: entry.id,
			newValueJson: { containerId, description, amountCents, direction, movementDate: movementDate.toISOString() },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { movementSuccess: 'Движението е записано.' };
	},

	recordTransfer: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageFinances(locals.user.role)) {
			return fail(403, { transferError: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const sourceId = String(formData.get('sourceId') ?? '');
		const destinationId = String(formData.get('destinationId') ?? '');
		const amountInput = String(formData.get('amount') ?? '');
		const dateInput = String(formData.get('transferDate') ?? '');

		if (sourceId === destinationId) {
			return fail(422, { transferError: 'Изходният и целевият контейнер трябва да са различни.' });
		}

		const amountCents = Math.round(parseFloat(amountInput) * 100);
		if (!amountInput || isNaN(amountCents) || amountCents <= 0) {
			return fail(422, { transferError: 'Сумата трябва да е по-голяма от нула.' });
		}

		const transferDate = dateInput ? new Date(dateInput) : null;
		if (!transferDate || isNaN(transferDate.getTime())) {
			return fail(422, { transferError: 'Невалидна дата.' });
		}

		const [source, destination] = await Promise.all([
			db.moneyContainer.findFirst({ where: { id: sourceId, companyId: company.id } }),
			db.moneyContainer.findFirst({ where: { id: destinationId, companyId: company.id } })
		]);

		if (!source || !destination) {
			return fail(404, { transferError: 'Контейнерът не е намерен.' });
		}

		const transferPairId = crypto.randomUUID();

		await db.$transaction(async (tx) => {
			await tx.ledgerEntry.create({
				data: {
					containerId: source.id,
					entryType: 'transfer_out',
					amountCents: -amountCents,
					entryDate: transferDate,
					description: `Трансфер към ${destination.name}`,
					transferPairId,
					createdByUserId: locals.user!.id
				}
			});

			await tx.ledgerEntry.create({
				data: {
					containerId: destination.id,
					entryType: 'transfer_in',
					amountCents,
					entryDate: transferDate,
					description: `Трансфер от ${source.name}`,
					transferPairId,
					createdByUserId: locals.user!.id
				}
			});
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'ledger_transfer',
			entityType: 'ledger_entry',
			entityId: transferPairId,
			newValueJson: {
				sourceId,
				destinationId,
				amountCents,
				transferDate: transferDate.toISOString(),
				transferPairId
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { transferSuccess: 'Трансферът е записан.' };
	},

	setOpeningBalance: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || locals.user.role !== 'admin') {
			return fail(403, { openingBalanceError: 'Само администраторът може да задава начален баланс.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const containerId = String(formData.get('containerId') ?? '');
		const amountInput = String(formData.get('openingBalance') ?? '');

		const amountCents = Math.round(parseFloat(amountInput) * 100);
		if (amountInput === '' || isNaN(amountCents)) {
			return fail(422, { openingBalanceError: 'Невалидна сума за начален баланс.' });
		}

		const container = await db.moneyContainer.findFirst({
			where: { id: containerId, companyId: company.id }
		});

		if (!container) {
			return fail(404, { openingBalanceError: 'Контейнерът не е намерен.' });
		}

		const oldBalance = container.openingBalanceCents;

		await db.moneyContainer.update({
			where: { id: container.id },
			data: { openingBalanceCents: amountCents }
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'money_container_opening_balance_updated',
			entityType: 'money_container',
			entityId: container.id,
			oldValueJson: { openingBalanceCents: oldBalance },
			newValueJson: { openingBalanceCents: amountCents },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { openingBalanceSuccess: 'Началният баланс е обновен.' };
	}
};
