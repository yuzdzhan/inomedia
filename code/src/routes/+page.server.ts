import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const company = await db.company.findFirst();

	if (!company) {
		redirect(302, '/bootstrap');
	}

	if (!locals.user) {
		redirect(302, '/login');
	}

	redirect(302, '/dashboard');
};
