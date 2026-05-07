import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { TaskBillingType, TaskPriority, TaskStatus } from '@prisma/client';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import { ensureCompanyDefaults } from '$lib/server/company-defaults';
import { prepareAttachments } from '$lib/server/task-attachments';
import { canCreateOrManageProjects, canViewProjectFinancials } from '$lib/server/project-policy';
import {
	canAccessProjectTasks,
	canCreateTaskComments,
	canCreateTaskTimeLogs,
	canManageProjectTasks,
	canSoftDeleteTaskComments,
	formatDateForInput,
	normalizeTaskCommentBody,
	normalizeOptionalTaskDescription,
	normalizeTaskListName,
	normalizeTaskTimeLogDescription,
	normalizeTaskTitle,
	parseOptionalDateInput,
	parseOptionalMoneyToCents
} from '$lib/server/task-policy';
import type { Actions, PageServerLoad } from './$types';

const moneyField = z
	.string()
	.trim()
	.refine((value) => value.length === 0 || /^\d+([.,]\d{1,2})?$/.test(value), 'Използвайте число с до 2 знака след десетичната запетая.');

const taskListSchema = z.object({
	projectId: z.string().trim().min(1),
	name: z.string().trim().min(2, 'Въведете име на списъка.').max(120, 'Името е твърде дълго.'),
	description: z.string().max(2000, 'Описанието е твърде дълго.'),
	isArchived: z.boolean()
});

const taskSchema = z.object({
	projectId: z.string().trim().min(1),
	taskListId: z.string().trim().min(1, 'Изберете списък със задачи.'),
	title: z.string().trim().min(2, 'Въведете заглавие на задачата.').max(160, 'Заглавието е твърде дълго.'),
	description: z.string().max(4000, 'Описанието е твърде дълго.'),
	status: z.enum(['todo', 'in_progress', 'done', 'cancelled']),
	priority: z.enum(['low', 'medium', 'high']),
	deadlineDate: z.union([
		z.literal(''),
		z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Използвайте валидна дата.')
	]),
	billingType: z.enum(['hourly', 'flat_fee', 'non_billable']),
	flatFeeAmount: moneyField,
	assigneeUserIds: z.array(z.string().trim()).default([])
});

const taskCommentSchema = z.object({
	projectId: z.string().trim().min(1),
	taskId: z.string().trim().min(1),
	body: z.string().trim().min(1, 'Въведете коментар.').max(4000, 'Коментарът е твърде дълъг.')
});

const taskTimeLogSchema = z.object({
	projectId: z.string().trim().min(1),
	taskId: z.string().trim().min(1),
	workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Използвайте валидна дата.'),
	description: z.string().trim().min(1, 'Въведете описание на извършената работа.').max(4000, 'Описанието е твърде дълго.'),
	durationMinutes: z
		.string()
		.trim()
		.regex(/^\d+$/, 'Използвайте продължителност в минути.')
		.transform((value) => Number.parseInt(value, 10))
		.refine((value) => value > 0, 'Продължителността трябва да е по-голяма от 0.')
		.refine((value) => value % 15 === 0, 'Продължителността трябва да се дели на 15.'),
	startTime: z.union([z.literal(''), z.string().regex(/^\d{2}:\d{2}$/, 'Използвайте час във формат ЧЧ:ММ.')]),
	endTime: z.union([z.literal(''), z.string().regex(/^\d{2}:\d{2}$/, 'Използвайте час във формат ЧЧ:ММ.')])
});

const CLOSED_TASK_STATUSES: TaskStatus[] = ['done', 'cancelled'];

function parseCheckbox(formData: FormData, key: string) {
	return formData.get(key) === 'on';
}

function dedupeIds(ids: string[]) {
	return [...new Set(ids.filter(Boolean))];
}

function buildTaskListInput(formData: FormData) {
	return {
		projectId: String(formData.get('projectId') ?? ''),
		name: String(formData.get('name') ?? ''),
		description: String(formData.get('description') ?? ''),
		isArchived: parseCheckbox(formData, 'isArchived')
	};
}

function buildTaskInput(formData: FormData) {
	return {
		projectId: String(formData.get('projectId') ?? ''),
		taskListId: String(formData.get('taskListId') ?? ''),
		title: String(formData.get('title') ?? ''),
		description: String(formData.get('description') ?? ''),
		status: String(formData.get('status') ?? 'todo'),
		priority: String(formData.get('priority') ?? 'medium'),
		deadlineDate: String(formData.get('deadlineDate') ?? ''),
		billingType: String(formData.get('billingType') ?? 'hourly'),
		flatFeeAmount: String(formData.get('flatFeeAmount') ?? ''),
		assigneeUserIds: formData.getAll('assigneeUserIds').map(String)
	};
}

