import { redirect, fail, error, isHttpError, isRedirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auth } from '$lib/server/auth';
import { logAuditEvent } from '$lib/server/audit';
import { ensureCompanyDefaults } from '$lib/server/company-defaults';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const company = await db.company.findFirst();
		if (company) {
			redirect(302, '/login');
		}
		return {};
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане на данните.');
	}
};

const bootstrapSchema = z.object({
	// Company fields
	legalName: z.string().min(2, 'Въведете правното наименование'),
	eikBulstat: z.string().min(9, 'Въведете валиден ЕИК/БУЛСТАТ').max(13),
	vatNumber: z.string().optional(),
	registeredAddress: z.string().min(5, 'Въведете регистрирания адрес'),
	molName: z.string().min(2, 'Въведете МОЛ'),
	// Admin user
	firstName: z.string().min(1, 'Въведете собствено име'),
	lastName: z.string().min(1, 'Въведете фамилно ime'),
	email: z.string().email('Невалиден имейл адрес'),
	password: z.string().min(8, 'Паролата трябва да е поне 8 символа')
});

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const existing = await db.company.findFirst();
		if (existing) {
			return fail(400, { error: 'Системата вече е инициализирана.' });
		}

		const formData = await request.formData();
		const raw = Object.fromEntries(formData);

		const parsed = bootstrapSchema.safeParse(raw);
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(422, { errors, values: raw });
		}

		const d = parsed.data;

		// Create company
		const company = await db.company.create({
			data: {
				legalName: d.legalName,
				eikBulstat: d.eikBulstat,
				vatNumber: d.vatNumber || null,
				registeredAddress: d.registeredAddress,
				molName: d.molName
			}
		});

		await ensureCompanyDefaults(db, company.id);

		// Create initial admin via better-auth
		const signUpResponse = await auth.api.signUpEmail({
			body: {
				name: `${d.firstName} ${d.lastName}`,
				email: d.email,
				password: d.password
			}
		});

		if (!signUpResponse.user) {
			await db.company.delete({ where: { id: company.id } });
			return fail(500, { error: 'Грешка при създаване на администраторски акаунт.' });
		}

		// Promote to admin and set domain fields
		await db.user.update({
			where: { id: signUpResponse.user.id },
			data: { role: 'admin', firstName: d.firstName, lastName: d.lastName }
		});

		await logAuditEvent({
			actorUserId: signUpResponse.user.id,
			eventType: 'company_bootstrapped',
			entityType: 'company',
			entityId: company.id,
			newValueJson: { legalName: company.legalName, eikBulstat: company.eikBulstat },
			ipAddress: getClientAddress()
		});

		redirect(302, '/login?bootstrapped=1');
	}
};
