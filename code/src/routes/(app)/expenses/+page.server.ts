import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

// ─── Role helpers ──────────────────────────────────────────────────────────

function canViewExpenses(role: string) {
	return ['admin', 'accountant', 'manager'].includes(role);
}

function canManageFinanceExpenses(role: string) {
	return ['admin', 'accountant'].includes(role);
}

function canManageProjectExpenses(role: string) {
	return ['admin', 'accountant', 'manager'].includes(role);
}

function canMarkPaid(role: string) {
	return ['admin', 'accountant'].includes(role);
}

function canManageCategories(role: string) {
	return role === 'admin';
}

function canManageRecurringTemplates(role: string) {
	return ['admin', 'accountant'].includes(role);
}

// ─── Schemas ───────────────────────────────────────────────────────────────

const expenseSchema = z.object({
	categoryId: z.string().min(1, 'Изберете категория.'),
	description: z.string().trim().min(2, 'Описанието е задължително.').max(500, 'Описанието е твърде дълго.'),
	amountCents: z.coerce
		.number()
		.int('Сумата трябва да е цяло число.')
		.min(1, 'Сумата трябва да е положителна.'),
	incurredDate: z.string().min(1, 'Датата е задължителна.'),
	clientId: z.string().optional(),
	projectId: z.string().optional()
});

const categorySchema = z.object({
	name: z.string().trim().min(2, 'Въведете наименование.').max(120, 'Наименованието е твърде дълго.')
});

const recurringTemplateSchema = z.object({
	categoryId: z.string().min(1, 'Изберете категория.'),
	description: z.string().trim().min(2, 'Описанието е задължително.').max(500, 'Описанието е твърде дълго.'),
	amountCents: z.coerce
		.number()
		.int('Сумата трябва да е цяло число.')
		.min(1, 'Сумата трябва да е положителна.'),
	frequency: z.enum(['monthly', 'yearly'], { message: 'Изберете честота.' }),
	startDate: z.string().min(1, 'Началната дата е задължителна.'),
	endDate: z.string().optional(),
	clientId: z.string().optional(),
	projectId: z.string().optional()
});

// ─── Occurrence generation helper ──────────────────────────────────────────

function generateOccurrenceDates(
	frequency: 'monthly' | 'yearly',
	startDate: Date,
	endDate: Date | null | undefined
): Date[] {
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const limitDate = new Date(today);
	limitDate.setMonth(limitDate.getMonth() + 12);

	const ceiling = endDate && endDate < limitDate ? endDate : limitDate;

	const dates: Date[] = [];

	if (frequency === 'monthly') {
		// Start from the first day of the month containing startDate or today, whichever is later
		let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
		while (cursor <= ceiling) {
			if (cursor >= today) {
				dates.push(new Date(cursor));
			}
			cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
		}
	} else {
		// yearly: same month+day as startDate, each year
		let year = startDate.getFullYear();
		while (true) {
			const candidate = new Date(year, startDate.getMonth(), startDate.getDate());
			if (candidate > ceiling) break;
			if (candidate >= today) {
				dates.push(new Date(candidate));
			}
			year++;
		}
	}

	return dates;
}