function buildTaskCommentInput(formData: FormData) {
	return {
		projectId: String(formData.get('projectId') ?? ''),
		taskId: String(formData.get('taskId') ?? ''),
		body: String(formData.get('body') ?? '')
	};
}

function buildTaskTimeLogInput(formData: FormData) {
	return {
		projectId: String(formData.get('projectId') ?? ''),
		taskId: String(formData.get('taskId') ?? ''),
		workDate: String(formData.get('workDate') ?? ''),
		description: String(formData.get('description') ?? ''),
		durationMinutes: String(formData.get('durationMinutes') ?? ''),
		startTime: String(formData.get('startTime') ?? ''),
		endTime: String(formData.get('endTime') ?? '')
	};
}

function buildAttachmentErrorMap(errors: string[]) {
	return errors.length > 0 ? { attachments: errors } : null;
}

function normalizeTaskListPayload(data: z.infer<typeof taskListSchema>) {
	return {
		projectId: data.projectId,
		name: normalizeTaskListName(data.name),
		description: normalizeOptionalTaskDescription(data.description),
		isArchived: data.isArchived
	};
}

function normalizeTaskPayload(data: z.infer<typeof taskSchema>) {
	return {
		projectId: data.projectId,
		taskListId: data.taskListId,
		title: normalizeTaskTitle(data.title),
		description: normalizeOptionalTaskDescription(data.description),
		status: data.status,
		priority: data.priority,
		deadlineDate: parseOptionalDateInput(data.deadlineDate),
		billingType: data.billingType,
		flatFeeAmountCents: parseOptionalMoneyToCents(data.flatFeeAmount),
		assigneeUserIds: dedupeIds(data.assigneeUserIds)
	};
}

function normalizeTaskCommentPayload(data: z.infer<typeof taskCommentSchema>) {
	return {
		projectId: data.projectId,
		taskId: data.taskId,
		body: normalizeTaskCommentBody(data.body) ?? ''
	};
}

function parseTimeToMinutes(value: string) {
	if (!value) {
		return null;
	}

	const [hoursRaw, minutesRaw] = value.split(':');
	const hours = Number.parseInt(hoursRaw ?? '', 10);
	const minutes = Number.parseInt(minutesRaw ?? '', 10);

	if (
		Number.isNaN(hours) ||
		Number.isNaN(minutes) ||
		hours < 0 ||
		hours > 23 ||
		minutes < 0 ||
		minutes > 59
	) {
		return Number.NaN;
	}

	return hours * 60 + minutes;
}

function normalizeTaskTimeLogPayload(data: z.infer<typeof taskTimeLogSchema>) {
	return {
		projectId: data.projectId,
		taskId: data.taskId,
		workDate: parseOptionalDateInput(data.workDate),
		description: normalizeTaskTimeLogDescription(data.description) ?? '',
		durationMinutes: data.durationMinutes,
		startMinuteOfDay: parseTimeToMinutes(data.startTime),
		endMinuteOfDay: parseTimeToMinutes(data.endTime)
	};
}

function normalizeTaskBillingForPersistence(input: ReturnType<typeof normalizeTaskPayload>) {
	if (input.billingType === 'flat_fee') {
		return input;
	}

	return {
		...input,
		flatFeeAmountCents: null
	};
}

async function getCompanyOrRedirect() {
	const company = await db.company.findFirst();
	if (!company) {
		redirect(302, '/bootstrap');
	}

	await ensureCompanyDefaults(db, company.id);
	return company;
}

function formatDateInTimezone(date: Date, timezone: string) {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(date);
}

async function getScopedProject(companyId: string, projectId: string) {
	return db.project.findFirst({
		where: {
			id: projectId,
			client: {
				companyId
			}
		},
		include: {
			client: {
				select: {
					id: true,
					legalName: true,
					isInternal: true
				}
			},
			primaryManager: {
				select: {
					id: true,
					firstName: true,
					lastName: true
				}
			},
			members: {
				orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
				include: {
					user: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							role: true,
							status: true
						}
					}
				}
			},
			taskLists: {
				orderBy: [{ isArchived: 'asc' }, { name: 'asc' }],
				include: {
					tasks: {
						include: {
							createdByUser: {
								select: {
									id: true,
									firstName: true,
									lastName: true
								}
							},
							assignees: {
								orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
								include: {
									user: {
										select: {
											id: true,
											firstName: true,
											lastName: true,
											role: true,
											status: true
										}
									}
								}
							},
							comments: {
								orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
								include: {
									author: {
										select: {
											id: true,
											firstName: true,
											lastName: true
										}
									},
									deletedByUser: {
										select: {
											id: true,
											firstName: true,
											lastName: true
										}
									},
									attachments: {
										orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
										include: {
											uploadedByUser: {
												select: {
													id: true,
													firstName: true,
													lastName: true
												}
											}
										}
									}
								}
							},
							attachments: {
								orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
								include: {
									uploadedByUser: {
										select: {
											id: true,
											firstName: true,
											lastName: true
										}
									}
								}
							},
							timeLogs: {
								orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
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
						},
						orderBy: [{ deadlineDate: 'asc' }, { updatedAt: 'desc' }, { title: 'asc' }]
					},
					_count: {
						select: {
							tasks: true
						}
					}
				}
			}
		}
	});
}

