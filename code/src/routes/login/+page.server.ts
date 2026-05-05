import { redirect, fail } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const company = await db.company.findFirst();
	if (!company) {
		redirect(302, '/bootstrap');
	}
	if (locals.user) {
		redirect(302, '/dashboard');
	}
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

		// Look up user first so we can log the event with their ID
		const dbUser = await db.user.findUnique({ where: { email } });

		const signInResponse = await auth.api
			.signInEmail({ body: { email, password }, headers: request.headers })
			.catch(() => null);

		if (!signInResponse?.user) {
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

		// Inactive users are blocked
		if (dbUser?.status === 'inactive') {
			await logAuditEvent({
				actorUserId: dbUser.id,
				eventType: 'login_blocked',
				entityType: 'user',
				entityId: dbUser.id,
				reason: 'Деактивиран акаунт',
				ipAddress: ip,
				userAgent: ua
			});
			// Sign them out immediately
			await auth.api.signOut({ headers: request.headers }).catch(() => null);
			return fail(403, { error: 'Акаунтът е деактивиран.', email });
		}

		await logAuditEvent({
			actorUserId: signInResponse.user.id,
			eventType: 'login_success',
			entityType: 'user',
			entityId: signInResponse.user.id,
			ipAddress: ip,
			userAgent: ua
		});

		// better-auth sets the session cookie in the response headers via the handler;
		// we redirect and the cookie is already sent.
		redirect(302, '/dashboard');
	}
};
