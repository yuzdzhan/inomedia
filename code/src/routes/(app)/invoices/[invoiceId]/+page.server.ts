import { error, redirect, isHttpError, isRedirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { InvoicePdfSnapshot } from '$lib/server/invoice-pdf';
import type { PageServerLoad } from './$types';

function canManageInvoices(role: string) {
	return role === 'admin' || role === 'accountant';
}

export const load: PageServerLoad = async ({ params, parent }) => {
	try {
		const { user } = await parent();
		if (!canManageInvoices(user.role)) {
			redirect(302, '/dashboard');
		}

		const [invoice, company] = await Promise.all([
			db.invoice.findFirst({
				where: { id: params.invoiceId },
				select: {
					id: true,
					status: true,
					invoiceNumber: true,
					issueDate: true,
					dueDate: true,
					servicePeriodFrom: true,
					servicePeriodTo: true,
					paymentMethod: true,
					vatRateBasisPoints: true,
					netTotalCents: true,
					vatTotalCents: true,
					grossTotalCents: true,
					paidTotalCents: true,
					issuedSnapshotJson: true,
					issuedPdfFilename: true,
					voidReason: true,
					client: {
						select: {
							legalName: true,
							registrationNumber: true,
							vatNumber: true,
							billingAddress: true,
							mol: true
						}
					},
					taskSelections: {
						orderBy: [{ createdAt: 'asc' }],
						select: {
							id: true,
							description: true,
							hourlyUninvoicedValueCents: true,
							flatFeeValueCents: true,
							task: {
								select: {
									title: true,
									taskList: {
										select: { project: { select: { name: true } } }
									}
								}
							}
						}
					},
					payments: {
						orderBy: [{ paymentDate: 'asc' }],
						select: {
							id: true,
							amountCents: true,
							paymentDate: true,
							paymentMethod: true,
							notes: true
						}
					},
					createdByUser: {
						select: { firstName: true, lastName: true }
					}
				}
			}),
			db.company.findFirst({
				select: {
					legalName: true,
					eikBulstat: true,
					vatNumber: true,
					registeredAddress: true,
					molName: true,
					currency: true,
					vatRateBasisPoints: true
				}
			})
		]);

		if (!invoice) throw error(404, 'Фактурата не е намерена.');
		if (!company) redirect(302, '/bootstrap');

		const snapshot = (invoice.issuedSnapshotJson ?? null) as InvoicePdfSnapshot | null;

		return { invoice, company, snapshot };
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане.');
	}
};