// ─── Load ──────────────────────────────────────────────────────────────────

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();

	if (!canViewExpenses(user.role)) {
		redirect(302, '/dashboard');
	}

	const company = await db.company.findFirst();
	if (!company) {
		redirect(302, '/bootstrap');
	}

	const categories = await db.expenseCategory.findMany({
		where: { companyId: company.id },
		orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
	});

	const activeCategories = categories.filter((c) => c.isActive);

	// Load clients and their projects for linking
	const clients = await db.client.findMany({
		where: { companyId: company.id, status: 'active' },
		orderBy: { legalName: 'asc' },
		include: {
			projects: {
				where: { status: 'active' },
				orderBy: { name: 'asc' },
				include: {
					members: { select: { userId: true } }
				}
			}
		}
	});

	// For managers: only show projects they manage or are member of
	let accessibleProjects: string[] = [];
	if (user.role === 'manager') {
		const managerProjects = await db.project.findMany({
			where: {
				OR: [
					{ primaryManagerUserId: user.id },
					{ members: { some: { userId: user.id } } }
				]
			},
			select: { id: true }
		});
		accessibleProjects = managerProjects.map((p) => p.id);
	}

	// Load expenses based on role
	const expenseWhere =
		user.role === 'manager'
			? {
					companyId: company.id,
					projectId: { in: accessibleProjects }
				}
			: { companyId: company.id };

	const expenses = await db.expense.findMany({
		where: expenseWhere,
		orderBy: { incurredDate: 'desc' },
		include: {
			category: true,
			client: { select: { id: true, legalName: true } },
			project: { select: { id: true, name: true } },
			createdByUser: { select: { id: true, firstName: true, lastName: true } },
			paidByUser: { select: { id: true, firstName: true, lastName: true } }
		}
	});

	// Load recurring templates (admin/accountant only)
	const recurringTemplates = canManageRecurringTemplates(user.role)
		? await db.recurringExpenseTemplate.findMany({
				where: { companyId: company.id },
				orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
				include: {
					category: true,
					client: { select: { id: true, legalName: true } },
					project: { select: { id: true, name: true } },
					createdByUser: { select: { id: true, firstName: true, lastName: true } }
				}
			})
		: [];

	return {
		categories,
		activeCategories,
		clients,
		expenses,
		recurringTemplates,
		accessibleProjects,
		permissions: {
			canManageFinance: canManageFinanceExpenses(user.role),
			canManageProject: canManageProjectExpenses(user.role),
			canMarkPaid: canMarkPaid(user.role),
			canManageCategories: canManageCategories(user.role),
			canManageRecurring: canManageRecurringTemplates(user.role),
			isManager: user.role === 'manager'
		}
	};
};

// ─── Actions ───────────────────────────────────────────────────────────────

