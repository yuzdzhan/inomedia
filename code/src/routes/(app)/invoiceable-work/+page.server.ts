import { fail, redirect, error, isHttpError, isRedirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import {
	buildDraftSelectionSnapshot,
	centsFromMinutes,
	formatDateInput,
	resolveDraftDueDate,
	summarizeDraftSelections
} from '$lib/server/invoice-drafts';
import { canViewProjectFinancials } from '$lib/server/project-policy';
import type { Actions, PageServerLoad } from './$types';

function normalizeBillingType(value: string | null) {
	if (value === 'hourly' || value === 'flat_fee') {
		return value;
	}

	return 'all';
}

function canAccessInvoiceDrafting(role: string) {
	return role === 'admin' || role === 'accountant';
}

type InvoiceableItem = {
	id: string;
	title: string;
	status: string;
	billingType: 'hourly' | 'flat_fee';
	projectId: string;
	projectName: string;
	clientId: string;
	clientName: string;
	amountCents: number;
	uninvoicedMinutes: number;
	uninvoicedLogCount: number;
	firstWorkDate: string | null;
	lastWorkDate: string | null;
	assignees: Array<{ id: string; firstName: string; lastName: string }>;
};

async function getInvoiceableContext(user: { id: string; role: string }, url: URL) {
	const company = await db.company.findFirst({
		select: {
			id: true,
			currency: true,
			defaultPaymentTermDays: true,
			vatRateBasisPoints: true
		}
	});

	if (!company) {
		redirect(302, '/bootstrap');
	}

	const clientId = url.searchParams.get('clientId') ?? 'all';
	const projectId = url.searchParams.get('projectId') ?? 'all';
	const billingType = normalizeBillingType(url.searchParams.get('billingType'));
	const userId = (user.role === 'admin' || user.role === 'manager') ? (url.searchParams.get('userId') ?? 'all') : 'all';
	const workDateFrom = url.searchParams.get('dateFrom') ?? '';
	const workDateTo = url.searchParams.get('dateTo') ?? '';

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
					legalName: true,
					defaultPaymentTermDays: true
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
			},
			invoiceSelections: {
				none: {
					invoice: {
						status: 'draft'
					}
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
					invoicedAt: null,
					...(userId !== 'all' ? { userId } : {}),
					...(workDateFrom || workDateTo
						? {
								workDate: {
									...(workDateFrom ? { gte: new Date(workDateFrom) } : {}),
									...(workDateTo ? { lte: new Date(workDateTo) } : {})
								}
							}
						: {})
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
		.map((task): InvoiceableItem | null => {
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
					billingType: 'hourly',
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
					billingType: 'flat_fee',
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
		.filter((item): item is InvoiceableItem => item !== null);

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
				.filter((project) => project !== null);

			if (projects.length === 0) {
				return null;
			}

			return {
				id: client.id,
				legalName: client.legalName,
				defaultPaymentTermDays: client.defaultPaymentTermDays,
				totalAmountCents: projects.reduce((sum, project) => sum + project.totalAmountCents, 0),
				projects
			};
		})
		.filter((client) => client !== null);

	// Load users for userId filter (admin/manager only)
	const users =
		user.role === 'admin' || user.role === 'manager'
			? await db.user.findMany({
					where: { status: 'active' },
					orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
					select: { id: true, firstName: true, lastName: true }
				})
			: [];

	return {
		company,
		clients: visibleClients.filter((client) => visibleClientIds.includes(client.id)),
		projects: visibleProjects,
		grouped,
		invoiceableItems,
		users,
		filters: {
			clientId,
			projectId,
			billingType,
			userId,
			dateFrom: workDateFrom,
			dateTo: workDateTo
		},
		summary: {
			taskCount: invoiceableItems.length,
			totalAmountCents: invoiceableItems.reduce((sum, item) => sum + item.amountCents, 0),
			totalUninvoicedMinutes: invoiceableItems.reduce((sum, item) => sum + item.uninvoicedMinutes, 0)
		},
		permissions: {
			canCreateDrafts: canAccessInvoiceDrafting(user.role)
		}
	};
}

export const load: PageServerLoad = async ({ parent, url }) => {
	try {
		const { user } = await parent();
		if (!canViewProjectFinancials(user.role) || user.role === 'employee') {
			redirect(302, '/dashboard');
		}

		return getInvoiceableContext(user, url);
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане на данните.');
	}
};

export const actions: Actions = {
	createDraft: async ({ request, locals, getClientAddress, url }) => {
		if (!locals.user || !canAccessInvoiceDrafting(locals.user.role)) {
			return fail(403, { createDraftError: 'Нямате права за тази операция.' });
		}

		const user = locals.user;
		const formData = await request.formData();
		const clientId = String(formData.get('clientId') ?? '');
		const selectedTaskIds = [...new Set(formData.getAll('taskIds').map(String).filter(Boolean))];

		if (!clientId || selectedTaskIds.length === 0) {
			return fail(422, {
				createDraftError: 'Изберете поне една задача за чернова.',
				createDraftClientId: clientId
			});
		}

		const context = await getInvoiceableContext(user, url);
		const selectableItems = context.invoiceableItems.filter(
			(item) => item.clientId === clientId && selectedTaskIds.includes(item.id)
		);

		if (selectableItems.length !== selectedTaskIds.length) {
			return fail(409, {
				createDraftError: 'Някои от избраните задачи вече не са налични за фактуриране.',
				createDraftClientId: clientId
			});
		}

		const tasks = await db.task.findMany({
			where: {
				id: {
					in: selectedTaskIds
				}
			},
			include: {
				taskList: {
					include: {
						project: {
							include: {
								client: {
									select: {
										id: true
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
						description: true,
						durationMinutes: true,
						startMinuteOfDay: true,
						endMinuteOfDay: true,
						snapshotCostRateCents: true,
						snapshotBillableRateCents: true,
						userId: true
					}
				},
				invoiceSelections: {
					where: {
						invoice: {
							status: 'draft'
						}
					},
					select: {
						id: true
					}
				}
			}
		});

		if (
			tasks.length !== selectedTaskIds.length ||
			tasks.some((task) => task.taskList.project.client.id !== clientId) ||
			tasks.some((task) => task.invoiceSelections.length > 0)
		) {
			return fail(409, {
				createDraftError: 'Задачите трябва да са от един клиент и да не са резервирани в друга чернова.',
				createDraftClientId: clientId
			});
		}

		const selectionSnapshots = tasks.map((task) => buildDraftSelectionSnapshot(task, clientId));
		const totals = summarizeDraftSelections(selectionSnapshots, context.company.vatRateBasisPoints);
		const clientDefaultPaymentTermDays =
			context.clients.find((client) => client.id === clientId)?.defaultPaymentTermDays ?? null;

		const invoice = await db.invoice.create({
			data: {
				clientId,
				createdByUserId: user.id,
				vatRateBasisPoints: context.company.vatRateBasisPoints,
				netTotalCents: totals.netTotalCents,
				vatTotalCents: totals.vatTotalCents,
				grossTotalCents: totals.grossTotalCents,
				servicePeriodFrom: totals.servicePeriodFrom,
				servicePeriodTo: totals.servicePeriodTo,
				dueDate: resolveDraftDueDate(
					null,
					clientDefaultPaymentTermDays,
					context.company.defaultPaymentTermDays
				),
				taskSelections: {
					create: selectionSnapshots.map((selection) => ({
						taskId: selection.taskId,
						description: selection.description,
						hourlyUninvoicedValueCents: selection.hourlyUninvoicedValueCents,
						flatFeeValueCents: selection.flatFeeValueCents,
						snapshotJson: selection.snapshotJson
					}))
				}
			},
			select: {
				id: true
			}
		});

		await logAuditEvent({
			actorUserId: user.id,
			eventType: 'invoice_draft_created',
			entityType: 'invoice',
			entityId: invoice.id,
			newValueJson: {
				clientId,
				taskIds: selectedTaskIds,
				netTotalCents: totals.netTotalCents,
				vatTotalCents: totals.vatTotalCents,
				grossTotalCents: totals.grossTotalCents
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		redirect(303, `/invoices?draftCreated=${invoice.id}`);
	}
};
