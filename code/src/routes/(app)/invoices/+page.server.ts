import { fail, redirect, error, isHttpError, isRedirect } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import { createInvoicePaymentLedgerEntry } from '$lib/server/ledger';
import { generateInvoicePdf, type InvoicePdfSnapshot } from '$lib/server/invoice-pdf';
import {
	buildDefaultInvoiceLineDescription,
	buildDraftSelectionSnapshot,
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

async function getCompanyOrRedirect() {
	const company = await db.company.findFirst({
		select: {
			id: true,
			legalName: true,
			eikBulstat: true,
			vatNumber: true,
			registeredAddress: true,
			molName: true,
			currency: true,
			defaultPaymentTermDays: true,
			vatRateBasisPoints: true
		}
	});

	if (!company) {
		redirect(302, '/bootstrap');
	}

	return company;
}

async function getDrafts() {
	return db.invoice.findMany({
		where: {
			status: 'draft'
		},
		orderBy: [{ createdAt: 'desc' }],
		include: {
			client: {
				select: {
					id: true,
					legalName: true,
					registrationNumber: true,
					vatNumber: true,
					mol: true,
					billingAddress: true,
					defaultPaymentTermDays: true
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
}

async function getIssuedInvoices(filters: {
	status: string;
	clientId: string;
	dateFrom: string;
	dateTo: string;
	search: string;
}) {
	const nonDraftStatuses = ['issued', 'partially_paid', 'paid', 'overdue', 'voided'] as const;
	const validStatuses = nonDraftStatuses.filter((s) => s === filters.status);

	const statusFilter =
		filters.status && validStatuses.length > 0
			? { status: validStatuses[0] }
			: { status: { in: nonDraftStatuses } };

	const where: Record<string, unknown> = {
		...statusFilter,
		...(filters.clientId ? { clientId: filters.clientId } : {}),
		...(filters.dateFrom || filters.dateTo
			? {
					issueDate: {
						...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
						...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {})
					}
				}
			: {}),
		...(filters.search
			? {
					OR: [
						{ invoiceNumber: { contains: filters.search, mode: 'insensitive' } },
						{ client: { legalName: { contains: filters.search, mode: 'insensitive' } } }
					]
				}
			: {})
	};

	return db.invoice.findMany({
		where,
		orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
		select: {
			id: true,
			invoiceNumber: true,
			issueDate: true,
			dueDate: true,
			netTotalCents: true,
			vatTotalCents: true,
			grossTotalCents: true,
			paidTotalCents: true,
			isStaleDraft: true,
			paymentMethod: true,
			status: true,
			issuedPdfFilename: true,
			client: {
				select: {
					legalName: true
				}
			},
			payments: {
				orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
				select: {
					id: true,
					amountCents: true,
					paymentDate: true,
					paymentMethod: true,
					notes: true
				}
			}
		}
	});
}

async function getDraftForUpdate(invoiceId: string) {
	return db.invoice.findFirst({
		where: {
			id: invoiceId,
			status: 'draft'
		},
		include: {
			client: {
				select: {
					id: true,
					legalName: true,
					registrationNumber: true,
					vatNumber: true,
					mol: true,
					billingAddress: true,
					defaultPaymentTermDays: true
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
							flatFeeAmountCents: true,
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
			}
		}
	});
}

function selectionAmount(selection: {
	hourlyUninvoicedValueCents: number | null;
	flatFeeValueCents: number | null;
}) {
	return selection.hourlyUninvoicedValueCents ?? selection.flatFeeValueCents ?? 0;
}

type IssuableDraftSnapshot = {
	dueDate: Date | null;
	servicePeriodFrom: Date | null;
	servicePeriodTo: Date | null;
	netTotalCents: number;
	vatTotalCents: number;
	grossTotalCents: number;
	vatRateBasisPoints: number;
	paymentMethod: string;
	client: {
		legalName: string;
		registrationNumber: string | null;
		vatNumber: string | null;
		mol: string | null;
		billingAddress: string | null;
	};
	taskSelections: Array<{
		description: string;
		hourlyUninvoicedValueCents: number | null;
		flatFeeValueCents: number | null;
		task: {
			taskList: {
				project: {
					name: string;
				};
			};
		};
	}>;
};

function buildIssuedSnapshot(
	company: Awaited<ReturnType<typeof getCompanyOrRedirect>>,
	draft: IssuableDraftSnapshot,
	invoiceNumber: string,
	issueDate: Date
): InvoicePdfSnapshot {
	return {
		invoiceNumber,
		issueDate: formatDateForInput(issueDate),
		dueDate: formatDateForInput(draft.dueDate),
		servicePeriodFrom: formatDateForInput(draft.servicePeriodFrom),
		servicePeriodTo: formatDateForInput(draft.servicePeriodTo),
		currency: company.currency,
		paymentMethod: draft.paymentMethod,
		company: {
			legalName: company.legalName,
			registrationNumber: company.eikBulstat,
			vatNumber: company.vatNumber,
			address: company.registeredAddress,
			molName: company.molName
		},
		client: {
			legalName: draft.client.legalName,
			registrationNumber: draft.client.registrationNumber,
			vatNumber: draft.client.vatNumber,
			address: draft.client.billingAddress,
			molName: draft.client.mol
		},
		lines: draft.taskSelections.map((selection) => ({
			description: selection.description,
			projectName: selection.task.taskList.project.name,
			amountCents: selectionAmount(selection)
		})),
		netTotalCents: draft.netTotalCents,
		vatTotalCents: draft.vatTotalCents,
		grossTotalCents: draft.grossTotalCents,
		vatRateBasisPoints: draft.vatRateBasisPoints
	};
}

function getTimeLogIdsFromSelection(selection: { snapshotJson: Prisma.JsonValue | null }) {
	if (!selection.snapshotJson || typeof selection.snapshotJson !== 'object' || Array.isArray(selection.snapshotJson)) {
		return [];
	}

	const snapshot = selection.snapshotJson as {
		timeLogs?: Array<{ id?: string }>;
	};

	return (snapshot.timeLogs ?? [])
		.map((entry) => entry.id)
		.filter((value): value is string => Boolean(value));
}

export const load: PageServerLoad = async ({ parent, url }) => {
	try {
		const { user } = await parent();
		if (!canManageInvoices(user.role)) {
			redirect(302, '/dashboard');
		}

		const company = await getCompanyOrRedirect();

		const filters = {
			status: url.searchParams.get('status') ?? '',
			clientId: url.searchParams.get('clientId') ?? '',
			dateFrom: url.searchParams.get('dateFrom') ?? '',
			dateTo: url.searchParams.get('dateTo') ?? '',
			search: url.searchParams.get('search') ?? ''
		};

		const [drafts, issuedInvoices, clients] = await Promise.all([
			getDrafts(),
			getIssuedInvoices(filters),
			db.client.findMany({
				where: { companyId: company.id, status: 'active' },
				orderBy: { legalName: 'asc' },
				select: { id: true, legalName: true }
			})
		]);

		return {
			company,
			drafts,
			issuedInvoices,
			clients,
			filters,
			draftCreated: url.searchParams.get('draftCreated'),
			issuedInvoiceId: url.searchParams.get('issued')
		};
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане на данните.');
	}
};

export const actions: Actions = {
	saveDraft: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageInvoices(locals.user.role)) {
			return fail(403, { draftError: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const invoiceId = String(formData.get('invoiceId') ?? '');
		const draft = await getDraftForUpdate(invoiceId);

		if (!draft) {
			return fail(404, { draftError: 'Черновата не е намерена.', draftId: invoiceId });
		}

		const dueDateInput = String(formData.get('dueDate') ?? '');
		const servicePeriodFromInput = String(formData.get('servicePeriodFrom') ?? '');
		const servicePeriodToInput = String(formData.get('servicePeriodTo') ?? '');

		const dueDate =
			parseOptionalDateInput(dueDateInput) ??
			resolveDraftDueDate(draft.dueDate, draft.client.defaultPaymentTermDays, company.defaultPaymentTermDays);
		const servicePeriodFrom = parseOptionalDateInput(servicePeriodFromInput);
		const servicePeriodTo = parseOptionalDateInput(servicePeriodToInput);

		if (servicePeriodFrom && servicePeriodTo && servicePeriodFrom > servicePeriodTo) {
			return fail(422, {
				draftError: 'Началната дата на периода трябва да е преди крайната.',
				draftId: invoiceId
			});
		}

		const selectionUpdates = draft.taskSelections.map((selection) => ({
			id: selection.id,
			description: normalizeDescription(
				String(formData.get(`description:${selection.id}`) ?? ''),
				selection.description || buildDefaultInvoiceLineDescription(selection.task)
			)
		}));
		const netTotalCents = draft.taskSelections.reduce((sum, selection) => sum + selectionAmount(selection), 0);
		const vatTotalCents = Math.round((netTotalCents * draft.vatRateBasisPoints) / 10000);
		const grossTotalCents = netTotalCents + vatTotalCents;

		await db.$transaction(async (tx) => {
			for (const selection of selectionUpdates) {
				await tx.invoiceTaskSelection.update({
					where: { id: selection.id },
					data: { description: selection.description }
				});
			}

			await tx.invoice.update({
				where: { id: draft.id },
				data: {
					dueDate,
					servicePeriodFrom,
					servicePeriodTo,
					netTotalCents,
					vatTotalCents,
					grossTotalCents,
					lastUpdatedAt: new Date()
				}
			});
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'invoice_draft_updated',
			entityType: 'invoice',
			entityId: draft.id,
			newValueJson: {
				dueDate: dueDate?.toISOString() ?? null,
				servicePeriodFrom: servicePeriodFrom?.toISOString() ?? null,
				servicePeriodTo: servicePeriodTo?.toISOString() ?? null
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return {
			draftId: draft.id,
			draftSuccess: 'Черновата е обновена.'
		};
	},

	recalculateDraft: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageInvoices(locals.user.role)) {
			return fail(403, { draftError: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const invoiceId = String(formData.get('invoiceId') ?? '');
		const draft = await getDraftForUpdate(invoiceId);

		if (!draft) {
			return fail(404, { draftError: 'Черновата не е намерена.', draftId: invoiceId });
		}

		const tasks = await db.task.findMany({
			where: {
				id: {
					in: draft.taskSelections.map((selection) => selection.taskId)
				}
			},
			include: {
				taskList: {
					include: {
						project: {
							include: {
								client: {
									select: {
										id: true
									}
								}
							}
						}
					}
				},
				timeLogs: {
					where: {
						invoicedAt: null
					},
					orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
					select: {
						id: true,
						workDate: true,
						description: true,
						durationMinutes: true,
						startMinuteOfDay: true,
						endMinuteOfDay: true,
						snapshotCostRateCents: true,
						snapshotBillableRateCents: true,
						userId: true
					}
				}
			}
		});

		if (
			tasks.length !== draft.taskSelections.length ||
			tasks.some((task) => task.taskList.project.client.id !== draft.clientId)
		) {
			return fail(409, {
				draftError: 'Черновата съдържа задачи с невалидна клиентска връзка.',
				draftId: invoiceId
			});
		}

		const descriptionByTaskId = new Map(
			draft.taskSelections.map((selection) => [selection.taskId, selection.description])
		);
		const snapshots = tasks.map((task) =>
			buildDraftSelectionSnapshot(
				task,
				draft.clientId,
				descriptionByTaskId.get(task.id) ?? buildDefaultInvoiceLineDescription(task)
			)
		);
		const snapshotByTaskId = new Map(snapshots.map((snapshot) => [snapshot.taskId, snapshot]));
		const totals = summarizeDraftSelections(snapshots, draft.vatRateBasisPoints);

		await db.$transaction(async (tx) => {
			for (const selection of draft.taskSelections) {
				const snapshot = snapshotByTaskId.get(selection.taskId);
				if (!snapshot) {
					continue;
				}

				await tx.invoiceTaskSelection.update({
					where: { id: selection.id },
					data: {
						description: snapshot.description,
						hourlyUninvoicedValueCents: snapshot.hourlyUninvoicedValueCents,
						flatFeeValueCents: snapshot.flatFeeValueCents,
						snapshotJson: snapshot.snapshotJson,
						snapshotTakenAt: new Date()
					}
				});
			}

			await tx.invoice.update({
				where: { id: draft.id },
				data: {
					dueDate: resolveDraftDueDate(
						draft.dueDate,
						draft.client.defaultPaymentTermDays,
						company.defaultPaymentTermDays
					),
					servicePeriodFrom: draft.servicePeriodFrom ?? totals.servicePeriodFrom,
					servicePeriodTo: draft.servicePeriodTo ?? totals.servicePeriodTo,
					netTotalCents: totals.netTotalCents,
					vatTotalCents: totals.vatTotalCents,
					grossTotalCents: totals.grossTotalCents,
					isStaleDraft: false,
					lastUpdatedAt: new Date()
				}
			});
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'invoice_draft_recalculated',
			entityType: 'invoice',
			entityId: draft.id,
			newValueJson: {
				netTotalCents: totals.netTotalCents,
				vatTotalCents: totals.vatTotalCents,
				grossTotalCents: totals.grossTotalCents
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return {
			draftId: draft.id,
			draftSuccess: 'Черновата е преизчислена.'
		};
	},

	issueDraft: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageInvoices(locals.user.role)) {
			return fail(403, { draftError: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const invoiceId = String(formData.get('invoiceId') ?? '');
		const draft = await getDraftForUpdate(invoiceId);

		if (!draft) {
			return fail(404, { draftError: 'Черновата не е намерена.', draftId: invoiceId });
		}

		const dueDateInput = String(formData.get('dueDate') ?? '');
		const servicePeriodFromInput = String(formData.get('servicePeriodFrom') ?? '');
		const servicePeriodToInput = String(formData.get('servicePeriodTo') ?? '');
		const dueDate =
			parseOptionalDateInput(dueDateInput) ??
			resolveDraftDueDate(draft.dueDate, draft.client.defaultPaymentTermDays, company.defaultPaymentTermDays);
		const servicePeriodFrom = parseOptionalDateInput(servicePeriodFromInput) ?? draft.servicePeriodFrom;
		const servicePeriodTo = parseOptionalDateInput(servicePeriodToInput) ?? draft.servicePeriodTo;

		if (servicePeriodFrom && servicePeriodTo && servicePeriodFrom > servicePeriodTo) {
			return fail(422, {
				draftError: 'Началната дата на периода трябва да е преди крайната.',
				draftId: invoiceId
			});
		}

		const updatedSelections = draft.taskSelections.map((selection) => ({
			id: selection.id,
			taskId: selection.taskId,
			description: normalizeDescription(
				String(formData.get(`description:${selection.id}`) ?? ''),
				selection.description || buildDefaultInvoiceLineDescription(selection.task)
			),
			hourlyUninvoicedValueCents: selection.hourlyUninvoicedValueCents,
			flatFeeValueCents: selection.flatFeeValueCents,
			snapshotJson: selection.snapshotJson,
			task: selection.task
		}));
		const issueDate = new Date();
		const netTotalCents = updatedSelections.reduce((sum, selection) => sum + selectionAmount(selection), 0);
		const vatTotalCents = Math.round((netTotalCents * draft.vatRateBasisPoints) / 10000);
		const grossTotalCents = netTotalCents + vatTotalCents;
		const preparedDraft = {
			...draft,
			dueDate,
			servicePeriodFrom,
			servicePeriodTo,
			netTotalCents,
			vatTotalCents,
			grossTotalCents,
			taskSelections: updatedSelections
		};
		const timeLogIds = updatedSelections.flatMap((selection) => getTimeLogIdsFromSelection(selection));

		const { assignedNumber, invoiceNumber, pdfBuffer, snapshot } = await db.$transaction(async (tx) => {
			const assignedRows = await tx.$queryRaw<Array<{ assignedNumber: number }>>`
				UPDATE "Company"
				SET "invoiceNextNumber" = "invoiceNextNumber" + 1
				WHERE "id" = ${company.id}
				RETURNING "invoiceNextNumber" - 1 AS "assignedNumber"
			`;
			const assignedNumber = assignedRows[0]?.assignedNumber;

			if (!assignedNumber) {
				throw new Error('Неуспешно резервиране на номер за фактура.');
			}

			const invoiceNumber = String(assignedNumber);
			const snapshot = buildIssuedSnapshot(company, preparedDraft, invoiceNumber, issueDate);
			const pdfBuffer = await generateInvoicePdf(snapshot);

			for (const selection of updatedSelections) {
				await tx.invoiceTaskSelection.update({
					where: { id: selection.id },
					data: { description: selection.description }
				});
			}

			const updated = await tx.invoice.updateMany({
				where: {
					id: draft.id,
					status: 'draft'
				},
				data: {
					status: 'issued',
					invoiceNumber,
					issueDate,
					dueDate,
					servicePeriodFrom,
					servicePeriodTo,
					netTotalCents,
					vatTotalCents,
					grossTotalCents,
					isStaleDraft: false,
					lastUpdatedAt: issueDate,
					issuedSnapshotJson: snapshot as unknown as Prisma.InputJsonValue,
					issuedPdfFilename: `invoice-${invoiceNumber}.pdf`,
					issuedPdfContentType: 'application/pdf',
					issuedPdfBlob: pdfBuffer
				}
			});

			if (updated.count !== 1) {
				throw new Error('Черновата вече не е налична за издаване.');
			}

			if (timeLogIds.length > 0) {
				await tx.taskTimeLog.updateMany({
					where: {
						id: { in: timeLogIds },
						invoicedAt: null
					},
					data: {
						invoicedAt: issueDate
					}
				});
			}

			return { assignedNumber, invoiceNumber, pdfBuffer, snapshot };
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'invoice_issued',
			entityType: 'invoice',
			entityId: draft.id,
			newValueJson: {
				invoiceNumber,
				assignedNumber,
				lockedTimeLogCount: timeLogIds.length,
				netTotalCents,
				vatTotalCents,
				grossTotalCents,
				pdfSizeBytes: pdfBuffer.length,
				snapshot
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		redirect(303, `/invoices?issued=${draft.id}`);
	},

	recordPayment: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageInvoices(locals.user.role)) {
			return fail(403, { paymentError: 'Нямате права за тази операция.' });
		}

		const formData = await request.formData();
		const invoiceId = String(formData.get('invoiceId') ?? '');
		const amountInput = String(formData.get('amount') ?? '');
		const paymentDateInput = String(formData.get('paymentDate') ?? '');
		const notesInput = String(formData.get('notes') ?? '').trim();
		const paymentMethodInput = String(formData.get('paymentMethod') ?? '');

		const amountCents = Math.round(parseFloat(amountInput) * 100);
		if (!amountInput || isNaN(amountCents) || amountCents <= 0) {
			return fail(422, { paymentError: 'Сумата трябва да е по-голяма от нула.', paymentInvoiceId: invoiceId });
		}

		const paymentDate = parseOptionalDateInput(paymentDateInput);
		if (!paymentDate) {
			return fail(422, { paymentError: 'Невалидна дата на плащане.', paymentInvoiceId: invoiceId });
		}

		const validPaymentMethods = ['bank_transfer', 'cash'] as const;
		if (!validPaymentMethods.includes(paymentMethodInput as (typeof validPaymentMethods)[number])) {
			return fail(422, { paymentError: 'Невалиден метод на плащане.', paymentInvoiceId: invoiceId });
		}
		const paymentMethod = paymentMethodInput as 'bank_transfer' | 'cash';

		const invoice = await db.invoice.findFirst({
			where: { id: invoiceId, status: { in: ['issued', 'partially_paid'] } },
			select: { id: true, grossTotalCents: true, paidTotalCents: true, status: true, invoiceNumber: true }
		});

		if (!invoice) {
			return fail(404, { paymentError: 'Фактурата не е намерена или не може да получава плащания.', paymentInvoiceId: invoiceId });
		}

		// Determine which container to credit based on payment method
		const containerType = paymentMethod === 'bank_transfer' ? 'bank' : 'cashbox';
		const company = await db.company.findFirst({ select: { id: true } });
		const container = company
			? await db.moneyContainer.findUnique({
					where: { companyId_containerType: { companyId: company.id, containerType } },
					select: { id: true }
				})
			: null;

		await db.$transaction(async (tx) => {
			const payment = await tx.invoicePayment.create({
				data: {
					invoiceId: invoice.id,
					amountCents,
					paymentDate,
					paymentMethod,
					notes: notesInput || null,
					recordedByUserId: locals.user!.id
				}
			});

			const newPaidTotal = invoice.paidTotalCents + amountCents;
			const newStatus = newPaidTotal >= invoice.grossTotalCents ? 'paid' : 'partially_paid';

			await tx.invoice.update({
				where: { id: invoice.id },
				data: {
					paidTotalCents: newPaidTotal,
					status: newStatus,
					lastUpdatedAt: new Date()
				}
			});

			if (container) {
				await createInvoicePaymentLedgerEntry(
					tx,
					payment.id,
					container.id,
					amountCents,
					paymentDate,
					invoice.invoiceNumber ?? invoiceId,
					locals.user!.id
				);
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'invoice_payment_recorded',
			entityType: 'invoice',
			entityId: invoiceId,
			newValueJson: {
				amountCents,
				paymentDate: paymentDate.toISOString(),
				paymentMethod
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { paymentSuccess: 'Плащането е записано.', paymentInvoiceId: invoiceId };
	},

	updatePaymentMethod: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageInvoices(locals.user.role)) {
			return fail(403, { paymentMethodError: 'Нямате права за тази операция.' });
		}

		const formData = await request.formData();
		const invoiceId = String(formData.get('invoiceId') ?? '');
		const paymentMethodInput = String(formData.get('paymentMethod') ?? '');

		const validPaymentMethods = ['bank_transfer', 'cash'] as const;
		if (!validPaymentMethods.includes(paymentMethodInput as (typeof validPaymentMethods)[number])) {
			return fail(422, { paymentMethodError: 'Невалиден метод на плащане.', paymentMethodInvoiceId: invoiceId });
		}
		const paymentMethod = paymentMethodInput as 'bank_transfer' | 'cash';

		const invoice = await db.invoice.findFirst({
			where: { id: invoiceId, status: 'issued' },
			select: {
				id: true,
				paymentMethod: true,
				_count: { select: { payments: true } }
			}
		});

		if (!invoice) {
			return fail(404, { paymentMethodError: 'Фактурата не е намерена.', paymentMethodInvoiceId: invoiceId });
		}

		if (invoice._count.payments > 0) {
			return fail(409, {
				paymentMethodError: 'Методът на плащане не може да се промени след като има записани плащания.',
				paymentMethodInvoiceId: invoiceId
			});
		}

		const oldPaymentMethod = invoice.paymentMethod;

		await db.invoice.update({
			where: { id: invoice.id },
			data: { paymentMethod, lastUpdatedAt: new Date() }
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'invoice_payment_method_updated',
			entityType: 'invoice',
			entityId: invoiceId,
			oldValueJson: { paymentMethod: oldPaymentMethod },
			newValueJson: { paymentMethod },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { paymentMethodSuccess: 'Методът на плащане е обновен.', paymentMethodInvoiceId: invoiceId };
	}
};
