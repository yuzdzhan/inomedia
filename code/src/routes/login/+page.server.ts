import { redirect, fail } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const company = await db.company.findFirst();
	if (!company) redirect(302, '/bootstrap');
	if (locals.user) redirect(302, '/dashboard');
	return { bootstrapped: url.searchParams.get('bootstrapped') === '1' };
};

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const formData = await request.formData();
		const email = String(formData.get('email') ?? '').trim().toLowerCase();
		const password = String(formData.get('password') ?? '');
		const ip = getClientAddress();
		const ua = request.headers.get('user-agent') ?? undefined;

		if (!email || !password) {
			return fail(422, { error: 'Въведете имейл и парола.', email });
		}

		const dbUser = await db.user.findUnique({ where: { email } });

		const authResult = await auth.api
			.signInEmail({ body: { email, password }, headers: request.headers })
			.catch((e: unknown) => {
				console.error('[login] signInEmail threw:', e);
				return null;
			});

		if (!authResult?.user) {
			await logAuditEvent({
				actorUserId: dbUser?.id,
				eventType: 'login_failed',
				entityType: 'user',
				entityId: dbUser?.id,
				reason: 'Невалидни идентификационни данни',
				ipAddress: ip,
				userAgent: ua
			});
			return fail(401, { error: 'Невалиден имейл или парола.', email });
		}

		if (dbUser?.status === 'inactive') {
			await db.session.deleteMany({ where: { userId: dbUser.id } });
			await logAuditEvent({
				actorUserId: dbUser.id,
				eventType: 'login_blocked',
				entityType: 'user',
				entityId: dbUser.id,
				reason: 'Деактивиран акаунт',
				ipAddress: ip,
				userAgent: ua
			});
			return fail(403, { error: 'Акаунтът е деактивиран', email });
		}

		await logAuditEvent({
			actorUserId: authResult.user.id,
			eventType: 'login_success',
			entityType: 'user',
			entityId: authResult.user.id,
			ipAddress: ip,
			userAgent: ua
		});

		redirect(302, '/dashboard');
	}
};
