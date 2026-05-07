import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import {
	buildDefaultInvoiceLineDescription,
	buildDraftSelectionSnapshot,
	parseOptionalDateInput,
	resolveDraftDueDate,
	summarizeDraftSelections
} from '$lib/server/invoice-drafts';
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

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();
	if (!canManageInvoices(user.role)) {
		redirect(302, '/dashboard');
	}

	const company = await getCompanyOrRedirect();
	const drafts = await getDrafts();

	return {
		company,
		drafts,
		draftCreated: url.searchParams.get('draftCreated')
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
		const netTotalCents = draft.taskSelections.reduce(
			(sum, selection) => sum + (selection.hourlyUninvoicedValueCents ?? selection.flatFeeValueCents ?? 0),
			0
		);
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
	}
};