function validateTaskBilling(input: ReturnType<typeof normalizeTaskPayload>, isInternalProject: boolean) {
	if (!(input.deadlineDate === null || !Number.isNaN(input.deadlineDate.getTime()))) {
		return { field: 'deadlineDate', message: 'Използвайте валидна дата.' };
	}

	if (isInternalProject && input.billingType !== 'non_billable') {
		return { field: 'billingType', message: 'Вътрешните проекти поддържат само небилируеми задачи.' };
	}

	if (input.billingType === 'flat_fee') {
		if (input.flatFeeAmountCents == null || Number.isNaN(input.flatFeeAmountCents)) {
			return { field: 'flatFeeAmount', message: 'Въведете фиксирана цена за този тип задача.' };
		}

		if (input.flatFeeAmountCents <= 0) {
			return { field: 'flatFeeAmount', message: 'Фиксираната цена трябва да е по-голяма от 0.' };
		}

		return null;
	}

	if (input.flatFeeAmountCents != null) {
		return { field: 'flatFeeAmount', message: 'Попълнете фиксирана цена само за задачи с този тип таксуване.' };
	}

	return null;
}

function validateTaskAssignees(
	input: ReturnType<typeof normalizeTaskPayload>,
	project: Awaited<ReturnType<typeof getScopedProject>>
) {
	if (!project) {
		return null;
	}

	const allowedUserIds = new Set(project.members.map((member) => member.userId));
	const invalidAssigneeIds = input.assigneeUserIds.filter((userId) => !allowedUserIds.has(userId));

	if (invalidAssigneeIds.length > 0) {
		return { field: 'assigneeUserIds', message: 'Задачите могат да се възлагат само на участници в проекта.' };
	}

	return null;
}

function isClosedTask(status: TaskStatus) {
	return CLOSED_TASK_STATUSES.includes(status);
}

function findProjectTask(project: NonNullable<Awaited<ReturnType<typeof getScopedProject>>>, taskId: string) {
	for (const taskList of project.taskLists) {
		const task = taskList.tasks.find((entry) => entry.id === taskId);
		if (task) {
			return task;
		}
	}

	return null;
}

function canUserReachTask(
	user: { id: string; role: string },
	task: { assignees: Array<{ userId: string }> }
) {
	if (user.role !== 'employee') {
		return true;
	}

	return task.assignees.some((assignee) => assignee.userId === user.id);
}

function validateTaskTimeLog(
	input: ReturnType<typeof normalizeTaskTimeLogPayload>,
	timezone: string
) {
	if (!(input.workDate instanceof Date) || Number.isNaN(input.workDate.getTime())) {
		return { field: 'workDate', message: 'Използвайте валидна дата.' };
	}

	const today = formatDateInTimezone(new Date(), timezone);
	const workDate = formatDateForInput(input.workDate);
	if (workDate > today) {
		return { field: 'workDate', message: 'Бъдещи дати не са позволени.' };
	}

	const hasStart = input.startMinuteOfDay != null;
	const hasEnd = input.endMinuteOfDay != null;
	if (hasStart !== hasEnd) {
		return { field: 'startTime', message: 'Въведете и начален, и краен час.' };
	}

	if (input.startMinuteOfDay != null && Number.isNaN(input.startMinuteOfDay)) {
		return { field: 'startTime', message: 'Използвайте валиден начален час.' };
	}

	if (input.endMinuteOfDay != null && Number.isNaN(input.endMinuteOfDay)) {
		return { field: 'endTime', message: 'Използвайте валиден краен час.' };
	}

	if (input.startMinuteOfDay != null && input.endMinuteOfDay != null) {
		if (input.endMinuteOfDay <= input.startMinuteOfDay) {
			return { field: 'endTime', message: 'Крайният час трябва да е след началния.' };
		}

		if (input.endMinuteOfDay - input.startMinuteOfDay !== input.durationMinutes) {
			return { field: 'durationMinutes', message: 'Продължителността трябва да съвпада с часовия диапазон.' };
		}
	}

	return null;
}

