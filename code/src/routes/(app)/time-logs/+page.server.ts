import { db } from '$lib/server/db';
import { fail, error, isHttpError, isRedirect } from '@sveltejs/kit';
import { logAuditEvent } from '$lib/server/audit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ parent, url }) => {
	try {
		const { user } = await parent();

		const dateFrom = url.searchParams.get('dateFrom') ?? '';
		const dateTo = url.searchParams.get('dateTo') ?? '';
		const userId = url.searchParams.get('userId') ?? '';
		const projectId = url.searchParams.get('projectId') ?? '';
		const invoiced = url.searchParams.get('invoiced') ?? 'all';

		const where: Record<string, unknown> = {};

		if (user.role === 'employee') {
			where.userId = user.id;
		} else if (userId) {
			where.userId = userId;
		}

		if (projectId) {
			where.task = { taskList: { projectId } };
		}

		if (dateFrom || dateTo) {
			const dateFilter: Record<string, Date> = {};
			if (dateFrom) dateFilter.gte = new Date(dateFrom);
			if (dateTo) dateFilter.lte = new Date(dateTo + 'T23:59:59');
			where.workDate = dateFilter;
		}

		if (invoiced === 'invoiced') where.invoicedAt = { not: null };
		else if (invoiced === 'uninvoiced') where.invoicedAt = null;

		const [logsResult, users, projects] = await Promise.all([
			db.taskTimeLog.findMany({
				where,
				include: {
					user: { select: { id: true, firstName: true, lastName: true } },
					task: {
						select: {
							id: true,
							title: true,
							taskList: {
								select: {
									project: {
										select: {
											id: true,
											name: true,
											client: { select: { legalName: true } }
										}
									}
								}
							}
						}
					}
				},
				orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
				take: 300
			}).then((rows) => ({ rows, hitLimit: rows.length === 300 })),
			user.role !== 'employee'
				? db.user.findMany({
						where: { status: 'active' },
						select: { id: true, firstName: true, lastName: true },
						orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
					})
				: Promise.resolve([]),
			db.project.findMany({
				where: { status: 'active' },
				select: { id: true, name: true },
				orderBy: { name: 'asc' }
			})
		]);

		const { rows: logs, hitLimit } = logsResult;

		const totalMinutes = logs.reduce((s, l) => s + l.durationMinutes, 0);
		const totalAmount = logs.reduce((s, l) => {
			const rate = l.snapshotBillableRateCents ?? 0;
			return s + Math.round((l.durationMinutes / 60) * rate);
		}, 0);

		return {
			logs,
			hitLimit,
			users,
			projects,
			filters: { dateFrom, dateTo, userId, projectId, invoiced },
			totalMinutes,
			totalAmountCents: totalAmount,
			canDelete: user.role === 'admin' || user.role === 'manager'
		};
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане на данните.');
	}
};

export const actions: Actions = {
	deleteLog: async ({ request, locals }) => {
		const user = locals.user;
		if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
			return fail(403, { deleteError: 'Нямате права за това действие.' });
		}

		const data = await request.formData();
		const logId = String(data.get('logId') ?? '');
		if (!logId) return fail(400, { deleteError: 'Невалиден ID.' });

		const log = await db.taskTimeLog.findUnique({
			where: { id: logId },
			select: { id: true, invoicedAt: true, durationMinutes: true, workDate: true, userId: true }
		});

		if (!log) return fail(404, { deleteError: 'Записът не е намерен.' });
		if (log.invoicedAt) return fail(400, { deleteError: 'Не може да изтриете фактуриран запис.' });

		await db.taskTimeLog.delete({ where: { id: logId } });

		await logAuditEvent({
			actorUserId: user.id,
			eventType: 'task_time_log_deleted',
			entityType: 'TaskTimeLog',
			entityId: logId,
			oldValueJson: { durationMinutes: log.durationMinutes, workDate: log.workDate }
		});

		return { deleteSuccess: true };
	}
};
