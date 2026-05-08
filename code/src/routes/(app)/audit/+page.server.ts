import { redirect, error, isHttpError, isRedirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

function canViewAudit(role: string) {
	return role === 'admin' || role === 'accountant';
}

function canViewSecurity(role: string) {
	return role === 'admin';
}

// Event type prefix/keyword matchers for category classification
function isSecurityEvent(eventType: string): boolean {
	return (
		eventType.startsWith('user_') ||
		eventType.startsWith('auth_') ||
		eventType === 'login_success' ||
		eventType === 'login_failed' ||
		eventType === 'session_expired'
	);
}

function isFinanceEvent(eventType: string): boolean {
	return (
		eventType.startsWith('invoice_') ||
		eventType.startsWith('expense_') ||
		eventType.startsWith('recurring_') ||
		eventType.startsWith('bank_') ||
		eventType.startsWith('statement_') ||
		eventType.startsWith('ledger_') ||
		eventType === 'standalone_income_recorded' ||
		eventType === 'generic_movement_recorded' ||
		eventType === 'transfer_recorded'
	);
}

function isOperationalEvent(eventType: string): boolean {
	return (
		eventType === 'task_time_log_deleted' ||
		eventType === 'invoice_task_selection_removed' ||
		eventType.includes('delete') ||
		eventType.includes('remove')
	);
}

function buildEventTypeFilter(tab: string, role: string): object {
	if (tab === 'security' && canViewSecurity(role)) {
		// Security-only events
		return {
			OR: [
				{ eventType: { startsWith: 'user_' } },
				{ eventType: { startsWith: 'auth_' } },
				{ eventType: 'login_success' },
				{ eventType: 'login_failed' },
				{ eventType: 'session_expired' }
			]
		};
	}

	if (tab === 'finance') {
		// Finance + operational events
		return {
			OR: [
				{ eventType: { startsWith: 'invoice_' } },
				{ eventType: { startsWith: 'expense_' } },
				{ eventType: { startsWith: 'recurring_' } },
				{ eventType: { startsWith: 'bank_' } },
				{ eventType: { startsWith: 'statement_' } },
				{ eventType: { startsWith: 'ledger_' } },
				{ eventType: 'standalone_income_recorded' },
				{ eventType: 'generic_movement_recorded' },
				{ eventType: 'transfer_recorded' },
				{ eventType: 'task_time_log_deleted' },
				{ eventType: 'invoice_task_selection_removed' },
				{ eventType: { contains: 'delete' } },
				{ eventType: { contains: 'remove' } }
			]
		};
	}

	if (tab === 'all' && canViewSecurity(role)) {
		// No filter — all events
		return {};
	}

	// Default for accountant (no security): finance + operational only
	return {
		OR: [
			{ eventType: { startsWith: 'invoice_' } },
			{ eventType: { startsWith: 'expense_' } },
			{ eventType: { startsWith: 'recurring_' } },
			{ eventType: { startsWith: 'bank_' } },
			{ eventType: { startsWith: 'statement_' } },
			{ eventType: { startsWith: 'ledger_' } },
			{ eventType: 'standalone_income_recorded' },
			{ eventType: 'generic_movement_recorded' },
			{ eventType: 'transfer_recorded' },
			{ eventType: 'task_time_log_deleted' },
			{ eventType: 'invoice_task_selection_removed' },
			{ eventType: { contains: 'delete' } },
			{ eventType: { contains: 'remove' } }
		]
	};
}

export const load: PageServerLoad = async ({ parent, url }) => {
	try {
		const { user } = await parent();

		if (!canViewAudit(user.role)) {
			redirect(302, '/dashboard');
		}

		// Parse filter params
		const tab = url.searchParams.get('tab') ?? (canViewSecurity(user.role) ? 'all' : 'finance');
		const dateFrom = url.searchParams.get('dateFrom') ?? '';
		const dateTo = url.searchParams.get('dateTo') ?? '';
		const actorUserId = url.searchParams.get('actorUserId') ?? '';
		const entityType = url.searchParams.get('entityType') ?? '';
		const search = url.searchParams.get('search') ?? '';

		// Normalize tab for accountants: they can't see security tab
		const effectiveTab = !canViewSecurity(user.role) && tab === 'security' ? 'finance' : tab;

		// Build where clause
		const categoryFilter = buildEventTypeFilter(effectiveTab, user.role);

		const where: Record<string, unknown> = {
			...categoryFilter,
			...(actorUserId ? { actorUserId } : {}),
			...(entityType ? { entityType } : {}),
			...(search ? { eventType: { contains: search, mode: 'insensitive' } } : {}),
			...(dateFrom || dateTo
				? {
						createdAt: {
							...(dateFrom ? { gte: new Date(dateFrom) } : {}),
							...(dateTo
								? {
										lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999))
									}
								: {})
						}
					}
				: {})
		};

		// When both a category filter and a search are provided, combine them carefully
		// The search overrides eventType from category filter — use AND
		let finalWhere: Record<string, unknown>;
		if (search && Object.keys(categoryFilter).length > 0) {
			const { OR: categoryOR, ...restCategory } = categoryFilter as { OR?: unknown[] };
			finalWhere = {
				AND: [
					categoryOR ? { OR: categoryOR } : {},
					{ eventType: { contains: search, mode: 'insensitive' } }
				],
				...(actorUserId ? { actorUserId } : {}),
				...(entityType ? { entityType } : {}),
				...(dateFrom || dateTo
					? {
							createdAt: {
								...(dateFrom ? { gte: new Date(dateFrom) } : {}),
								...(dateTo
									? {
											lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999))
										}
									: {})
							}
						}
					: {})
			};
		} else {
			finalWhere = where;
			// Remove the search-only eventType if search is set with no category filter
			if (search && Object.keys(categoryFilter).length === 0) {
				finalWhere = {
					eventType: { contains: search, mode: 'insensitive' },
					...(actorUserId ? { actorUserId } : {}),
					...(entityType ? { entityType } : {}),
					...(dateFrom || dateTo
						? {
								createdAt: {
									...(dateFrom ? { gte: new Date(dateFrom) } : {}),
									...(dateTo
										? {
												lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999))
											}
										: {})
								}
							}
						: {})
				};
			}
		}

		const [events, totalCount, actors, entityTypes] = await Promise.all([
			db.auditEvent.findMany({
				where: finalWhere,
				orderBy: { createdAt: 'desc' },
				take: 200,
				include: {
					actor: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							email: true
						}
					}
				}
			}),
			db.auditEvent.count({ where: finalWhere }),
			// Distinct actors who have audit events (for filter dropdown)
			db.user.findMany({
				where: {
					auditEvents: { some: {} }
				},
				orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true
				}
			}),
			// Distinct entity types for filter dropdown
			db.auditEvent.findMany({
				where: { entityType: { not: null } },
				distinct: ['entityType'],
				select: { entityType: true },
				orderBy: { entityType: 'asc' }
			})
		]);

		return {
			events,
			totalCount,
			actors,
			entityTypes: entityTypes.map((e) => e.entityType).filter((t): t is string => t !== null),
			filters: {
				tab: effectiveTab,
				dateFrom,
				dateTo,
				actorUserId,
				entityType,
				search
			},
			canViewSecurity: canViewSecurity(user.role)
		};
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане на данните.');
	}
};