export const load: PageServerLoad = async ({ params, parent, url }) => {
	const { user } = await parent();
	if (!canAccessProjectTasks(user.role)) {
		redirect(302, '/dashboard');
	}

	const company = await getCompanyOrRedirect();
	const project = await getScopedProject(company.id, params.projectId);

	if (!project) {
		redirect(302, '/projects');
	}

	const showClosed = url.searchParams.get('showClosed') === '1';
	const isEmployeeView = user.role === 'employee';

	if (isEmployeeView && !project.members.some((member) => member.userId === user.id)) {
		redirect(302, '/projects');
	}

	return {
		company: { currency: company.currency, timezone: company.timezone },
		today: formatDateInTimezone(new Date(), company.timezone),
		project: {
			...project,
			taskLists: project.taskLists.map((taskList) => {
				const relevantTasks = isEmployeeView
					? taskList.tasks.filter((task) => task.assignees.some((assignee) => assignee.userId === user.id))
					: taskList.tasks;
				const visibleTasks = showClosed
					? relevantTasks
					: relevantTasks.filter((task) => !isClosedTask(task.status));

				return {
					...taskList,
					hiddenClosedTaskCount: showClosed ? 0 : relevantTasks.length - visibleTasks.length,
					tasks: visibleTasks.map((task) => ({
						...task,
						deadlineDateInput: formatDateForInput(task.deadlineDate)
					}))
				};
			})
		},
		showClosed,
		permissions: {
			currentUserId: user.id,
			canManageTasks: canManageProjectTasks(user.role),
			canManageProjects: canCreateOrManageProjects(user.role),
			canCreateComments: canCreateTaskComments(user.role),
			canCreateTimeLogs: canCreateTaskTimeLogs(user.role),
			canSoftDeleteComments: canSoftDeleteTaskComments(user.role),
			canViewFinancials: canViewProjectFinancials(user.role),
			isEmployeeView
		}
	};
};

