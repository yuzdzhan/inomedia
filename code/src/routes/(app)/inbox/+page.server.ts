import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import { inboxConfigured, processPending, syncInbox } from '$lib/server/inbox/sync';
import type { Actions, PageServerLoad } from './$types';

function canManage(role: string) {
	return role === 'admin' || role === 'accountant';
}

async function getCompanyOrRedirect() {
	const company = await db.company.findFirst({ select: { id: true } });
	if (!company) redirect(302, '/bootstrap');
	return company;
}

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();
	if (!canManage(user.role)) redirect(302, '/dashboard');
	const company = await getCompanyOrRedirect();

	const filter = url.searchParams.get('status') ?? 'pending';
	const documents = await db.inboxDocument.findMany({
		where: { companyId: company.id, ...(filter === 'all' ? {} : { status: filter as 'pending' }) },
		orderBy: [{ createdAt: 'desc' }],
		take: 300,
		select: {
			id: true,
			filename: true,
			kind: true,
			supplier: true,
			documentNumber: true,
			documentDate: true,
			totalCents: true,
			currency: true,
			period: true,
			status: true,
			note: true,
			createdAt: true,
			message: { select: { subject: true, fromAddress: true, receivedAt: true } },
			expense: { select: { description: true, paidContainer: { select: { containerType: true } } } }
		}
	});
	const counts = await db.inboxDocument.groupBy({ by: ['status'], where: { companyId: company.id }, _count: true });
	const lastMessage = await db.inboxMessage.findFirst({ where: { companyId: company.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
	const categories = await db.expenseCategory.findMany({ where: { companyId: company.id, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } });

	return {
		filter,
		documents,
		counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
		configured: inboxConfigured(),
		lastSync: lastMessage?.createdAt ?? null,
		categories
	};
};

export const actions: Actions = {
	sync: async ({ locals }) => {
		if (!locals.user || !canManage(locals.user.role)) return fail(403, { error: 'Нямате права за тази операция.' });
		if (!inboxConfigured()) return fail(422, { error: 'Пощата не е настроена (IMAP_HOST/IMAP_USER/IMAP_PASSWORD).' });
		const company = await getCompanyOrRedirect();
		try {
			const r = await syncInbox(company.id);
			return {
				success: `Нови писма: ${r.messages}, документи: ${r.documents} (дубликати: ${r.duplicates}). Свързани: ${r.matched}, чакат: ${r.pending}.`,
				warnings: r.errors
			};
		} catch (e) {
			return fail(502, { error: `Пощата не отговаря: ${e instanceof Error ? e.message : e}` });
		}
	},

	retry: async ({ request, locals }) => {
		if (!locals.user || !canManage(locals.user.role)) return fail(403, { error: 'Нямате права за тази операция.' });
		const company = await getCompanyOrRedirect();
		const id = String((await request.formData()).get('documentId') ?? '');
		await processPending(company.id, undefined, id || undefined);
		return { success: 'Опитах отново.' };
	},

	setStatus: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManage(locals.user.role)) return fail(403, { error: 'Нямате права за тази операция.' });
		const company = await getCompanyOrRedirect();
		const form = await request.formData();
		const id = String(form.get('documentId') ?? '');
		const status = String(form.get('status') ?? '');
		if (!['ignored', 'pending'].includes(status)) return fail(422, { error: 'Невалиден статус.' });
		const doc = await db.inboxDocument.findFirst({ where: { id, companyId: company.id }, select: { id: true, status: true } });
		if (!doc) return fail(404, { error: 'Документът не е намерен.' });
		await db.inboxDocument.update({
			where: { id },
			data: { status: status as 'ignored' | 'pending', note: status === 'ignored' ? String(form.get('note') ?? '') || 'Пропуснат ръчно' : null }
		});
		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'inbox_document_status',
			entityType: 'inbox_document',
			entityId: id,
			oldValueJson: { status: doc.status },
			newValueJson: { status },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});
		return { success: status === 'ignored' ? 'Документът е пропуснат.' : 'Документът е върнат за обработка.' };
	},

	cashExpense: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManage(locals.user.role)) return fail(403, { error: 'Нямате права за тази операция.' });
		const company = await getCompanyOrRedirect();
		const form = await request.formData();
		const id = String(form.get('documentId') ?? '');
		const categoryId = String(form.get('categoryId') ?? '');
		const doc = await db.inboxDocument.findFirst({ where: { id, companyId: company.id, status: 'pending' } });
		if (!doc) return fail(404, { error: 'Документът не е намерен или вече е обработен.' });
		const amount = Math.round(parseFloat(String(form.get('amount') ?? '').replace(',', '.')) * 100);
		const dateText = String(form.get('date') ?? '');
		if (!amount || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return fail(422, { error: 'Попълнете сума и дата.' });
		const date = new Date(`${dateText}T00:00:00Z`);
		const cashbox = await db.moneyContainer.findUniqueOrThrow({ where: { companyId_containerType: { companyId: company.id, containerType: 'cashbox' } } });
		const description = [doc.supplier ?? 'Разход', doc.documentNumber ? `ф-ра ${doc.documentNumber}` : null].filter(Boolean).join(', ') + ' (платена в брой)';

		const expense = await db.$transaction(async (tx) => {
			const expense = await tx.expense.create({
				data: {
					companyId: company.id, categoryId, description, amountCents: amount, incurredDate: date, status: 'paid', paidDate: date,
					paidByUserId: locals.user!.id, paidContainerId: cashbox.id, createdByUserId: locals.user!.id,
					attachments: { create: { originalFilename: doc.filename, contentType: doc.contentType, sizeBytes: doc.sizeBytes, blob: doc.blob } }
				}
			});
			await tx.ledgerEntry.create({
				data: { containerId: cashbox.id, entryType: 'expense_payment', amountCents: -amount, entryDate: date, description: `Разход: ${description}`, expenseId: expense.id, createdByUserId: locals.user!.id }
			});
			await tx.inboxDocument.update({ where: { id }, data: { status: 'cash_expense', expenseId: expense.id, note: 'Записана ръчно като разход от касата.' } });
			return expense;
		});
		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'inbox_document_cash_expense',
			entityType: 'expense',
			entityId: expense.id,
			newValueJson: { inboxDocumentId: id, amountCents: amount, date: dateText },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});
		return { success: 'Записан разход от касата.' };
	}
};
