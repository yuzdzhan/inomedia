import { building, dev } from '$app/environment';
import { auth } from '$lib/server/auth';
import { scheduleInboxSync } from '$lib/server/inbox/sync';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';

// Read invoices@ every 30 minutes in production.
if (!building && !dev) {
	scheduleInboxSync();
}

export const handle: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = (session?.user ?? null) as App.Locals['user'];
	event.locals.session = session?.session ?? null;

	return svelteKitHandler({ event, resolve, auth, building });
};
