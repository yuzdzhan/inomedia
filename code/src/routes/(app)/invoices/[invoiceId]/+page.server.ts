import { error, redirect, fail, isHttpError, isRedirect } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import { generateInvoicePdf, type InvoicePdfSnapshot } from '$lib/server/invoice-pdf';
import {
	buildDefaultInvoiceLineDescription,
	buildDraftSelectionSnapshot,
	centsFromMinutes,
	parseOptionalDateInput,
	resolveDraftDueDate,
	summarizeDraftSelections
} from '$lib/server/invoice-drafts';
import { formatDateForInput } from '$lib/server/task-policy';
import type { Actions, PageServerLoad } from './$types';

function canManageInvoices(role: string) {
	return role === 'admin' || role === 'accountant';
}

function normalizeDescription(value: string, fallback: string) {
	const normalized = value.replace(/\s+/g, ' ').trim();
	return normalized || fallback;
}

function selectionAmount(sel: { hourlyUninvoicedValueCents: number | null; flatFeeValueCents: number | null }) {
	return sel.hourlyUninvoicedValueCents ?? sel.flatFeeValueCents ?? 0;
}

function getTimeLogIdsFromSelection(selection: { snapshotJson: Prisma.JsonValue | null }) {
	if (!selection.snapshotJson || typeof selection.snapshotJson !== 'object' || Array.isArray(selection.snapshotJson)) {
		return [];
	}
	const snapshot = selection.snapshotJson as { timeLogs?: Array<{ id?: string }> };
	return (snapshot.timeLogs ?? []).map((e) => e.id).filter((v): v is string => Boolean(v));
}

function getHoursFromSelection(selection: { snapshotJson: Prisma.JsonValue | null; hourlyUninvoicedValueCents: number | null }): number | null {
	if (selection.hourlyUninvoicedValueCents === null) return null;
	if (!selection.snapshotJson || typeof selection.snapshotJson !== 'object' || Array.isArray(selection.snapshotJson)) return null;
	const snap = selection.snapshotJson as { timeLogs?: Array<{ durationMinutes?: number }> };
	const totalMinutes = (snap.timeLogs ?? []).reduce((s, t) => s + (t.durationMinutes ?? 0), 0);
	return totalMinutes > 0 ? totalMinutes / 60 : null;
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
					clientId: true,
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
							mol: true,
							defaultPaymentTermDays: true
						}
					},
					taskSelections: {
						orderBy: [{ createdAt: 'asc' }],
						select: {
							id: true,
							description: true,
							hourlyUninvoicedValueCents: true,
							flatFeeValueCents: true,
							snapshotJson: true,
							task: {
								select: {
									id: true,
									title: true,
									billingType: true,
									flatFeeAmountCents: true,
									taskList: {
										select: { project: { select: { name: true } } }
									}
								}
							}
						}
					},
					customRows: {
						orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
						select: { id: true, description: true, amountCents: true, sortOrder: true, sourceExpenseId: true }
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
					id: true,
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
					currency: true,
					vatRateBasisPoints: true,
					defaultPaymentTermDays: true
				}
			})
		]);

		if (!invoice) throw error(404, 'Фактурата не е намерена.');
		if (!company) redirect(302, '/bootstrap');

		const snapshot = (invoice.issuedSnapshotJson ?? null) as InvoicePdfSnapshot | null;

		// Load unbilled billable expenses for this client (only useful for drafts)
		const billableExpenses = invoice.status === 'draft'
			? await db.expense.findMany({
					where: {
						clientId: invoice.clientId,
						billableToInvoice: true,
						invoicedAt: null
					},
					orderBy: [{ incurredDate: 'asc' }],
					select: { id: true, description: true, amountCents: true, incurredDate: true }
				})
			: [];

		return { invoice, company, snapshot, billableExpenses };
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане.');
	}
};

