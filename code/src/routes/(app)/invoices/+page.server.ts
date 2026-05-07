import { fail, redirect } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
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

async function getIssuedInvoices() {
	return db.invoice.findMany({
		where: {
			status: 'issued'
		},
		orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
		take: 20,
		select: {
			id: true,
			invoiceNumber: true,
			issueDate: true,
			grossTotalCents: true,
			issuedPdfFilename: true,
			client: {
				select: {
					legalName: true
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
			address: draft.client.billingAddress
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
	const { user } = await parent();
	if (!canManageInvoices(user.role)) {
		redirect(302, '/dashboard');
	}

	const company = await getCompanyOrRedirect();
	const [drafts, issuedInvoices] = await Promise.all([getDrafts(), getIssuedInvoices()]);

	return {
		company,
		drafts,
		issuedInvoices,
		draftCreated: url.searchParams.get('draftCreated'),
		issuedInvoiceId: url.searchParams.get('issued')
	};
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
	}
};
