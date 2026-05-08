import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { generateInvoicePdf, type InvoicePdfSnapshot } from '$lib/server/invoice-pdf';
import { formatDateForInput } from '$lib/server/task-policy';
import type { RequestHandler } from './$types';

function canManageInvoices(role: string) {
	return role === 'admin' || role === 'accountant';
}

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user || !canManageInvoices(locals.user.role)) {
		throw error(403, 'Нямате права за тази операция.');
	}

	const [invoice, company] = await Promise.all([
		db.invoice.findFirst({
			where: { id: params.invoiceId, status: 'draft' },
			select: {
				invoiceNumber: true,
				dueDate: true,
				servicePeriodFrom: true,
				servicePeriodTo: true,
				paymentMethod: true,
				vatRateBasisPoints: true,
				netTotalCents: true,
				vatTotalCents: true,
				grossTotalCents: true,
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
						description: true,
						hourlyUninvoicedValueCents: true,
						flatFeeValueCents: true,
						snapshotJson: true,
						task: {
							select: {
								taskList: {
									select: { project: { select: { name: true } } }
								}
							}
						}
					}
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
				email: true,
				phone: true,
				website: true,
				bankName: true,
				bankIban: true,
				bankBic: true,
				currency: true
			}
		})
	]);

	if (!invoice) throw error(404, 'Черновата не е намерена.');
	if (!company) throw error(404, 'Фирмата не е намерена.');

	const projectMap = new Map<string, { tasks: { description: string; hours: number | null; amountCents: number }[]; netAmountCents: number }>();
	for (const sel of invoice.taskSelections) {
		const projectName = sel.task.taskList.project.name;
		let hours: number | null = null;
		if (sel.hourlyUninvoicedValueCents != null && sel.snapshotJson && typeof sel.snapshotJson === 'object' && !Array.isArray(sel.snapshotJson)) {
			const snap = sel.snapshotJson as { timeLogs?: Array<{ durationMinutes?: number }> };
			const totalMinutes = (snap.timeLogs ?? []).reduce((s, t) => s + (t.durationMinutes ?? 0), 0);
			if (totalMinutes > 0) hours = totalMinutes / 60;
		}
		const amountCents = sel.hourlyUninvoicedValueCents ?? sel.flatFeeValueCents ?? 0;
		if (!projectMap.has(projectName)) projectMap.set(projectName, { tasks: [], netAmountCents: 0 });
		const grp = projectMap.get(projectName)!;
		grp.tasks.push({ description: sel.description, hours, amountCents });
		grp.netAmountCents += amountCents;
	}
	const projectGroups = Array.from(projectMap.entries()).map(([projectName, data]) => ({ projectName, tasks: data.tasks, netAmountCents: data.netAmountCents }));

	const snapshot: InvoicePdfSnapshot = {
		invoiceNumber: invoice.invoiceNumber ?? 'ЧЕРНОВА',
		issueDate: formatDateForInput(new Date()) || new Date().toISOString().slice(0, 10),
		dueDate: invoice.dueDate ? formatDateForInput(invoice.dueDate) : null,
		servicePeriodFrom: invoice.servicePeriodFrom ? formatDateForInput(invoice.servicePeriodFrom) : null,
		servicePeriodTo: invoice.servicePeriodTo ? formatDateForInput(invoice.servicePeriodTo) : null,
		currency: company.currency,
		paymentMethod: invoice.paymentMethod,
		company: {
			legalName: company.legalName,
			registrationNumber: company.eikBulstat,
			vatNumber: company.vatNumber,
			address: company.registeredAddress,
			molName: company.molName,
			email: company.email,
			phone: company.phone,
			website: company.website
		},
		bankName: company.bankName,
		bankIban: company.bankIban,
		bankBic: company.bankBic,
		paidTotalCents: 0,
		client: {
			legalName: invoice.client.legalName,
			registrationNumber: invoice.client.registrationNumber,
			vatNumber: invoice.client.vatNumber,
			address: invoice.client.billingAddress,
			molName: invoice.client.mol
		},
		projectGroups,
		netTotalCents: invoice.netTotalCents,
		vatTotalCents: invoice.vatTotalCents,
		grossTotalCents: invoice.grossTotalCents,
		vatRateBasisPoints: invoice.vatRateBasisPoints
	};

	const pdf = await generateInvoicePdf(snapshot);

	return new Response(pdf, {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `inline; filename="preview-${invoice.invoiceNumber ?? params.invoiceId}.pdf"`
		}
	});
};