export const actions: Actions = {
	saveDraft: async ({ params, request, locals, getClientAddress }) => {
		if (!locals.user || !canManageInvoices(locals.user.role)) {
			return fail(403, { draftError: 'Нямате права за тази операция.' });
		}

		const company = await db.company.findFirst({
			select: { id: true, defaultPaymentTermDays: true }
		});
		if (!company) return fail(500, { draftError: 'Компанията не е намерена.' });

		const draft = await db.invoice.findFirst({
			where: { id: params.invoiceId, status: 'draft' },
			include: {
				client: { select: { defaultPaymentTermDays: true } },
				taskSelections: {
					select: { id: true, description: true, task: { select: { title: true, billingType: true } }, hourlyUninvoicedValueCents: true, flatFeeValueCents: true }
				},
				customRows: {
					orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
					select: { id: true, description: true, amountCents: true }
				}
			}
		});

		if (!draft) return fail(404, { draftError: 'Черновата не е намерена.' });

		const formData = await request.formData();
		const dueDate = parseOptionalDateInput(String(formData.get('dueDate') ?? '')) ??
			resolveDraftDueDate(draft.dueDate, draft.client.defaultPaymentTermDays, company.defaultPaymentTermDays);
		const servicePeriodFrom = parseOptionalDateInput(String(formData.get('servicePeriodFrom') ?? ''));
		const servicePeriodTo = parseOptionalDateInput(String(formData.get('servicePeriodTo') ?? ''));

		if (servicePeriodFrom && servicePeriodTo && servicePeriodFrom > servicePeriodTo) {
			return fail(422, { draftError: 'Началната дата на периода трябва да е преди крайната.' });
		}

		const selectionUpdates = draft.taskSelections.map((sel) => ({
			id: sel.id,
			description: normalizeDescription(
				String(formData.get(`description:${sel.id}`) ?? ''),
				sel.description || buildDefaultInvoiceLineDescription(sel.task)
			)
		}));

		const customRowUpdates = draft.customRows.map((row) => {
			const rawDesc = String(formData.get(`customRowDesc:${row.id}`) ?? '');
			const rawAmount = String(formData.get(`customRowAmount:${row.id}`) ?? '');
			const description = normalizeDescription(rawDesc, row.description);
			const amountCents = rawAmount ? Math.round(parseFloat(rawAmount) * 100) : row.amountCents;
			return { id: row.id, description, amountCents: isNaN(amountCents) ? row.amountCents : Math.max(0, amountCents) };
		});

		const taskTotal = draft.taskSelections.reduce((s, sel) => s + selectionAmount(sel), 0);
		const customTotal = customRowUpdates.reduce((s, r) => s + r.amountCents, 0);
		const netTotalCents = taskTotal + customTotal;
		const vatTotalCents = Math.round((netTotalCents * draft.vatRateBasisPoints) / 10000);

		await db.$transaction(async (tx) => {
			for (const sel of selectionUpdates) {
				await tx.invoiceTaskSelection.update({ where: { id: sel.id }, data: { description: sel.description } });
			}
			for (const row of customRowUpdates) {
				await tx.invoiceCustomRow.update({ where: { id: row.id }, data: { description: row.description, amountCents: row.amountCents } });
			}
			await tx.invoice.update({
				where: { id: draft.id },
				data: { dueDate, servicePeriodFrom, servicePeriodTo, netTotalCents, vatTotalCents, grossTotalCents: netTotalCents + vatTotalCents, lastUpdatedAt: new Date() }
			});
		});

		await logAuditEvent({
			actorUserId: locals.user.id, eventType: 'invoice_draft_updated', entityType: 'invoice', entityId: draft.id,
			newValueJson: { dueDate: dueDate?.toISOString() ?? null },
			ipAddress: getClientAddress(), userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { draftSuccess: 'Черновата е запазена.' };
	},

	recalculateDraft: async ({ params, request, locals, getClientAddress }) => {
		if (!locals.user || !canManageInvoices(locals.user.role)) {
			return fail(403, { draftError: 'Нямате права за тази операция.' });
		}

		const company = await db.company.findFirst({
			select: { id: true, defaultPaymentTermDays: true, vatRateBasisPoints: true }
		});
		if (!company) return fail(500, { draftError: 'Компанията не е намерена.' });

		const draft = await db.invoice.findFirst({
			where: { id: params.invoiceId, status: 'draft' },
			include: {
				client: { select: { id: true, defaultPaymentTermDays: true } },
				taskSelections: {
					include: {
						task: {
							include: {
								taskList: { include: { project: { include: { client: { select: { id: true } } } } } },
								timeLogs: { where: { invoicedAt: null }, orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }], select: { id: true, workDate: true, description: true, durationMinutes: true, startMinuteOfDay: true, endMinuteOfDay: true, snapshotCostRateCents: true, snapshotBillableRateCents: true, userId: true } }
							}
						}
					}
				},
				customRows: {
					select: { id: true, amountCents: true }
				}
			}
		});

		if (!draft) return fail(404, { draftError: 'Черновата не е намерена.' });

		const descriptionByTaskId = new Map(draft.taskSelections.map((s) => [s.taskId, s.description]));
		const snapshots = draft.taskSelections.map((s) =>
			buildDraftSelectionSnapshot(s.task, draft.clientId, descriptionByTaskId.get(s.taskId) ?? buildDefaultInvoiceLineDescription(s.task))
		);
		const snapshotByTaskId = new Map(snapshots.map((s) => [s.taskId, s]));
		const totals = summarizeDraftSelections(snapshots, draft.vatRateBasisPoints);

		// Add fixed custom row amounts to totals
		const customTotal = draft.customRows.reduce((s, r) => s + r.amountCents, 0);
		const netTotalCents = totals.netTotalCents + customTotal;
		const vatTotalCents = Math.round((netTotalCents * draft.vatRateBasisPoints) / 10000);

		await db.$transaction(async (tx) => {
			for (const sel of draft.taskSelections) {
				const snap = snapshotByTaskId.get(sel.taskId);
				if (!snap) continue;
				await tx.invoiceTaskSelection.update({
					where: { id: sel.id },
					data: { description: snap.description, hourlyUninvoicedValueCents: snap.hourlyUninvoicedValueCents, flatFeeValueCents: snap.flatFeeValueCents, snapshotJson: snap.snapshotJson, snapshotTakenAt: new Date() }
				});
			}
			await tx.invoice.update({
				where: { id: draft.id },
				data: { dueDate: resolveDraftDueDate(draft.dueDate, draft.client.defaultPaymentTermDays, company.defaultPaymentTermDays), servicePeriodFrom: draft.servicePeriodFrom ?? totals.servicePeriodFrom, servicePeriodTo: draft.servicePeriodTo ?? totals.servicePeriodTo, netTotalCents, vatTotalCents, grossTotalCents: netTotalCents + vatTotalCents, isStaleDraft: false, lastUpdatedAt: new Date() }
			});
		});

		await logAuditEvent({
			actorUserId: locals.user.id, eventType: 'invoice_draft_recalculated', entityType: 'invoice', entityId: draft.id,
			newValueJson: { netTotalCents, grossTotalCents: netTotalCents + vatTotalCents },
			ipAddress: getClientAddress(), userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { draftSuccess: 'Черновата е преизчислена.' };
	},

	issueDraft: async ({ params, request, locals, getClientAddress }) => {
		if (!locals.user || !canManageInvoices(locals.user.role)) {
			return fail(403, { draftError: 'Нямате права за тази операция.' });
		}

		const company = await db.company.findFirst({
			select: { id: true, legalName: true, eikBulstat: true, vatNumber: true, registeredAddress: true, molName: true, email: true, phone: true, website: true, bankName: true, bankIban: true, bankBic: true, currency: true, defaultPaymentTermDays: true, vatRateBasisPoints: true }
		});
		if (!company) return fail(500, { draftError: 'Компанията не е намерена.' });

		const draft = await db.invoice.findFirst({
			where: { id: params.invoiceId, status: 'draft' },
			include: {
				client: { select: { legalName: true, registrationNumber: true, vatNumber: true, mol: true, billingAddress: true, defaultPaymentTermDays: true } },
				taskSelections: {
					orderBy: [{ createdAt: 'asc' }],
					include: {
						task: {
							select: { id: true, title: true, billingType: true, taskList: { include: { project: { select: { name: true } } } } }
						}
					}
				},
				customRows: {
					orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
					select: { id: true, description: true, amountCents: true, sourceExpenseId: true }
				}
			}
		});

		if (!draft) return fail(404, { draftError: 'Черновата не е намерена.' });

		const formData = await request.formData();
		const dueDate = parseOptionalDateInput(String(formData.get('dueDate') ?? '')) ??
			resolveDraftDueDate(draft.dueDate, draft.client.defaultPaymentTermDays, company.defaultPaymentTermDays);
		const servicePeriodFrom = parseOptionalDateInput(String(formData.get('servicePeriodFrom') ?? '')) ?? draft.servicePeriodFrom;
		const servicePeriodTo = parseOptionalDateInput(String(formData.get('servicePeriodTo') ?? '')) ?? draft.servicePeriodTo;

		if (servicePeriodFrom && servicePeriodTo && servicePeriodFrom > servicePeriodTo) {
			return fail(422, { draftError: 'Началната дата на периода трябва да е преди крайната.' });
		}

		const updatedSelections = draft.taskSelections.map((sel) => ({
			id: sel.id,
			taskId: sel.taskId,
			description: normalizeDescription(
				String(formData.get(`description:${sel.id}`) ?? ''),
				sel.description || buildDefaultInvoiceLineDescription(sel.task)
			),
			hourlyUninvoicedValueCents: sel.hourlyUninvoicedValueCents,
			flatFeeValueCents: sel.flatFeeValueCents,
			snapshotJson: sel.snapshotJson,
			task: sel.task
		}));

		const updatedCustomRows = draft.customRows.map((row) => {
			const rawDesc = String(formData.get(`customRowDesc:${row.id}`) ?? '');
			const rawAmount = String(formData.get(`customRowAmount:${row.id}`) ?? '');
			const description = normalizeDescription(rawDesc, row.description);
			const amountCents = rawAmount ? Math.round(parseFloat(rawAmount) * 100) : row.amountCents;
			return {
				id: row.id,
				description,
				amountCents: isNaN(amountCents) ? row.amountCents : Math.max(0, amountCents),
				sourceExpenseId: row.sourceExpenseId
			};
		});

		const issueDate = new Date();
		const taskTotal = updatedSelections.reduce((s, sel) => s + selectionAmount(sel), 0);
		const customTotal = updatedCustomRows.reduce((s, r) => s + r.amountCents, 0);
		const netTotalCents = taskTotal + customTotal;
		const vatTotalCents = Math.round((netTotalCents * draft.vatRateBasisPoints) / 10000);
		const grossTotalCents = netTotalCents + vatTotalCents;
		const timeLogIds = updatedSelections.flatMap((sel) => getTimeLogIdsFromSelection(sel));

		const projectMap = new Map<string, { tasks: { description: string; hours: number | null; amountCents: number }[]; netAmountCents: number }>();
		for (const sel of updatedSelections) {
			const projectName = sel.task.taskList.project.name;
			const hours = getHoursFromSelection(sel);
			const amountCents = selectionAmount(sel);
			if (!projectMap.has(projectName)) projectMap.set(projectName, { tasks: [], netAmountCents: 0 });
			const grp = projectMap.get(projectName)!;
			grp.tasks.push({ description: sel.description, hours, amountCents });
			grp.netAmountCents += amountCents;
		}
		const projectGroups = Array.from(projectMap.entries()).map(([projectName, data]) => ({ projectName, tasks: data.tasks, netAmountCents: data.netAmountCents }));

		const snapshot: InvoicePdfSnapshot = {
			invoiceNumber: '',
			issueDate: formatDateForInput(issueDate),
			dueDate: formatDateForInput(dueDate),
			servicePeriodFrom: formatDateForInput(servicePeriodFrom),
			servicePeriodTo: formatDateForInput(servicePeriodTo),
			currency: company.currency,
			paymentMethod: draft.paymentMethod,
			company: { legalName: company.legalName, registrationNumber: company.eikBulstat, vatNumber: company.vatNumber, address: company.registeredAddress, molName: company.molName, email: company.email, phone: company.phone, website: company.website },
			client: { legalName: draft.client.legalName, registrationNumber: draft.client.registrationNumber, vatNumber: draft.client.vatNumber, address: draft.client.billingAddress, molName: draft.client.mol },
			projectGroups,
			customRows: updatedCustomRows.map((r) => ({ description: r.description, amountCents: r.amountCents })),
			netTotalCents, vatTotalCents, grossTotalCents, vatRateBasisPoints: draft.vatRateBasisPoints,
			paidTotalCents: 0,
			bankName: company.bankName, bankIban: company.bankIban, bankBic: company.bankBic
		};

		const { invoiceNumber } = await db.$transaction(async (tx) => {
			const rows = await tx.$queryRaw<Array<{ assignedNumber: number }>>`
				UPDATE "Company" SET "invoiceNextNumber" = "invoiceNextNumber" + 1
				WHERE "id" = ${company.id}
				RETURNING "invoiceNextNumber" - 1 AS "assignedNumber"
			`;
			const assignedNumber = rows[0]?.assignedNumber;
			if (!assignedNumber) throw new Error('Неуспешно резервиране на номер за фактура.');

			const invoiceNumber = String(assignedNumber);
			snapshot.invoiceNumber = invoiceNumber;
			const pdfBuffer = await generateInvoicePdf(snapshot);

			for (const sel of updatedSelections) {
				await tx.invoiceTaskSelection.update({ where: { id: sel.id }, data: { description: sel.description } });
			}
			for (const row of updatedCustomRows) {
				await tx.invoiceCustomRow.update({ where: { id: row.id }, data: { description: row.description, amountCents: row.amountCents } });
			}

			const updated = await tx.invoice.updateMany({
				where: { id: draft.id, status: 'draft' },
				data: { status: 'issued', invoiceNumber, issueDate, dueDate, servicePeriodFrom, servicePeriodTo, netTotalCents, vatTotalCents, grossTotalCents, isStaleDraft: false, lastUpdatedAt: issueDate, issuedSnapshotJson: snapshot as unknown as Prisma.InputJsonValue, issuedPdfFilename: `invoice-${invoiceNumber}.pdf`, issuedPdfContentType: 'application/pdf', issuedPdfBlob: pdfBuffer }
			});

			if (updated.count !== 1) throw new Error('Черновата вече не е налична за издаване.');

			if (timeLogIds.length > 0) {
				await tx.taskTimeLog.updateMany({ where: { id: { in: timeLogIds }, invoicedAt: null }, data: { invoicedAt: issueDate } });
			}

			return { invoiceNumber };
		});

		await logAuditEvent({
			actorUserId: locals.user.id, eventType: 'invoice_issued', entityType: 'invoice', entityId: draft.id,
			newValueJson: { invoiceNumber, netTotalCents, grossTotalCents },
			ipAddress: getClientAddress(), userAgent: request.headers.get('user-agent') ?? undefined
		});

		redirect(303, `/invoices/${draft.id}`);
	},

	addCustomRow: async ({ params, request, locals }) => {
		if (!locals.user || !canManageInvoices(locals.user.role)) {
			return fail(403, { draftError: 'Нямате права за тази операция.' });
		}

		const draft = await db.invoice.findFirst({
			where: { id: params.invoiceId, status: 'draft' },
			select: { id: true, _count: { select: { customRows: true } } }
		});
		if (!draft) return fail(404, { draftError: 'Черновата не е намерена.' });

		const formData = await request.formData();
		const description = String(formData.get('description') ?? '').trim();
		const amountInput = String(formData.get('amountCents') ?? '');
		const amountCents = Math.round(parseFloat(amountInput) * 100);

		if (!description) return fail(422, { customRowError: 'Описанието е задължително.' });
		if (!amountInput || isNaN(amountCents) || amountCents < 0) {
			return fail(422, { customRowError: 'Въведете валидна сума.' });
		}

		await db.invoiceCustomRow.create({
			data: {
				invoiceId: draft.id,
				description,
				amountCents,
				sortOrder: draft._count.customRows
			}
		});

		return { customRowSuccess: true };
	},

	removeCustomRow: async ({ params, request, locals }) => {
		if (!locals.user || !canManageInvoices(locals.user.role)) {
			return fail(403, { draftError: 'Нямате права за тази операция.' });
		}

		const formData = await request.formData();
		const rowId = String(formData.get('rowId') ?? '');

		const row = await db.invoiceCustomRow.findFirst({
			where: { id: rowId, invoiceId: params.invoiceId },
			select: { id: true, sourceExpenseId: true }
		});
		if (!row) return fail(404, { draftError: 'Редът не е намерен.' });

		await db.$transaction(async (tx) => {
			await tx.invoiceCustomRow.delete({ where: { id: row.id } });
			if (row.sourceExpenseId) {
				await tx.expense.update({ where: { id: row.sourceExpenseId }, data: { invoicedAt: null } });
			}
		});

		return { customRowSuccess: true };
	},

	syncDraft: async ({ params, request, locals, getClientAddress }) => {
		if (!locals.user || !canManageInvoices(locals.user.role)) {
			return fail(403, { draftError: 'Нямате права за тази операция.' });
		}

		const company = await db.company.findFirst({
			select: { id: true, defaultPaymentTermDays: true }
		});
		if (!company) return fail(500, { draftError: 'Компанията не е намерена.' });

		const draft = await db.invoice.findFirst({
			where: { id: params.invoiceId, status: 'draft' },
			include: {
				client: { select: { id: true, defaultPaymentTermDays: true } },
				taskSelections: {
					include: {
						task: {
							include: {
								taskList: { include: { project: { select: { id: true, name: true } } } },
								timeLogs: {
									where: { invoicedAt: null },
									orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
									select: { id: true, workDate: true, description: true, durationMinutes: true, startMinuteOfDay: true, endMinuteOfDay: true, snapshotCostRateCents: true, snapshotBillableRateCents: true, userId: true }
								}
							}
						}
					}
				},
				customRows: {
					select: { id: true, amountCents: true, sourceExpenseId: true }
				}
			}
		});
		if (!draft) return fail(404, { draftError: 'Черновата не е намерена.' });

		const existingSourceExpenseIds = draft.customRows
			.map((r) => r.sourceExpenseId)
			.filter((id): id is string => id !== null);

		// Find new invoiceable tasks for this client not yet in any draft invoice
		const newTasks = await db.task.findMany({
			where: {
				billingType: { in: ['hourly', 'flat_fee'] },
				taskList: {
					project: {
						clientId: draft.clientId,
						isBillable: true,
						client: { companyId: company.id }
					}
				},
				invoiceSelections: { none: { invoice: { status: 'draft' } } }
			},
			include: {
				timeLogs: {
					where: { invoicedAt: null },
					orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
					select: { id: true, workDate: true, description: true, durationMinutes: true, startMinuteOfDay: true, endMinuteOfDay: true, snapshotCostRateCents: true, snapshotBillableRateCents: true, userId: true }
				},
				taskList: { include: { project: { select: { id: true, name: true } } } }
			}
		});

		const validNewTasks = newTasks.filter((task) => {
			if (task.billingType === 'flat_fee') return (task.flatFeeAmountCents ?? 0) > 0;
			const total = task.timeLogs.reduce((s, l) => s + centsFromMinutes(l.snapshotBillableRateCents, l.durationMinutes), 0);
			return task.timeLogs.length > 0 && total > 0;
		});

		// Find new billable expenses not already pulled into this invoice
		const newExpenses = await db.expense.findMany({
			where: {
				clientId: draft.clientId,
				billableToInvoice: true,
				invoicedAt: null,
				...(existingSourceExpenseIds.length > 0 ? { id: { notIn: existingSourceExpenseIds } } : {})
			},
			orderBy: [{ incurredDate: 'asc' }],
			select: { id: true, description: true, amountCents: true }
		});

		// Recalculate existing task selections with fresh timelog data
		const descriptionByTaskId = new Map(draft.taskSelections.map((s) => [s.taskId, s.description]));
		const existingSnapshots = draft.taskSelections.map((s) =>
			buildDraftSelectionSnapshot(
				s.task,
				draft.clientId,
				descriptionByTaskId.get(s.taskId) ?? buildDefaultInvoiceLineDescription(s.task)
			)
		);
		const existingSnapshotByTaskId = new Map(existingSnapshots.map((s) => [s.taskId, s]));

		// Build snapshots for new tasks
		const newSnapshots = validNewTasks.map((task) =>
			buildDraftSelectionSnapshot(task, draft.clientId)
		);

		const existingCustomRowCount = draft.customRows.length;
		const now = new Date();

		await db.$transaction(async (tx) => {
			// Recalculate existing task selections
			for (const sel of draft.taskSelections) {
				const snap = existingSnapshotByTaskId.get(sel.taskId);
				if (!snap) continue;
				await tx.invoiceTaskSelection.update({
					where: { id: sel.id },
					data: { description: snap.description, hourlyUninvoicedValueCents: snap.hourlyUninvoicedValueCents, flatFeeValueCents: snap.flatFeeValueCents, snapshotJson: snap.snapshotJson, snapshotTakenAt: now }
				});
			}

			// Add new task selections
			for (const snap of newSnapshots) {
				await tx.invoiceTaskSelection.create({
					data: { invoiceId: draft.id, taskId: snap.taskId, description: snap.description, hourlyUninvoicedValueCents: snap.hourlyUninvoicedValueCents, flatFeeValueCents: snap.flatFeeValueCents, snapshotJson: snap.snapshotJson }
				});
			}

			// Add new expense custom rows and mark expenses as invoiced
			for (let i = 0; i < newExpenses.length; i++) {
				const exp = newExpenses[i];
				await tx.invoiceCustomRow.create({
					data: { invoiceId: draft.id, description: exp.description, amountCents: exp.amountCents, sortOrder: existingCustomRowCount + i, sourceExpenseId: exp.id }
				});
				await tx.expense.update({ where: { id: exp.id }, data: { invoicedAt: now } });
			}

			// Recalculate totals across all selections and custom rows
			const allSnapshots = [...existingSnapshots, ...newSnapshots];
			const totals = summarizeDraftSelections(allSnapshots, draft.vatRateBasisPoints);
			const customTotal = draft.customRows.reduce((s, r) => s + r.amountCents, 0) +
				newExpenses.reduce((s, e) => s + e.amountCents, 0);
			const netTotalCents = totals.netTotalCents + customTotal;
			const vatTotalCents = Math.round((netTotalCents * draft.vatRateBasisPoints) / 10000);

			await tx.invoice.update({
				where: { id: draft.id },
				data: {
					servicePeriodFrom: draft.servicePeriodFrom ?? totals.servicePeriodFrom,
					servicePeriodTo: draft.servicePeriodTo ?? totals.servicePeriodTo,
					netTotalCents,
					vatTotalCents,
					grossTotalCents: netTotalCents + vatTotalCents,
					isStaleDraft: false,
					lastUpdatedAt: now
				}
			});
		});

		await logAuditEvent({
			actorUserId: locals.user.id, eventType: 'invoice_draft_synced', entityType: 'invoice', entityId: draft.id,
			newValueJson: { newTasksAdded: validNewTasks.length, newExpensesAdded: newExpenses.length },
			ipAddress: getClientAddress(), userAgent: request.headers.get('user-agent') ?? undefined
		});

		return {
			draftSuccess: validNewTasks.length === 0 && newExpenses.length === 0
				? 'Няма нови записи за добавяне.'
				: `Синхронизирано: +${validNewTasks.length} задачи, +${newExpenses.length} разхода.`
		};
	},

	pullBillableExpense: async ({ params, request, locals }) => {
		if (!locals.user || !canManageInvoices(locals.user.role)) {
			return fail(403, { draftError: 'Нямате права за тази операция.' });
		}

		const formData = await request.formData();
		const expenseId = String(formData.get('expenseId') ?? '');

		const [draft, expense] = await Promise.all([
			db.invoice.findFirst({
				where: { id: params.invoiceId, status: 'draft' },
				select: { id: true, clientId: true, _count: { select: { customRows: true } } }
			}),
			db.expense.findFirst({
				where: { id: expenseId, billableToInvoice: true, invoicedAt: null },
				select: { id: true, clientId: true, description: true, amountCents: true }
			})
		]);

		if (!draft) return fail(404, { draftError: 'Черновата не е намерена.' });
		if (!expense) return fail(404, { draftError: 'Разходът не е намерен или вече е фактуриран.' });
		if (expense.clientId !== draft.clientId) {
			return fail(409, { draftError: 'Разходът е за различен клиент.' });
		}

		await db.$transaction(async (tx) => {
			await tx.invoiceCustomRow.create({
				data: {
					invoiceId: draft.id,
					description: expense.description,
					amountCents: expense.amountCents,
					sortOrder: draft._count.customRows,
					sourceExpenseId: expense.id
				}
			});
			await tx.expense.update({
				where: { id: expense.id },
				data: { invoicedAt: new Date() }
			});
		});

		return { customRowSuccess: true };
	}
};
