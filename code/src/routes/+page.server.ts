import { redirect, error, isHttpError, isRedirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const company = await db.company.findFirst();

		if (!company) {
			redirect(302, '/bootstrap');
		}

		if (!locals.user) {
			redirect(302, '/login');
		}

		redirect(302, '/dashboard');
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане на данните.');
	}
};
