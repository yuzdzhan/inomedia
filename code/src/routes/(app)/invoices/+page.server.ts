import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();
	if (!['admin', 'accountant'].includes(user.role)) {
		redirect(302, '/dashboard');
	}

	const company = await db.company.findFirst({
		select: {
			currency: true
		}
	});

	if (!company) {
		redirect(302, '/bootstrap');
	}

	const drafts = await db.invoice.findMany({
		where: {
			status: 'draft'
		},
		orderBy: [{ createdAt: 'desc' }],
		include: {
			client: {
				select: {
					id: true,
					legalName: true
				}
			},
			taskSelections: {
				orderBy: [{ createdAt: 'asc' }],
				include: {
					task: {
						select: {
							id: true,
							title: true,
							billingType: true,
							taskList: {
								include: {
									project: {
										select: {
											id: true,
											name: true
										}
									}
								}
							}
						}
					}
				}
			},
			createdByUser: {
				select: {
					id: true,
					firstName: true,
					lastName: true
				}
			}
		}
	});

	return {
		company,
		drafts,
		draftCreated: url.searchParams.get('draftCreated')
	};
};