export const actions: Actions = {
	createTaskList: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageProjectTasks(locals.user.role)) {
			return fail(403, { createTaskListError: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const raw = buildTaskListInput(formData);
		const parsed = taskListSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				createTaskListErrors: parsed.error.flatten().fieldErrors,
				createTaskListValues: raw
			});
		}

		const data = normalizeTaskListPayload(parsed.data);
		const project = await getScopedProject(company.id, data.projectId);

		if (!project) {
			return fail(404, { createTaskListError: 'Проектът не е намерен.' });
		}

		const duplicate = await db.taskList.findFirst({
			where: {
				projectId: project.id,
				name: {
					equals: data.name,
					mode: 'insensitive'
				}
			}
		});

		if (duplicate) {
			return fail(409, {
				createTaskListErrors: { name: ['Списък с това име вече съществува в проекта.'] },
				createTaskListValues: raw
			});
		}

		const taskList = await db.taskList.create({
			data: {
				projectId: project.id,
				name: data.name,
				description: data.description,
				isArchived: data.isArchived
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'task_list_created',
			entityType: 'task_list',
			entityId: taskList.id,
			newValueJson: data,
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { createTaskListSuccess: true };
	},

	createTask: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageProjectTasks(locals.user.role)) {
			return fail(403, { createTaskError: 'Нямате права за тази операция.' });
		}

		const user = locals.user;

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const raw = buildTaskInput(formData);
		const parsed = taskSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				createTaskErrors: parsed.error.flatten().fieldErrors,
				createTaskValues: raw,
				createTaskTaskListId: raw.taskListId
			});
		}

		const data = normalizeTaskBillingForPersistence(normalizeTaskPayload(parsed.data));
		const project = await getScopedProject(company.id, data.projectId);

		if (!project) {
			return fail(404, {
				createTaskError: 'Проектът не е намерен.',
				createTaskTaskListId: raw.taskListId
			});
		}

		const taskList = project.taskLists.find((item) => item.id === data.taskListId);
		if (!taskList) {
			return fail(422, {
				createTaskErrors: { taskListId: ['Изберете валиден списък от този проект.'] },
				createTaskValues: raw,
				createTaskTaskListId: raw.taskListId
			});
		}

		const billingValidation = validateTaskBilling(data, project.client.isInternal);
		if (billingValidation) {
			return fail(422, {
				createTaskErrors: { [billingValidation.field]: [billingValidation.message] },
				createTaskValues: raw,
				createTaskTaskListId: raw.taskListId
			});
		}

		const assigneeValidation = validateTaskAssignees(data, project);
		if (assigneeValidation) {
			return fail(422, {
				createTaskErrors: { [assigneeValidation.field]: [assigneeValidation.message] },
				createTaskValues: raw,
				createTaskTaskListId: raw.taskListId
			});
		}

		const preparedAttachments = await prepareAttachments(formData.getAll('attachments'));
		const attachmentErrors = buildAttachmentErrorMap(preparedAttachments.errors);
		if (attachmentErrors) {
			return fail(422, {
				createTaskErrors: attachmentErrors,
				createTaskValues: raw,
				createTaskTaskListId: raw.taskListId
			});
		}

		const task = await db.$transaction(async (tx) => {
			const createdTask = await tx.task.create({
				data: {
					taskListId: taskList.id,
					title: data.title,
					description: data.description,
					status: data.status,
					priority: data.priority,
					deadlineDate: data.deadlineDate,
					billingType: data.billingType,
					flatFeeAmountCents: data.billingType === 'flat_fee' ? data.flatFeeAmountCents : null,
					createdByUserId: user.id,
					assignees:
						data.assigneeUserIds.length > 0
							? {
									createMany: {
										data: data.assigneeUserIds.map((userId) => ({ userId }))
									}
								}
							: undefined
				}
			});

			if (preparedAttachments.attachments.length > 0) {
				await tx.taskAttachment.createMany({
					data: preparedAttachments.attachments.map((attachment) => ({
						ownerCompanyId: company.id,
						taskId: createdTask.id,
						uploadedByUserId: user.id,
						originalFilename: attachment.originalFilename,
						contentType: attachment.contentType,
						sizeBytes: attachment.sizeBytes,
						blob: attachment.blob as Uint8Array<ArrayBuffer>
					}))
				});
			}

			return createdTask;
		});

		await logAuditEvent({
			actorUserId: user.id,
			eventType: 'task_created',
			entityType: 'task',
			entityId: task.id,
			newValueJson: {
				taskListId: task.taskListId,
				title: task.title,
				status: task.status,
				priority: task.priority,
				deadlineDate: formatDateForInput(task.deadlineDate),
				billingType: task.billingType,
				flatFeeAmountCents: task.flatFeeAmountCents,
				assigneeUserIds: data.assigneeUserIds,
				attachmentCount: preparedAttachments.attachments.length
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { createTaskSuccess: true, createTaskTaskListId: raw.taskListId };
	},

	updateTask: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageProjectTasks(locals.user.role)) {
			return fail(403, { taskFormError: 'Нямате права за тази операция.' });
		}

		const user = locals.user;

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const taskId = String(formData.get('taskId') ?? '');
		const raw = buildTaskInput(formData);
		const parsed = taskSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				taskFormErrors: parsed.error.flatten().fieldErrors,
				taskFormValues: raw,
				taskFormTaskId: taskId
			});
		}

		const preparedAttachments = await prepareAttachments(formData.getAll('attachments'));
		const attachmentErrors = buildAttachmentErrorMap(preparedAttachments.errors);
		if (attachmentErrors) {
			return fail(422, {
				taskFormErrors: attachmentErrors,
				taskFormValues: raw,
				taskFormTaskId: taskId
			});
		}

		const task = await db.task.findUnique({
			where: { id: taskId },
			include: {
				assignees: {
					select: {
						userId: true
					}
				},
				taskList: {
					include: {
						project: {
							include: {
								client: {
									select: {
										id: true,
										companyId: true,
										isInternal: true
									}
								}
							}
						}
					}
				}
			}
		});

		if (!task || task.taskList.project.client.companyId !== company.id) {
			return fail(404, { taskFormError: 'Задачата не е намерена.', taskFormTaskId: taskId });
		}

		const data = normalizeTaskBillingForPersistence(normalizeTaskPayload(parsed.data));
		const project = await getScopedProject(company.id, data.projectId);

		if (!project || project.id !== task.taskList.projectId) {
			return fail(404, { taskFormError: 'Проектът не е намерен.', taskFormTaskId: taskId });
		}

		const targetTaskList = project.taskLists.find((item) => item.id === data.taskListId);
		if (!targetTaskList) {
			return fail(422, {
				taskFormErrors: { taskListId: ['Изберете валиден списък от този проект.'] },
				taskFormValues: raw,
				taskFormTaskId: taskId
			});
		}

		const billingValidation = validateTaskBilling(data, project.client.isInternal);
		if (billingValidation) {
			return fail(422, {
				taskFormErrors: { [billingValidation.field]: [billingValidation.message] },
				taskFormValues: raw,
				taskFormTaskId: taskId
			});
		}

		const assigneeValidation = validateTaskAssignees(data, project);
		if (assigneeValidation) {
			return fail(422, {
				taskFormErrors: { [assigneeValidation.field]: [assigneeValidation.message] },
				taskFormValues: raw,
				taskFormTaskId: taskId
			});
		}

		const updatedTask = await db.$transaction(async (tx) => {
			const nextTask = await tx.task.update({
				where: { id: task.id },
				data: {
					taskListId: targetTaskList.id,
					title: data.title,
					description: data.description,
					status: data.status,
					priority: data.priority,
					deadlineDate: data.deadlineDate,
					billingType: data.billingType,
					flatFeeAmountCents: data.billingType === 'flat_fee' ? data.flatFeeAmountCents : null
				}
			});

			await tx.taskAssignment.deleteMany({
				where: { taskId: task.id }
			});

			if (data.assigneeUserIds.length > 0) {
				await tx.taskAssignment.createMany({
					data: data.assigneeUserIds.map((userId) => ({
						taskId: task.id,
						userId
					}))
				});
			}

			if (preparedAttachments.attachments.length > 0) {
				await tx.taskAttachment.createMany({
					data: preparedAttachments.attachments.map((attachment) => ({
						ownerCompanyId: company.id,
						taskId: task.id,
						uploadedByUserId: user.id,
						originalFilename: attachment.originalFilename,
						contentType: attachment.contentType,
						sizeBytes: attachment.sizeBytes,
						blob: attachment.blob as Uint8Array<ArrayBuffer>
					}))
				});
			}

			return nextTask;
		});

		await logAuditEvent({
			actorUserId: user.id,
			eventType: 'task_updated',
			entityType: 'task',
			entityId: task.id,
			oldValueJson: {
				taskListId: task.taskListId,
				title: task.title,
				description: task.description,
				status: task.status,
				priority: task.priority,
				deadlineDate: formatDateForInput(task.deadlineDate),
				billingType: task.billingType,
				flatFeeAmountCents: task.flatFeeAmountCents,
				assigneeUserIds: task.assignees.map((assignee) => assignee.userId)
			},
			newValueJson: {
				taskListId: updatedTask.taskListId,
				title: updatedTask.title,
				description: updatedTask.description,
				status: updatedTask.status,
				priority: updatedTask.priority,
				deadlineDate: formatDateForInput(updatedTask.deadlineDate),
				billingType: updatedTask.billingType,
				flatFeeAmountCents: updatedTask.flatFeeAmountCents,
				assigneeUserIds: data.assigneeUserIds,
				addedAttachmentCount: preparedAttachments.attachments.length
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { taskFormSuccess: true, taskFormTaskId: taskId };
	},

	createComment: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canCreateTaskComments(locals.user.role)) {
			return fail(403, { commentFormError: 'Нямате права за тази операция.' });
		}

		const user = locals.user;

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const raw = buildTaskCommentInput(formData);
		const parsed = taskCommentSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				commentFormErrors: parsed.error.flatten().fieldErrors,
				commentFormValues: raw,
				commentFormTaskId: raw.taskId
			});
		}

		const preparedAttachments = await prepareAttachments(formData.getAll('attachments'));
		const attachmentErrors = buildAttachmentErrorMap(preparedAttachments.errors);
		if (attachmentErrors) {
			return fail(422, {
				commentFormErrors: attachmentErrors,
				commentFormValues: raw,
				commentFormTaskId: raw.taskId
			});
		}

		const data = normalizeTaskCommentPayload(parsed.data);
		const project = await getScopedProject(company.id, data.projectId);

		if (!project) {
			return fail(404, { commentFormError: 'Проектът не е намерен.', commentFormTaskId: raw.taskId });
		}

		const task = findProjectTask(project, data.taskId);
		if (!task) {
			return fail(404, { commentFormError: 'Задачата не е намерена.', commentFormTaskId: raw.taskId });
		}

		if (!canUserReachTask(locals.user, task)) {
			return fail(403, { commentFormError: 'Нямате достъп до тази задача.', commentFormTaskId: task.id });
		}

		const comment = await db.$transaction(async (tx) => {
			const createdComment = await tx.taskComment.create({
				data: {
					taskId: task.id,
					authorUserId: user.id,
					body: data.body
				}
			});

			if (preparedAttachments.attachments.length > 0) {
				await tx.taskAttachment.createMany({
					data: preparedAttachments.attachments.map((attachment) => ({
						ownerCompanyId: company.id,
						taskId: task.id,
						taskCommentId: createdComment.id,
						uploadedByUserId: user.id,
						originalFilename: attachment.originalFilename,
						contentType: attachment.contentType,
						sizeBytes: attachment.sizeBytes,
						blob: attachment.blob as Uint8Array<ArrayBuffer>
					}))
				});
			}

			return createdComment;
		});

		await logAuditEvent({
			actorUserId: user.id,
			eventType: 'task_comment_created',
			entityType: 'task_comment',
			entityId: comment.id,
			newValueJson: {
				taskId: comment.taskId,
				body: comment.body,
				attachmentCount: preparedAttachments.attachments.length
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { commentFormSuccess: true, commentFormTaskId: task.id };
	},

	updateComment: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canCreateTaskComments(locals.user.role)) {
			return fail(403, { commentFormError: 'Нямате права за тази операция.' });
		}

		const user = locals.user;

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const commentId = String(formData.get('commentId') ?? '');
		const raw = buildTaskCommentInput(formData);
		const parsed = taskCommentSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				commentFormErrors: parsed.error.flatten().fieldErrors,
				commentFormValues: raw,
				commentFormTaskId: raw.taskId,
				commentFormCommentId: commentId
			});
		}

		const preparedAttachments = await prepareAttachments(formData.getAll('attachments'));
		const attachmentErrors = buildAttachmentErrorMap(preparedAttachments.errors);
		if (attachmentErrors) {
			return fail(422, {
				commentFormErrors: attachmentErrors,
				commentFormValues: raw,
				commentFormTaskId: raw.taskId,
				commentFormCommentId: commentId
			});
		}

		const data = normalizeTaskCommentPayload(parsed.data);
		const comment = await db.taskComment.findUnique({
			where: { id: commentId },
			include: {
				task: {
					include: {
						assignees: {
							select: {
								userId: true
							}
						},
						taskList: {
							include: {
								project: {
									include: {
										client: {
											select: {
												companyId: true
											}
										}
									}
								}
							}
						}
					}
				}
			}
		});

		if (!comment || comment.task.taskList.project.client.companyId !== company.id || comment.taskId !== data.taskId) {
			return fail(404, { commentFormError: 'Коментарът не е намерен.', commentFormTaskId: raw.taskId });
		}

		if (!canUserReachTask(locals.user, comment.task)) {
			return fail(403, { commentFormError: 'Нямате достъп до тази задача.', commentFormTaskId: comment.taskId });
		}

		if (comment.authorUserId !== locals.user.id) {
			return fail(403, {
				commentFormError: 'Можете да редактирате само собствените си коментари.',
				commentFormTaskId: comment.taskId
			});
		}

		if (comment.isDeleted) {
			return fail(409, {
				commentFormError: 'Изтритите коментари не могат да се редактират.',
				commentFormTaskId: comment.taskId
			});
		}

		if (comment.body === data.body && preparedAttachments.attachments.length === 0) {
			return {
				commentFormSuccess: true,
				commentFormTaskId: comment.taskId,
				commentFormCommentId: comment.id
			};
		}

		const editedAt = new Date();
		const updatedComment = await db.$transaction(async (tx) => {
			const nextComment = await tx.taskComment.update({
				where: { id: comment.id },
				data: {
					body: data.body,
					editedAt
				}
			});

			if (preparedAttachments.attachments.length > 0) {
				await tx.taskAttachment.createMany({
					data: preparedAttachments.attachments.map((attachment) => ({
						ownerCompanyId: company.id,
						taskId: comment.taskId,
						taskCommentId: comment.id,
						uploadedByUserId: user.id,
						originalFilename: attachment.originalFilename,
						contentType: attachment.contentType,
						sizeBytes: attachment.sizeBytes,
						blob: attachment.blob as Uint8Array<ArrayBuffer>
					}))
				});
			}

			return nextComment;
		});

		await logAuditEvent({
			actorUserId: user.id,
			eventType: 'task_comment_updated',
			entityType: 'task_comment',
			entityId: comment.id,
			oldValueJson: {
				taskId: comment.taskId,
				body: comment.body,
				editedAt: comment.editedAt?.toISOString() ?? null
			},
			newValueJson: {
				taskId: updatedComment.taskId,
				body: updatedComment.body,
				editedAt: updatedComment.editedAt?.toISOString() ?? null,
				addedAttachmentCount: preparedAttachments.attachments.length
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return {
			commentFormSuccess: true,
			commentFormTaskId: comment.taskId,
			commentFormCommentId: comment.id
		};
	},

	createTimeLog: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canCreateTaskTimeLogs(locals.user.role)) {
			return fail(403, { timeLogFormError: 'Нямате права за тази операция.' });
		}

		const user = locals.user;
		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const raw = buildTaskTimeLogInput(formData);
		const parsed = taskTimeLogSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				timeLogFormErrors: parsed.error.flatten().fieldErrors,
				timeLogFormValues: raw,
				timeLogFormTaskId: raw.taskId
			});
		}

		const data = normalizeTaskTimeLogPayload(parsed.data);
		const validation = validateTaskTimeLog(data, company.timezone);
		if (validation) {
			return fail(422, {
				timeLogFormErrors: { [validation.field]: [validation.message] },
				timeLogFormValues: raw,
				timeLogFormTaskId: raw.taskId
			});
		}

		const workDate = data.workDate;
		if (!workDate) {
			return fail(422, {
				timeLogFormErrors: { workDate: ['Използвайте валидна дата.'] },
				timeLogFormValues: raw,
				timeLogFormTaskId: raw.taskId
			});
		}

		const project = await getScopedProject(company.id, data.projectId);
		if (!project) {
			return fail(404, { timeLogFormError: 'Проектът не е намерен.', timeLogFormTaskId: raw.taskId });
		}

		const task = findProjectTask(project, data.taskId);
		if (!task) {
			return fail(404, { timeLogFormError: 'Задачата не е намерена.', timeLogFormTaskId: raw.taskId });
		}

		if (!task.assignees.some((assignee) => assignee.userId === user.id)) {
			return fail(403, {
				timeLogFormError: 'Можете да отчитате време само по възложени на вас задачи.',
				timeLogFormTaskId: task.id
			});
		}

		if (data.startMinuteOfDay != null && data.endMinuteOfDay != null) {
			const overlappingLog = await db.taskTimeLog.findFirst({
				where: {
					userId: user.id,
					workDate,
					startMinuteOfDay: { not: null, lt: data.endMinuteOfDay },
					endMinuteOfDay: { not: null, gt: data.startMinuteOfDay }
				},
				select: { id: true }
			});

			if (overlappingLog) {
				return fail(409, {
					timeLogFormErrors: { startTime: ['Има друго засичане за този ден и часови диапазон.'] },
					timeLogFormValues: raw,
					timeLogFormTaskId: task.id
				});
			}
		}

		const timeLog = await db.taskTimeLog.create({
			data: {
				taskId: task.id,
				userId: user.id,
				workDate,
				description: data.description,
				durationMinutes: data.durationMinutes,
				startMinuteOfDay: data.startMinuteOfDay,
				endMinuteOfDay: data.endMinuteOfDay
			}
		});

		await logAuditEvent({
			actorUserId: user.id,
			eventType: 'task_time_log_created',
			entityType: 'task_time_log',
			entityId: timeLog.id,
			newValueJson: {
				taskId: task.id,
				workDate: formatDateForInput(timeLog.workDate),
				durationMinutes: timeLog.durationMinutes,
				startMinuteOfDay: timeLog.startMinuteOfDay,
				endMinuteOfDay: timeLog.endMinuteOfDay
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { timeLogFormSuccess: true, timeLogFormTaskId: task.id };
	},

	deleteComment: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canSoftDeleteTaskComments(locals.user.role)) {
			return fail(403, { commentDeleteError: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const projectId = String(formData.get('projectId') ?? '');
		const taskId = String(formData.get('taskId') ?? '');
		const commentId = String(formData.get('commentId') ?? '');
		const project = await getScopedProject(company.id, projectId);

		if (!project) {
			return fail(404, { commentDeleteError: 'Проектът не е намерен.', commentDeleteTaskId: taskId });
		}

		const task = findProjectTask(project, taskId);
		if (!task) {
			return fail(404, { commentDeleteError: 'Задачата не е намерена.', commentDeleteTaskId: taskId });
		}

		const comment = task.comments.find((entry) => entry.id === commentId);
		if (!comment) {
			return fail(404, { commentDeleteError: 'Коментарът не е намерен.', commentDeleteTaskId: taskId });
		}

		if (comment.isDeleted) {
			return { commentDeleteSuccess: true, commentDeleteTaskId: task.id };
		}

		const deletedAt = new Date();
		await db.taskComment.update({
			where: { id: comment.id },
			data: {
				isDeleted: true,
				deletedAt,
				deletedByUserId: locals.user.id
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'task_comment_soft_deleted',
			entityType: 'task_comment',
			entityId: comment.id,
			oldValueJson: {
				taskId: comment.taskId,
				body: comment.body,
				isDeleted: comment.isDeleted,
				deletedAt: comment.deletedAt?.toISOString() ?? null,
				deletedByUserId: comment.deletedByUserId
			},
			newValueJson: {
				taskId: comment.taskId,
				body: comment.body,
				isDeleted: true,
				deletedAt: deletedAt.toISOString(),
				deletedByUserId: locals.user.id
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { commentDeleteSuccess: true, commentDeleteTaskId: task.id };
	},

	reopenProject: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canCreateOrManageProjects(locals.user.role)) {
			return fail(403, { reopenProjectError: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const projectId = String(formData.get('projectId') ?? '');
		const project = await getScopedProject(company.id, projectId);

		if (!project) {
			return fail(404, { reopenProjectError: 'Проектът не е намерен.' });
		}

		if (!['completed', 'cancelled'].includes(project.status)) {
			return { reopenProjectSuccess: true };
		}

		const updatedProject = await db.project.update({
			where: { id: project.id },
			data: { status: 'active' }
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'project_reopened',
			entityType: 'project',
			entityId: project.id,
			oldValueJson: { status: project.status },
			newValueJson: { status: updatedProject.status },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { reopenProjectSuccess: true };
	}
};
