import { redirect, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { auth } from '$lib/server/auth';
import { logAuditEvent } from '$lib/server/audit';
import { formatMoneyFromCents, parseOptionalMoneyToCents } from '$lib/server/project-policy';
import type { Actions, PageServerLoad } from './$types';

function formatDateInput(date: Date) {
	return date.toISOString().slice(0, 10);
}

function normalizeRateEntry(input: {
	effectiveFrom: string;
	costRate: string;
	defaultBillableRate: string;
}) {
	return {
		effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00.000Z`),
		costRateCents: parseOptionalMoneyToCents(input.costRate),
		defaultBillableRateCents: parseOptionalMoneyToCents(input.defaultBillableRate)
	};
}

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (user.role !== 'admin') {
		redirect(302, '/dashboard');
	}

	const [company, users] = await db.$transaction([
		db.company.findFirst({
			select: {
				currency: true
			}
		}),
		db.user.findMany({
			orderBy: [{ status: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				role: true,
				status: true,
				hourlyRateCents: true,
				createdAt: true,
				deactivatedAt: true,
				rateHistoryEntries: {
					orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
					select: {
						id: true,
						effectiveFrom: true,
						costRateCents: true,
						billableRateCents: true,
						createdAt: true
					}
				}
			}
		})
	]);

	return { company, users, today: formatDateInput(new Date()) };
};

const createUserSchema = z.object({
	firstName: z.string().min(1, 'Въведете собствено име'),
	lastName: z.string().min(1, 'Въведете фамилно име'),
	email: z.string().email('Невалиден имейл адрес'),
	password: z.string().min(8, 'Паролата трябва да е поне 8 символа'),
	role: z.enum(['admin', 'manager', 'employee', 'accountant'], { message: 'Изберете роля' })
});

const moneyField = z
	.string()
	.trim()
	.refine((value) => value.length === 0 || /^\d+([.,]\d{1,2})?$/.test(value), 'Използвайте число с до 2 знака след десетичната запетая.');

const setHourlyRateSchema = z.object({
	userId: z.string().trim().min(1),
	hourlyRate: moneyField
});

const rateHistoryEntrySchema = z.object({
	userId: z.string().trim().min(1),
	effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Използвайте валидна дата.'),
	costRate: moneyField,
	defaultBillableRate: moneyField
});

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') {
			return fail(403, { createError: 'Нямате права.' });
		}

		const formData = await request.formData();
		const raw = Object.fromEntries(formData);
		const parsed = createUserSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, { createErrors: parsed.error.flatten().fieldErrors, createValues: raw });
		}

		const d = parsed.data;
		const rateEntryRaw = {
			effectiveFrom: String(formData.get('effectiveFrom') ?? formatDateInput(new Date())),
			costRate: String(formData.get('costRate') ?? ''),
			defaultBillableRate: String(formData.get('defaultBillableRate') ?? '')
		};
		const rateEntryValidation = rateHistoryEntrySchema.omit({ userId: true }).safeParse(rateEntryRaw);
		if (!rateEntryValidation.success) {
			return fail(422, {
				createErrors: rateEntryValidation.error.flatten().fieldErrors,
				createValues: { ...raw, ...rateEntryRaw }
			});
		}

		const rateEntry = normalizeRateEntry(rateEntryValidation.data);
		if (
			Number.isNaN(rateEntry.effectiveFrom.getTime()) ||
			Number.isNaN(rateEntry.costRateCents) ||
			Number.isNaN(rateEntry.defaultBillableRateCents)
		) {
			return fail(422, {
				createErrors: {
					costRate: ['Използвайте валидна сума.'],
					defaultBillableRate: ['Използвайте валидна сума.']
				},
				createValues: { ...raw, ...rateEntryRaw }
			});
		}

		const existing = await db.user.findUnique({ where: { email: d.email } });
		if (existing) {
			return fail(409, {
				createErrors: { email: ['Имейл адресът вече е регистриран.'] },
				createValues: { ...raw, ...rateEntryRaw }
			});
		}

		const result = await auth.api
			.signUpEmail({ body: { name: `${d.firstName} ${d.lastName}`, email: d.email, password: d.password } })
			.catch(() => null);

		if (!result?.user) {
			return fail(500, { createError: 'Грешка при създаване на акаунт.' });
		}

		await db.user.update({
			where: { id: result.user.id },
			data: {
				role: d.role,
				firstName: d.firstName,
				lastName: d.lastName,
				hourlyRateCents: rateEntry.costRateCents,
				rateHistoryEntries:
					rateEntry.costRateCents != null || rateEntry.defaultBillableRateCents != null
						? {
								create: {
									effectiveFrom: rateEntry.effectiveFrom,
									costRateCents: rateEntry.costRateCents,
									billableRateCents: rateEntry.defaultBillableRateCents
								}
							}
						: undefined
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'user_created',
			entityType: 'user',
			entityId: result.user.id,
			newValueJson: {
				email: d.email,
				role: d.role,
				costRateCents: rateEntry.costRateCents,
				defaultBillableRateCents: rateEntry.defaultBillableRateCents,
				effectiveFrom: formatDateInput(rateEntry.effectiveFrom)
			}
		});

		return { createSuccess: true };
	},

	setRole: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') {
			return fail(403, { roleError: 'Невалидна роля.', roleUserId: '', roleValue: '' });
		}

		const formData = await request.formData();
		const targetId = String(formData.get('userId') ?? '');
		const newRole = String(formData.get('role') ?? '');

		if (!['admin', 'manager', 'employee', 'accountant'].includes(newRole)) {
			return fail(422, { roleError: 'Невалидна роля.', roleUserId: targetId, roleValue: newRole });
		}
		if (targetId === locals.user.id && newRole !== 'admin') {
			return fail(400, {
				roleError: 'Не можете да промените собствената си роля.',
				roleUserId: targetId,
				roleValue: newRole
			});
		}

		const target = await db.user.findUnique({ where: { id: targetId } });
		if (!target) {
			return fail(404, {
				roleError: 'Невалидна роля.',
				roleUserId: targetId,
				roleValue: newRole
			});
		}

		await db.user.update({
			where: { id: targetId },
			data: { role: newRole as 'admin' | 'manager' | 'employee' | 'accountant' }
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'role_changed',
			entityType: 'user',
			entityId: targetId,
			oldValueJson: { role: target.role },
			newValueJson: { role: newRole }
		});

		return { roleSuccess: true, roleUserId: targetId, roleValue: newRole };
	},

	setStatus: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') return fail(403, {});

		const formData = await request.formData();
		const targetId = String(formData.get('userId') ?? '');
		const newStatus = String(formData.get('status') ?? '');

		if (!['active', 'inactive'].includes(newStatus)) {
			return fail(422, { statusError: 'Невалиден статус.' });
		}
		if (targetId === locals.user.id) {
			return fail(400, { statusError: 'Не можете да деактивирате собствения си акаунт.' });
		}

		const target = await db.user.findUnique({ where: { id: targetId } });
		if (!target) return fail(404, {});

		await db.user.update({
			where: { id: targetId },
			data: {
				status: newStatus as 'active' | 'inactive',
				deactivatedAt: newStatus === 'inactive' ? new Date() : null
			}
		});

		if (newStatus === 'inactive') {
			await db.session.deleteMany({ where: { userId: targetId } });
		}

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: newStatus === 'inactive' ? 'user_deactivated' : 'user_activated',
			entityType: 'user',
			entityId: targetId,
			oldValueJson: { status: target.status },
			newValueJson: { status: newStatus }
		});

		return { statusSuccess: true };
	},

	setHourlyRate: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') {
			return fail(403, { hourlyRateError: 'Нямате права.', hourlyRateUserId: '', hourlyRateValue: '' });
		}

		const formData = await request.formData();
		const raw = {
			userId: String(formData.get('userId') ?? ''),
			hourlyRate: String(formData.get('hourlyRate') ?? '')
		};
		const parsed = setHourlyRateSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				hourlyRateError: parsed.error.flatten().fieldErrors.hourlyRate?.[0] ?? 'Невалидна стойност.',
				hourlyRateUserId: raw.userId,
				hourlyRateValue: raw.hourlyRate
			});
		}

		const hourlyRateCents = parseOptionalMoneyToCents(parsed.data.hourlyRate);
		if (Number.isNaN(hourlyRateCents)) {
			return fail(422, {
				hourlyRateError: 'Използвайте валидна сума.',
				hourlyRateUserId: raw.userId,
				hourlyRateValue: raw.hourlyRate
			});
		}

		const target = await db.user.findUnique({
			where: { id: parsed.data.userId },
			select: { id: true, hourlyRateCents: true }
		});
		if (!target) {
			return fail(404, {
				hourlyRateError: 'Потребителят не е намерен.',
				hourlyRateUserId: raw.userId,
				hourlyRateValue: raw.hourlyRate
			});
		}

		await db.user.update({
			where: { id: parsed.data.userId },
			data: { hourlyRateCents }
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'user_hourly_rate_changed',
			entityType: 'user',
			entityId: parsed.data.userId,
			oldValueJson: { hourlyRateCents: target.hourlyRateCents },
			newValueJson: { hourlyRateCents }
		});

		return {
			hourlyRateSuccess: true,
			hourlyRateUserId: parsed.data.userId,
			hourlyRateValue: formatMoneyFromCents(hourlyRateCents)
		};
	},

	addRateHistoryEntry: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') {
			return fail(403, {
				rateHistoryError: 'Нямате права.',
				rateHistoryUserId: '',
				rateHistoryValues: {}
			});
		}

		const formData = await request.formData();
		const raw = {
			userId: String(formData.get('userId') ?? ''),
			effectiveFrom: String(formData.get('effectiveFrom') ?? ''),
			costRate: String(formData.get('costRate') ?? ''),
			defaultBillableRate: String(formData.get('defaultBillableRate') ?? '')
		};
		const parsed = rateHistoryEntrySchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				rateHistoryErrors: parsed.error.flatten().fieldErrors,
				rateHistoryUserId: raw.userId,
				rateHistoryValues: raw
			});
		}

		const target = await db.user.findUnique({
			where: { id: parsed.data.userId },
			select: { id: true, hourlyRateCents: true }
		});
		if (!target) {
			return fail(404, {
				rateHistoryError: 'Потребителят не е намерен.',
				rateHistoryUserId: raw.userId,
				rateHistoryValues: raw
			});
		}

		const normalized = normalizeRateEntry(parsed.data);
		if (
			Number.isNaN(normalized.effectiveFrom.getTime()) ||
			Number.isNaN(normalized.costRateCents) ||
			Number.isNaN(normalized.defaultBillableRateCents)
		) {
			return fail(422, {
				rateHistoryErrors: {
					costRate: ['Използвайте валидна сума.'],
					defaultBillableRate: ['Използвайте валидна сума.']
				},
				rateHistoryUserId: raw.userId,
				rateHistoryValues: raw
			});
		}

		const entry = await db.userRateHistory.create({
			data: {
				userId: parsed.data.userId,
				effectiveFrom: normalized.effectiveFrom,
				costRateCents: normalized.costRateCents,
				billableRateCents: normalized.defaultBillableRateCents
			}
		});

		await db.user.update({
			where: { id: parsed.data.userId },
			data: {
				hourlyRateCents: normalized.costRateCents
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'user_rate_history_entry_created',
			entityType: 'user',
			entityId: parsed.data.userId,
			oldValueJson: { hourlyRateCents: target.hourlyRateCents },
			newValueJson: {
				rateHistoryEntryId: entry.id,
				effectiveFrom: formatDateInput(entry.effectiveFrom),
				costRateCents: entry.costRateCents,
				defaultBillableRateCents: entry.billableRateCents
			}
		});

		return {
			rateHistorySuccess: true,
			rateHistoryUserId: parsed.data.userId
		};
	}
};
