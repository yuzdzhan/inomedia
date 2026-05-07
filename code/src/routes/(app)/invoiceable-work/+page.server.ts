import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { canViewProjectFinancials } from '$lib/server/project-policy';
import type { PageServerLoad } from './$types';

function formatDateInput(date: Date) {
	return date.toISOString().slice(0, 10);
}

function normalizeBillingType(value: string | null) {
	if (value === 'hourly' || value === 'flat_fee') {
		return value;
	}

	return 'all';
}

function centsFromMinutes(rateCents: number | null, minutes: number) {
	if (rateCents == null) {
		return 0;
	}

	return Math.round((rateCents * minutes) / 60);
}

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();
	if (!canViewProjectFinancials(user.role) || user.role === 'employee') {
		redirect(302, '/dashboard');
	}

	const company = await db.company.findFirst({
		select: {
			id: true,
			currency: true
		}
	});

	if (!company) {
		redirect(302, '/bootstrap');
	}

	const clientId = url.searchParams.get('clientId') ?? 'all';
	const projectId = url.searchParams.get('projectId') ?? 'all';
	const billingType = normalizeBillingType(url.searchParams.get('billingType'));
	const scopeWhere = {
		client: {
			companyId: company.id
		},
		isBillable: true,
		...(user.role === 'manager' ? { primaryManagerUserId: user.id } : {})
	};

	const visibleProjects = await db.project.findMany({
		where: scopeWhere,
		orderBy: [{ client: { legalName: 'asc' } }, { name: 'asc' }],
		select: {
			id: true,
			name: true,
			clientId: true,
			client: {
				select: {
					id: true,
					legalName: true
				}
			}
		}
	});

	const visibleClientIds = [...new Set(visibleProjects.map((project) => project.clientId))];
	const visibleClients = visibleProjects
		.map((project) => project.client)
		.filter((client, index, array) => array.findIndex((entry) => entry.id === client.id) === index);

	const tasks = await db.task.findMany({
		where: {
			billingType: billingType === 'all' ? { in: ['hourly', 'flat_fee'] } : billingType,
			taskList: {
				project: {
					...scopeWhere,
					...(clientId !== 'all' ? { clientId } : {}),
					...(projectId !== 'all' ? { id: projectId } : {})
				}
			}
		},
		orderBy: [
			{ taskList: { project: { client: { legalName: 'asc' } } } },
			{ taskList: { project: { name: 'asc' } } },
			{ title: 'asc' }
		],
		include: {
			taskList: {
				include: {
					project: {
						select: {
							id: true,
							name: true,
							primaryManagerUserId: true,
							client: {
								select: {
									id: true,
									legalName: true
								}
							}
						}
					}
				}
			},
			timeLogs: {
				where: {
					invoicedAt: null
				},
				orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
				select: {
					id: true,
					workDate: true,
					durationMinutes: true,
					snapshotBillableRateCents: true
				}
			},
			assignees: {
				include: {
					user: {
						select: {
							id: true,
							firstName: true,
							lastName: true
						}
					}
				}
			}
		}
	});

	const invoiceableItems = tasks
		.map((task) => {
			if (task.billingType === 'hourly') {
				const uninvoicedMinutes = task.timeLogs.reduce((sum, log) => sum + log.durationMinutes, 0);
				const amountCents = task.timeLogs.reduce(
					(sum, log) => sum + centsFromMinutes(log.snapshotBillableRateCents, log.durationMinutes),
					0
				);

				if (uninvoicedMinutes <= 0 || amountCents <= 0) {
					return null;
				}

				return {
					id: task.id,
					title: task.title,
					status: task.status,
					billingType: task.billingType,
					projectId: task.taskList.project.id,
					projectName: task.taskList.project.name,
					clientId: task.taskList.project.client.id,
					clientName: task.taskList.project.client.legalName,
					amountCents,
					uninvoicedMinutes,
					uninvoicedLogCount: task.timeLogs.length,
					firstWorkDate: formatDateInput(task.timeLogs[0]?.workDate ?? new Date()),
					lastWorkDate: formatDateInput(task.timeLogs.at(-1)?.workDate ?? new Date()),
					assignees: task.assignees.map((assignee) => ({
						id: assignee.user.id,
						firstName: assignee.user.firstName,
						lastName: assignee.user.lastName
					}))
				};
			}

			if (task.billingType === 'flat_fee' && (task.flatFeeAmountCents ?? 0) > 0) {
				return {
					id: task.id,
					title: task.title,
					status: task.status,
					billingType: task.billingType,
					projectId: task.taskList.project.id,
					projectName: task.taskList.project.name,
					clientId: task.taskList.project.client.id,
					clientName: task.taskList.project.client.legalName,
					amountCents: task.flatFeeAmountCents ?? 0,
					uninvoicedMinutes: 0,
					uninvoicedLogCount: 0,
					firstWorkDate: null,
					lastWorkDate: null,
					assignees: task.assignees.map((assignee) => ({
						id: assignee.user.id,
						firstName: assignee.user.firstName,
						lastName: assignee.user.lastName
					}))
				};
			}

			return null;
		})
		.filter((item) => item != null);

	const grouped = visibleClients
		.map((client) => {
			const clientItems = invoiceableItems.filter((item) => item.clientId === client.id);
			if (clientItems.length === 0) {
				return null;
			}

			const projects = visibleProjects
				.filter((project) => project.clientId === client.id)
				.map((project) => {
					const items = clientItems.filter((item) => item.projectId === project.id);
					if (items.length === 0) {
						return null;
					}

					return {
						id: project.id,
						name: project.name,
						totalAmountCents: items.reduce((sum, item) => sum + item.amountCents, 0),
						items
					};
				})
				.filter((project) => project != null);

			if (projects.length === 0) {
				return null;
			}

			return {
				id: client.id,
				legalName: client.legalName,
				totalAmountCents: projects.reduce((sum, project) => sum + project.totalAmountCents, 0),
				projects
			};
		})
		.filter((client) => client != null);

	return {
		company,
		clients: visibleClients.filter((client) => visibleClientIds.includes(client.id)),
		projects: visibleProjects,
		grouped,
		filters: {
			clientId,
			projectId,
			billingType
		},
		summary: {
			taskCount: invoiceableItems.length,
			totalAmountCents: invoiceableItems.reduce((sum, item) => sum + item.amountCents, 0),
			totalUninvoicedMinutes: invoiceableItems.reduce((sum, item) => sum + item.uninvoicedMinutes, 0)
		}
	};
};
