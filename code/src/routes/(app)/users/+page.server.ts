import { redirect, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auth } from '$lib/server/auth';
import { logAuditEvent } from '$lib/server/audit';
import { formatMoneyFromCents, parseOptionalMoneyToCents } from '$lib/server/project-policy';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

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
				deactivatedAt: true
			}
		})
	]);

	return { company, users };
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
		const hourlyRate = String(formData.get('hourlyRate') ?? '');
		const hourlyRateValidation = moneyField.safeParse(hourlyRate);
		if (!hourlyRateValidation.success) {
			return fail(422, {
				createErrors: { hourlyRate: [hourlyRateValidation.error.issues[0]?.message ?? 'Невалидна стойност.'] },
				createValues: raw
			});
		}

		const hourlyRateCents = parseOptionalMoneyToCents(hourlyRateValidation.data);
		if (Number.isNaN(hourlyRateCents)) {
			return fail(422, {
				createErrors: { hourlyRate: ['Използвайте валидна сума.'] },
				createValues: raw
			});
		}

		const existing = await db.user.findUnique({ where: { email: d.email } });
		if (existing) {
			return fail(409, {
				createErrors: { email: ['Имейл адресът вече е регистриран.'] },
				createValues: raw
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
			data: { role: d.role, firstName: d.firstName, lastName: d.lastName, hourlyRateCents }
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'user_created',
			entityType: 'user',
			entityId: result.user.id,
			newValueJson: { email: d.email, role: d.role, hourlyRateCents }
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
	}
};