export const actions: Actions = {
	createExpense: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageProjectExpenses(locals.user.role)) {
			return fail(403, { createExpenseError: 'Нямате права за тази операция.' });
		}

		const company = await db.company.findFirst();
		if (!company) return fail(500, { createExpenseError: 'Грешка при зареждане на компанията.' });

		const formData = await request.formData();
		const raw = {
			categoryId: String(formData.get('categoryId') ?? ''),
			description: String(formData.get('description') ?? ''),
			amountCents: String(formData.get('amountCents') ?? ''),
			incurredDate: String(formData.get('incurredDate') ?? ''),
			clientId: String(formData.get('clientId') ?? '') || undefined,
			projectId: String(formData.get('projectId') ?? '') || undefined
		};

		const parsed = expenseSchema.safeParse(raw);
		if (!parsed.success) {
			return fail(422, {
				createExpenseErrors: parsed.error.flatten().fieldErrors,
				createExpenseValues: raw
			});
		}

		const data = parsed.data;

		// Manager can only create project-linked expenses for their projects
		if (locals.user.role === 'manager') {
			if (!data.projectId) {
				return fail(403, { createExpenseError: 'Мениджърите могат да създават само разходи, свързани с проект.' });
			}
			const project = await db.project.findFirst({
				where: {
					id: data.projectId,
					OR: [
						{ primaryManagerUserId: locals.user.id },
						{ members: { some: { userId: locals.user.id } } }
					]
				}
			});
			if (!project) {
				return fail(403, { createExpenseError: 'Нямате достъп до избрания проект.' });
			}
		}

		// Validate category belongs to company
		const category = await db.expenseCategory.findFirst({
			where: { id: data.categoryId, companyId: company.id, isActive: true }
		});
		if (!category) {
			return fail(400, { createExpenseError: 'Невалидна категория.' });
		}

		// Validate client/project belong to company
		if (data.clientId) {
			const client = await db.client.findFirst({ where: { id: data.clientId, companyId: company.id } });
			if (!client) return fail(400, { createExpenseError: 'Невалиден клиент.' });
		}
		if (data.projectId) {
			const project = await db.project.findFirst({ where: { id: data.projectId } });
			if (!project) return fail(400, { createExpenseError: 'Невалиден проект.' });
		}

		const expense = await db.expense.create({
			data: {
				companyId: company.id,
				categoryId: data.categoryId,
				clientId: data.clientId ?? null,
				projectId: data.projectId ?? null,
				description: data.description,
				amountCents: data.amountCents,
				incurredDate: new Date(data.incurredDate),
				createdByUserId: locals.user.id
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'expense_created',
			entityType: 'expense',
			entityId: expense.id,
			newValueJson: {
				categoryId: data.categoryId,
				description: data.description,
				amountCents: data.amountCents,
				incurredDate: data.incurredDate,
				clientId: data.clientId,
				projectId: data.projectId
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { createExpenseSuccess: true };
	},

	editExpense: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageProjectExpenses(locals.user.role)) {
			return fail(403, { editExpenseError: 'Нямате права за тази операция.' });
		}

		const formData = await request.formData();
		const expenseId = String(formData.get('expenseId') ?? '');
		const raw = {
			categoryId: String(formData.get('categoryId') ?? ''),
			description: String(formData.get('description') ?? ''),
			amountCents: String(formData.get('amountCents') ?? ''),
			incurredDate: String(formData.get('incurredDate') ?? ''),
			clientId: String(formData.get('clientId') ?? '') || undefined,
			projectId: String(formData.get('projectId') ?? '') || undefined
		};

		const parsed = expenseSchema.safeParse(raw);
		if (!parsed.success) {
			return fail(422, {
				editExpenseErrors: parsed.error.flatten().fieldErrors,
				editExpenseValues: raw,
				editExpenseId: expenseId
			});
		}

		const data = parsed.data;

		const expense = await db.expense.findUnique({ where: { id: expenseId } });
		if (!expense) {
			return fail(404, { editExpenseError: 'Разходът не е намерен.', editExpenseId: expenseId });
		}

		// Manager restrictions
		if (locals.user.role === 'manager') {
			if (!data.projectId) {
				return fail(403, { editExpenseError: 'Мениджърите могат само да редактират разходи, свързани с проект.', editExpenseId: expenseId });
			}
			const project = await db.project.findFirst({
				where: {
					id: data.projectId,
					OR: [
						{ primaryManagerUserId: locals.user.id },
						{ members: { some: { userId: locals.user.id } } }
					]
				}
			});
			if (!project) {
				return fail(403, { editExpenseError: 'Нямате достъп до избрания проект.', editExpenseId: expenseId });
			}
			// Also ensure the current expense's project is accessible
			if (expense.projectId) {
				const currentProject = await db.project.findFirst({
					where: {
						id: expense.projectId,
						OR: [
							{ primaryManagerUserId: locals.user.id },
							{ members: { some: { userId: locals.user.id } } }
						]
					}
				});
				if (!currentProject) {
					return fail(403, { editExpenseError: 'Нямате достъп до този разход.', editExpenseId: expenseId });
				}
			}
		}

		const updatedExpense = await db.expense.update({
			where: { id: expenseId },
			data: {
				categoryId: data.categoryId,
				clientId: data.clientId ?? null,
				projectId: data.projectId ?? null,
				description: data.description,
				amountCents: data.amountCents,
				incurredDate: new Date(data.incurredDate)
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'expense_updated',
			entityType: 'expense',
			entityId: expenseId,
			oldValueJson: {
				categoryId: expense.categoryId,
				description: expense.description,
				amountCents: expense.amountCents,
				incurredDate: expense.incurredDate,
				clientId: expense.clientId,
				projectId: expense.projectId
			},
			newValueJson: {
				categoryId: updatedExpense.categoryId,
				description: updatedExpense.description,
				amountCents: updatedExpense.amountCents,
				incurredDate: updatedExpense.incurredDate,
				clientId: updatedExpense.clientId,
				projectId: updatedExpense.projectId
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { editExpenseSuccess: true, editExpenseId: expenseId };
	},

	markPaid: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canMarkPaid(locals.user.role)) {
			return fail(403, { markPaidError: 'Нямате права за тази операция.' });
		}

		const formData = await request.formData();
		const expenseId = String(formData.get('expenseId') ?? '');
		const paidDate = String(formData.get('paidDate') ?? '');

		if (!paidDate) {
			return fail(422, { markPaidError: 'Въведете дата на плащане.', markPaidExpenseId: expenseId });
		}

		const expense = await db.expense.findUnique({ where: { id: expenseId } });
		if (!expense) {
			return fail(404, { markPaidError: 'Разходът не е намерен.', markPaidExpenseId: expenseId });
		}
		if (expense.status === 'paid') {
			return fail(400, { markPaidError: 'Разходът вече е маркиран като платен.', markPaidExpenseId: expenseId });
		}

		await db.expense.update({
			where: { id: expenseId },
			data: {
				status: 'paid',
				paidDate: new Date(paidDate),
				paidByUserId: locals.user.id
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'expense_marked_paid',
			entityType: 'expense',
			entityId: expenseId,
			oldValueJson: { status: 'unpaid' },
			newValueJson: { status: 'paid', paidDate, paidByUserId: locals.user.id },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { markPaidSuccess: true, markPaidExpenseId: expenseId };
	},

	addCategory: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageCategories(locals.user.role)) {
			return fail(403, { addCategoryError: 'Нямате права за тази операция.' });
		}

		const company = await db.company.findFirst();
		if (!company) return fail(500, { addCategoryError: 'Грешка при зареждане на компанията.' });

		const formData = await request.formData();
		const raw = { name: String(formData.get('name') ?? '') };
		const parsed = categorySchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				addCategoryErrors: parsed.error.flatten().fieldErrors,
				addCategoryValues: raw
			});
		}

		const existing = await db.expenseCategory.findFirst({
			where: { companyId: company.id, name: { equals: parsed.data.name, mode: 'insensitive' } }
		});
		if (existing) {
			return fail(409, {
				addCategoryErrors: { name: ['Категория с това наименование вече съществува.'] },
				addCategoryValues: raw
			});
		}

		const category = await db.expenseCategory.create({
			data: { companyId: company.id, name: parsed.data.name }
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'expense_category_created',
			entityType: 'expense_category',
			entityId: category.id,
			newValueJson: { name: category.name },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { addCategorySuccess: true };
	},

	deactivateCategory: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageCategories(locals.user.role)) {
			return fail(403, { deactivateCategoryError: 'Нямате права за тази операция.' });
		}

		const formData = await request.formData();
		const categoryId = String(formData.get('categoryId') ?? '');

		const category = await db.expenseCategory.findUnique({ where: { id: categoryId } });
		if (!category) {
			return fail(404, { deactivateCategoryError: 'Категорията не е намерена.' });
		}
		if (!category.isActive) {
			return fail(400, { deactivateCategoryError: 'Категорията вече е неактивна.' });
		}

		await db.expenseCategory.update({
			where: { id: categoryId },
			data: { isActive: false }
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'expense_category_deactivated',
			entityType: 'expense_category',
			entityId: categoryId,
			oldValueJson: { isActive: true },
			newValueJson: { isActive: false },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { deactivateCategorySuccess: true };
	},

	createRecurringTemplate: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageRecurringTemplates(locals.user.role)) {
			return fail(403, { createTemplateError: 'Нямате права за тази операция.' });
		}

		const company = await db.company.findFirst();
		if (!company) return fail(500, { createTemplateError: 'Грешка при зареждане на компанията.' });

		const formData = await request.formData();
		const raw = {
			categoryId: String(formData.get('categoryId') ?? ''),
			description: String(formData.get('description') ?? ''),
			amountCents: String(formData.get('amountCents') ?? ''),
			frequency: String(formData.get('frequency') ?? ''),
			startDate: String(formData.get('startDate') ?? ''),
			endDate: String(formData.get('endDate') ?? '') || undefined,
			clientId: String(formData.get('clientId') ?? '') || undefined,
			projectId: String(formData.get('projectId') ?? '') || undefined
		};

		const parsed = recurringTemplateSchema.safeParse(raw);
		if (!parsed.success) {
			return fail(422, {
				createTemplateErrors: parsed.error.flatten().fieldErrors,
				createTemplateValues: raw
			});
		}

		const data = parsed.data;

		// Validate category
		const category = await db.expenseCategory.findFirst({
			where: { id: data.categoryId, companyId: company.id, isActive: true }
		});
		if (!category) return fail(400, { createTemplateError: 'Невалидна категория.' });

		// Validate client/project
		if (data.clientId) {
			const client = await db.client.findFirst({ where: { id: data.clientId, companyId: company.id } });
			if (!client) return fail(400, { createTemplateError: 'Невалиден клиент.' });
		}
		if (data.projectId) {
			const project = await db.project.findFirst({ where: { id: data.projectId } });
			if (!project) return fail(400, { createTemplateError: 'Невалиден проект.' });
		}

		const startDate = new Date(data.startDate);
		const endDate = data.endDate ? new Date(data.endDate) : null;

		const occurrenceDates = generateOccurrenceDates(data.frequency, startDate, endDate);

		const template = await db.$transaction(async (tx) => {
			const tpl = await tx.recurringExpenseTemplate.create({
				data: {
					companyId: company.id,
					categoryId: data.categoryId,
					clientId: data.clientId ?? null,
					projectId: data.projectId ?? null,
					description: data.description,
					amountCents: data.amountCents,
					frequency: data.frequency,
					startDate,
					endDate,
					isActive: true,
					createdByUserId: locals.user!.id
				}
			});

			if (occurrenceDates.length > 0) {
				await tx.expense.createMany({
					data: occurrenceDates.map((date) => ({
						companyId: company.id,
						categoryId: data.categoryId,
						clientId: data.clientId ?? null,
						projectId: data.projectId ?? null,
						description: data.description,
						amountCents: data.amountCents,
						incurredDate: date,
						status: 'unpaid' as const,
						isFromTemplate: true,
						recurringTemplateId: tpl.id,
						createdByUserId: locals.user!.id
					}))
				});
			}

			return tpl;
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'recurring_expense_template_created',
			entityType: 'recurring_expense_template',
			entityId: template.id,
			newValueJson: {
				categoryId: data.categoryId,
				description: data.description,
				amountCents: data.amountCents,
				frequency: data.frequency,
				startDate: data.startDate,
				endDate: data.endDate,
				clientId: data.clientId,
				projectId: data.projectId,
				occurrencesGenerated: occurrenceDates.length
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { createTemplateSuccess: true };
	},

	editRecurringTemplate: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageRecurringTemplates(locals.user.role)) {
			return fail(403, { editTemplateError: 'Нямате права за тази операция.' });
		}

		const formData = await request.formData();
		const templateId = String(formData.get('templateId') ?? '');
		const raw = {
			categoryId: String(formData.get('categoryId') ?? ''),
			description: String(formData.get('description') ?? ''),
			amountCents: String(formData.get('amountCents') ?? ''),
			frequency: String(formData.get('frequency') ?? ''),
			startDate: String(formData.get('startDate') ?? ''),
			endDate: String(formData.get('endDate') ?? '') || undefined,
			clientId: String(formData.get('clientId') ?? '') || undefined,
			projectId: String(formData.get('projectId') ?? '') || undefined
		};

		const parsed = recurringTemplateSchema.safeParse(raw);
		if (!parsed.success) {
			return fail(422, {
				editTemplateErrors: parsed.error.flatten().fieldErrors,
				editTemplateValues: raw,
				editTemplateId: templateId
			});
		}

		const data = parsed.data;

		const template = await db.recurringExpenseTemplate.findUnique({ where: { id: templateId } });
		if (!template) {
			return fail(404, { editTemplateError: 'Шаблонът не е намерен.', editTemplateId: templateId });
		}

		const startDate = new Date(data.startDate);
		const endDate = data.endDate ? new Date(data.endDate) : null;

		const occurrenceDates = generateOccurrenceDates(data.frequency, startDate, endDate);

		await db.$transaction(async (tx) => {
			// Delete existing unpaid occurrences linked to this template
			await tx.expense.deleteMany({
				where: {
					recurringTemplateId: templateId,
					status: 'unpaid'
				}
			});

			// Update the template
			await tx.recurringExpenseTemplate.update({
				where: { id: templateId },
				data: {
					categoryId: data.categoryId,
					clientId: data.clientId ?? null,
					projectId: data.projectId ?? null,
					description: data.description,
					amountCents: data.amountCents,
					frequency: data.frequency,
					startDate,
					endDate
				}
			});

			// Recreate occurrences
			if (occurrenceDates.length > 0) {
				await tx.expense.createMany({
					data: occurrenceDates.map((date) => ({
						companyId: template.companyId,
						categoryId: data.categoryId,
						clientId: data.clientId ?? null,
						projectId: data.projectId ?? null,
						description: data.description,
						amountCents: data.amountCents,
						incurredDate: date,
						status: 'unpaid' as const,
						isFromTemplate: true,
						recurringTemplateId: templateId,
						createdByUserId: locals.user!.id
					}))
				});
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'recurring_expense_template_updated',
			entityType: 'recurring_expense_template',
			entityId: templateId,
			oldValueJson: {
				categoryId: template.categoryId,
				description: template.description,
				amountCents: template.amountCents,
				frequency: template.frequency,
				startDate: template.startDate,
				endDate: template.endDate,
				clientId: template.clientId,
				projectId: template.projectId
			},
			newValueJson: {
				categoryId: data.categoryId,
				description: data.description,
				amountCents: data.amountCents,
				frequency: data.frequency,
				startDate: data.startDate,
				endDate: data.endDate,
				clientId: data.clientId,
				projectId: data.projectId,
				occurrencesGenerated: occurrenceDates.length
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { editTemplateSuccess: true, editTemplateId: templateId };
	},

	deactivateRecurringTemplate: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageRecurringTemplates(locals.user.role)) {
			return fail(403, { deactivateTemplateError: 'Нямате права за тази операция.' });
		}

		const formData = await request.formData();
		const templateId = String(formData.get('templateId') ?? '');

		const template = await db.recurringExpenseTemplate.findUnique({ where: { id: templateId } });
		if (!template) {
			return fail(404, { deactivateTemplateError: 'Шаблонът не е намерен.' });
		}
		if (!template.isActive) {
			return fail(400, { deactivateTemplateError: 'Шаблонът вече е деактивиран.' });
		}

		await db.$transaction(async (tx) => {
			// Delete future unpaid occurrences
			await tx.expense.deleteMany({
				where: {
					recurringTemplateId: templateId,
					status: 'unpaid'
				}
			});

			// Deactivate template
			await tx.recurringExpenseTemplate.update({
				where: { id: templateId },
				data: { isActive: false }
			});
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'recurring_expense_template_deactivated',
			entityType: 'recurring_expense_template',
			entityId: templateId,
			oldValueJson: { isActive: true },
			newValueJson: { isActive: false },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { deactivateTemplateSuccess: true };
	}
};
