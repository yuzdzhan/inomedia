import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import { ensureCompanyDefaults } from '$lib/server/company-defaults';
import type { Actions, PageServerLoad } from './$types';

const companySettingsSchema = z.object({
	legalName: z.string().trim().min(2, 'Въведете правното наименование.'),
	eikBulstat: z.string().trim().min(9, 'Въведете валиден ЕИК/БУЛСТАТ.').max(13),
	vatNumber: z.string().trim().max(32).optional(),
	registeredAddress: z.string().trim().min(5, 'Въведете регистриран адрес.'),
	molName: z.string().trim().min(2, 'Въведете МОЛ.'),
	defaultPaymentTermDays: z.coerce
		.number()
		.int('Срокът трябва да е цяло число.')
		.min(1, 'Срокът трябва да е поне 1 ден.')
		.max(365, 'Срокът не може да е над 365 дни.'),
	invoiceNextNumber: z.coerce
		.number()
		.int('Номерът трябва да е цяло число.')
		.min(1, 'Номерът трябва да е поне 1.'),
	vatRatePercent: z.coerce
		.number()
		.min(0, 'ДДС ставката не може да е отрицателна.')
		.max(100, 'ДДС ставката не може да е над 100%.'),
	vatRegistered: z.boolean()
});

const expenseCategorySchema = z.object({
	name: z.string().trim().min(2, 'Въведете име на категория.').max(80, 'Името е твърде дълго.')
});

function parseCheckbox(formData: FormData, key: string) {
	return formData.get(key) === 'on';
}

function normalizeCategoryName(name: string) {
	return name.replace(/\s+/g, ' ').trim();
}

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (user.role !== 'admin') {
		redirect(302, '/dashboard');
	}

	const company = await db.company.findFirst();
	if (!company) {
		redirect(302, '/bootstrap');
	}

	await ensureCompanyDefaults(db, company.id);

	const [expenseCategories, internalClient] = await db.$transaction([
		db.expenseCategory.findMany({
			where: { companyId: company.id },
			orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
		}),
		db.client.findFirst({
			where: { companyId: company.id, isInternal: true },
			select: {
				id: true,
				legalName: true,
				isProtectedSystem: true,
				status: true,
				_count: {
					select: { projects: true }
				}
			}
		})
	]);

	return {
		company,
		expenseCategories,
		internalClient
	};
};

export const actions: Actions = {
	updateCompany: async ({ request, locals, getClientAddress }) => {
		if (locals.user?.role !== 'admin') {
			return fail(403, { companyError: 'Нямате права за тази операция.' });
		}

		const company = await db.company.findFirst();
		if (!company) {
			return fail(404, { companyError: 'Фирмата не е инициализирана.' });
		}

		const formData = await request.formData();
		const raw = {
			legalName: String(formData.get('legalName') ?? ''),
			eikBulstat: String(formData.get('eikBulstat') ?? ''),
			vatNumber: String(formData.get('vatNumber') ?? ''),
			registeredAddress: String(formData.get('registeredAddress') ?? ''),
			molName: String(formData.get('molName') ?? ''),
			defaultPaymentTermDays: String(formData.get('defaultPaymentTermDays') ?? ''),
			invoiceNextNumber: String(formData.get('invoiceNextNumber') ?? ''),
			vatRatePercent: String(formData.get('vatRatePercent') ?? ''),
			vatRegistered: parseCheckbox(formData, 'vatRegistered')
		};

		const parsed = companySettingsSchema.safeParse(raw);
		if (!parsed.success) {
			return fail(422, {
				companyErrors: parsed.error.flatten().fieldErrors,
				companyValues: raw
			});
		}

		const data = parsed.data;
		const updatedCompany = await db.company.update({
			where: { id: company.id },
			data: {
				legalName: data.legalName,
				eikBulstat: data.eikBulstat,
				vatNumber: data.vatNumber || null,
				registeredAddress: data.registeredAddress,
				molName: data.molName,
				defaultPaymentTermDays: data.defaultPaymentTermDays,
				invoiceNextNumber: data.invoiceNextNumber,
				vatRegistered: data.vatRegistered,
				vatRateBasisPoints: Math.round(data.vatRatePercent * 100)
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'company_settings_updated',
			entityType: 'company',
			entityId: company.id,
			oldValueJson: {
				legalName: company.legalName,
				eikBulstat: company.eikBulstat,
				vatNumber: company.vatNumber,
				registeredAddress: company.registeredAddress,
				molName: company.molName,
				defaultPaymentTermDays: company.defaultPaymentTermDays,
				invoiceNextNumber: company.invoiceNextNumber,
				vatRegistered: company.vatRegistered,
				vatRateBasisPoints: company.vatRateBasisPoints
			},
			newValueJson: {
				legalName: updatedCompany.legalName,
				eikBulstat: updatedCompany.eikBulstat,
				vatNumber: updatedCompany.vatNumber,
				registeredAddress: updatedCompany.registeredAddress,
				molName: updatedCompany.molName,
				defaultPaymentTermDays: updatedCompany.defaultPaymentTermDays,
				invoiceNextNumber: updatedCompany.invoiceNextNumber,
				vatRegistered: updatedCompany.vatRegistered,
				vatRateBasisPoints: updatedCompany.vatRateBasisPoints
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { companySuccess: true };
	},

	addExpenseCategory: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') {
			return fail(403, { categoryError: 'Нямате права за тази операция.' });
		}

		const company = await db.company.findFirst();
		if (!company) {
			return fail(404, { categoryError: 'Фирмата не е инициализирана.' });
		}

		const formData = await request.formData();
		const raw = {
			name: normalizeCategoryName(String(formData.get('name') ?? ''))
		};

		const parsed = expenseCategorySchema.safeParse(raw);
		if (!parsed.success) {
			return fail(422, {
				categoryErrors: parsed.error.flatten().fieldErrors,
				categoryValues: raw
			});
		}

		const existingCategory = await db.expenseCategory.findFirst({
			where: {
				companyId: company.id,
				name: {
					equals: parsed.data.name,
					mode: 'insensitive'
				}
			}
		});

		if (existingCategory) {
			return fail(409, {
				categoryErrors: { name: ['Категория с това име вече съществува.'] },
				categoryValues: raw
			});
		}

		const category = await db.expenseCategory.create({
			data: {
				companyId: company.id,
				name: parsed.data.name
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'expense_category_created',
			entityType: 'expense_category',
			entityId: category.id,
			newValueJson: { name: category.name, isActive: category.isActive }
		});

		return { categorySuccess: true };
	},

	toggleExpenseCategory: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') {
			return fail(403, { categoryToggleError: 'Нямате права за тази операция.' });
		}

		const formData = await request.formData();
		const categoryId = String(formData.get('categoryId') ?? '');
		const nextActive = String(formData.get('isActive') ?? '') === 'true';

		const category = await db.expenseCategory.findUnique({
			where: { id: categoryId }
		});

		if (!category) {
			return fail(404, { categoryToggleError: 'Категорията не е намерена.' });
		}

		const updatedCategory = await db.expenseCategory.update({
			where: { id: categoryId },
			data: { isActive: nextActive }
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: nextActive ? 'expense_category_activated' : 'expense_category_deactivated',
			entityType: 'expense_category',
			entityId: category.id,
			oldValueJson: { isActive: category.isActive },
			newValueJson: { isActive: updatedCategory.isActive, name: updatedCategory.name }
		});

		return { categoryToggleSuccess: true };
	}
};
