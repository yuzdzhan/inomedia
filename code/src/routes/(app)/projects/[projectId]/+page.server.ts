import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { TaskBillingType, TaskPriority, TaskStatus } from '@prisma/client';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import { ensureCompanyDefaults } from '$lib/server/company-defaults';
import { canCreateOrManageProjects, canViewProjectFinancials } from '$lib/server/project-policy';
import {
	canAccessProjectTasks,
	canCreateTaskComments,
	canManageProjectTasks,
	canSoftDeleteTaskComments,
	formatDateForInput,
	normalizeTaskCommentBody,
	normalizeOptionalTaskDescription,
	normalizeTaskListName,
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
	body: z.string().trim().min(1, 'Ð’ÑŠÐ²ÐµÐ´ÐµÑ‚Ðµ ÐºÐ¾Ð¼ÐµÐ½Ñ‚Ð°Ñ€.').max(4000, 'ÐšÐ¾Ð¼ÐµÐ½Ñ‚Ð°Ñ€ÑŠÑ‚ Ðµ Ñ‚Ð²ÑŠÑ€Ð´Ðµ Ð´ÑŠÐ»ÑŠÐ³.')
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
		company: { currency: company.currency },
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

		const task = await db.task.create({
			data: {
				taskListId: taskList.id,
				title: data.title,
				description: data.description,
				status: data.status,
				priority: data.priority,
				deadlineDate: data.deadlineDate,
				billingType: data.billingType,
				flatFeeAmountCents: data.billingType === 'flat_fee' ? data.flatFeeAmountCents : null,
				createdByUserId: locals.user.id,
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

		await logAuditEvent({
			actorUserId: locals.user.id,
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
				assigneeUserIds: data.assigneeUserIds
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

			return nextTask;
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
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
				assigneeUserIds: data.assigneeUserIds
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { taskFormSuccess: true, taskFormTaskId: taskId };
	},

	createComment: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canCreateTaskComments(locals.user.role)) {
			return fail(403, { commentFormError: 'ÐÑÐ¼Ð°Ñ‚Ðµ Ð¿Ñ€Ð°Ð²Ð° Ð·Ð° Ñ‚Ð°Ð·Ð¸ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ñ.' });
		}

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

		const data = normalizeTaskCommentPayload(parsed.data);
		const project = await getScopedProject(company.id, data.projectId);

		if (!project) {
			return fail(404, { commentFormError: 'ÐŸÑ€Ð¾ÐµÐºÑ‚ÑŠÑ‚ Ð½Ðµ Ðµ Ð½Ð°Ð¼ÐµÑ€ÐµÐ½.', commentFormTaskId: raw.taskId });
		}

		const task = findProjectTask(project, data.taskId);
		if (!task) {
			return fail(404, { commentFormError: 'Ð—Ð°Ð´Ð°Ñ‡Ð°Ñ‚Ð° Ð½Ðµ Ðµ Ð½Ð°Ð¼ÐµÑ€ÐµÐ½Ð°.', commentFormTaskId: raw.taskId });
		}

		if (!canUserReachTask(locals.user, task)) {
			return fail(403, { commentFormError: 'ÐÑÐ¼Ð°Ñ‚Ðµ Ð´Ð¾ÑÑ‚ÑŠÐ¿ Ð´Ð¾ Ñ‚Ð°Ð·Ð¸ Ð·Ð°Ð´Ð°Ñ‡Ð°.', commentFormTaskId: task.id });
		}

		const comment = await db.taskComment.create({
			data: {
				taskId: task.id,
				authorUserId: locals.user.id,
				body: data.body
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'task_comment_created',
			entityType: 'task_comment',
			entityId: comment.id,
			newValueJson: {
				taskId: comment.taskId,
				body: comment.body
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { commentFormSuccess: true, commentFormTaskId: task.id };
	},

	updateComment: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canCreateTaskComments(locals.user.role)) {
			return fail(403, { commentFormError: 'ÐÑÐ¼Ð°Ñ‚Ðµ Ð¿Ñ€Ð°Ð²Ð° Ð·Ð° Ñ‚Ð°Ð·Ð¸ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ñ.' });
		}

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
			return fail(404, { commentFormError: 'ÐšÐ¾Ð¼ÐµÐ½Ñ‚Ð°Ñ€ÑŠÑ‚ Ð½Ðµ Ðµ Ð½Ð°Ð¼ÐµÑ€ÐµÐ½.', commentFormTaskId: raw.taskId });
		}

		if (!canUserReachTask(locals.user, comment.task)) {
			return fail(403, { commentFormError: 'ÐÑÐ¼Ð°Ñ‚Ðµ Ð´Ð¾ÑÑ‚ÑŠÐ¿ Ð´Ð¾ Ñ‚Ð°Ð·Ð¸ Ð·Ð°Ð´Ð°Ñ‡Ð°.', commentFormTaskId: comment.taskId });
		}

		if (comment.authorUserId !== locals.user.id) {
			return fail(403, {
				commentFormError: 'ÐœÐ¾Ð¶ÐµÑ‚Ðµ Ð´Ð° Ñ€ÐµÐ´Ð°ÐºÑ‚Ð¸Ñ€Ð°Ñ‚Ðµ ÑÐ°Ð¼Ð¾ ÑÐ¾Ð±ÑÑ‚Ð²ÐµÐ½Ð¸Ñ‚Ðµ ÑÐ¸ ÐºÐ¾Ð¼ÐµÐ½Ñ‚Ð°Ñ€Ð¸.',
				commentFormTaskId: comment.taskId
			});
		}

		if (comment.isDeleted) {
			return fail(409, {
				commentFormError: 'Ð˜Ð·Ñ‚Ñ€Ð¸Ñ‚Ð¸Ñ‚Ðµ ÐºÐ¾Ð¼ÐµÐ½Ñ‚Ð°Ñ€Ð¸ Ð½Ðµ Ð¼Ð¾Ð³Ð°Ñ‚ Ð´Ð° ÑÐµ Ñ€ÐµÐ´Ð°ÐºÑ‚Ð¸Ñ€Ð°Ñ‚.',
				commentFormTaskId: comment.taskId
			});
		}

		if (comment.body === data.body) {
			return {
				commentFormSuccess: true,
				commentFormTaskId: comment.taskId,
				commentFormCommentId: comment.id
			};
		}

		const editedAt = new Date();
		const updatedComment = await db.taskComment.update({
			where: { id: comment.id },
			data: {
				body: data.body,
				editedAt
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
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
				editedAt: updatedComment.editedAt?.toISOString() ?? null
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

	deleteComment: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canSoftDeleteTaskComments(locals.user.role)) {
			return fail(403, { commentDeleteError: 'ÐÑÐ¼Ð°Ñ‚Ðµ Ð¿Ñ€Ð°Ð²Ð° Ð·Ð° Ñ‚Ð°Ð·Ð¸ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ñ.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const projectId = String(formData.get('projectId') ?? '');
		const taskId = String(formData.get('taskId') ?? '');
		const commentId = String(formData.get('commentId') ?? '');
		const project = await getScopedProject(company.id, projectId);

		if (!project) {
			return fail(404, { commentDeleteError: 'ÐŸÑ€Ð¾ÐµÐºÑ‚ÑŠÑ‚ Ð½Ðµ Ðµ Ð½Ð°Ð¼ÐµÑ€ÐµÐ½.', commentDeleteTaskId: taskId });
		}

		const task = findProjectTask(project, taskId);
		if (!task) {
			return fail(404, { commentDeleteError: 'Ð—Ð°Ð´Ð°Ñ‡Ð°Ñ‚Ð° Ð½Ðµ Ðµ Ð½Ð°Ð¼ÐµÑ€ÐµÐ½Ð°.', commentDeleteTaskId: taskId });
		}

		const comment = task.comments.find((entry) => entry.id === commentId);
		if (!comment) {
			return fail(404, { commentDeleteError: 'ÐšÐ¾Ð¼ÐµÐ½Ñ‚Ð°Ñ€ÑŠÑ‚ Ð½Ðµ Ðµ Ð½Ð°Ð¼ÐµÑ€ÐµÐ½.', commentDeleteTaskId: taskId });
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
