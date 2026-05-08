import { fail, redirect, error, isHttpError, isRedirect } from '@sveltejs/kit';
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

const companyContactSchema = z.object({
	email: z.string().trim().email('Въведете валиден имейл.').optional().or(z.literal('')),
	phone: z.string().trim().max(32).optional(),
	website: z.string().trim().max(120).optional(),
	bankName: z.string().trim().max(120).optional(),
	bankIban: z.string().trim().max(34).optional(),
	bankBic: z.string().trim().max(11).optional()
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
	try {
		const { user } = await parent();
		if (user.role !== 'admin') {
			redirect(302, '/dashboard');
		}

		const company = await db.company.findFirst();
		if (!company) {
			redirect(302, '/bootstrap');
		}

		await ensureCompanyDefaults(db, company.id);

		const [expenseCategories, internalClient, moneyContainers] = await db.$transaction([
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
			}),
			db.moneyContainer.findMany({
				where: { companyId: company.id },
				orderBy: { containerType: 'asc' }
			})
		]);

		return {
			company,
			expenseCategories,
			internalClient,
			moneyContainers
		};
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане на данните.');
	}
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

	updateCompanyContact: async ({ request, locals, getClientAddress }) => {
		if (locals.user?.role !== 'admin') {
			return fail(403, { contactError: 'Нямате права за тази операция.' });
		}

		const company = await db.company.findFirst();
		if (!company) {
			return fail(404, { contactError: 'Фирмата не е инициализирана.' });
		}

		const formData = await request.formData();
		const raw = {
			email: String(formData.get('email') ?? ''),
			phone: String(formData.get('phone') ?? ''),
			website: String(formData.get('website') ?? ''),
			bankName: String(formData.get('bankName') ?? ''),
			bankIban: String(formData.get('bankIban') ?? ''),
			bankBic: String(formData.get('bankBic') ?? '')
		};

		const parsed = companyContactSchema.safeParse(raw);
		if (!parsed.success) {
			return fail(422, {
				contactErrors: parsed.error.flatten().fieldErrors,
				contactValues: raw
			});
		}

		const d = parsed.data;
		await db.company.update({
			where: { id: company.id },
			data: {
				email: d.email || null,
				phone: d.phone || null,
				website: d.website || null,
				bankName: d.bankName || null,
				bankIban: d.bankIban || null,
				bankBic: d.bankBic || null
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'company_settings_updated',
			entityType: 'company',
			entityId: company.id,
			oldValueJson: { email: company.email, phone: company.phone, website: company.website, bankName: company.bankName, bankIban: company.bankIban, bankBic: company.bankBic },
			newValueJson: { email: d.email, phone: d.phone, website: d.website, bankName: d.bankName, bankIban: d.bankIban, bankBic: d.bankBic },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { contactSuccess: true };
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

	updateContainerBalance: async ({ request, locals, getClientAddress }) => {
		if (locals.user?.role !== 'admin') {
			return fail(403, { balanceError: 'Нямате права за тази операция.' });
		}

		const formData = await request.formData();
		const containerId = String(formData.get('containerId') ?? '');
		const balanceStr = String(formData.get('openingBalance') ?? '');
		const balanceEur = parseFloat(balanceStr);

		if (!containerId || isNaN(balanceEur)) {
			return fail(422, { balanceError: 'Невалидни данни.' });
		}

		const container = await db.moneyContainer.findUnique({ where: { id: containerId } });
		if (!container) {
			return fail(404, { balanceError: 'Сметката не е намерена.' });
		}

		const openingBalanceCents = Math.round(balanceEur * 100);

		await db.moneyContainer.update({
			where: { id: containerId },
			data: { openingBalanceCents }
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'container_opening_balance_updated',
			entityType: 'money_container',
			entityId: containerId,
			oldValueJson: { openingBalanceCents: container.openingBalanceCents, name: container.name },
			newValueJson: { openingBalanceCents, name: container.name },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { balanceSuccess: containerId };
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
