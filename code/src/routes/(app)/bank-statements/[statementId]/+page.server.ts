import { fail, redirect, error, isHttpError, isRedirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import { createInvoicePaymentLedgerEntry } from '$lib/server/ledger';
import type { Actions, PageServerLoad } from './$types';

function canManageStatements(role: string) {
	return role === 'admin' || role === 'accountant';
}

async function getCompanyOrRedirect() {
	const company = await db.company.findFirst({ select: { id: true } });
	if (!company) {
		redirect(302, '/bootstrap');
	}
	return company;
}

export const load: PageServerLoad = async ({ parent, params }) => {
	try {
		const { user } = await parent();
		if (!canManageStatements(user.role)) {
			redirect(302, '/dashboard');
		}

		const company = await getCompanyOrRedirect();
		const { statementId } = params;

		const statement = await db.bankStatement.findFirst({
			where: { id: statementId, companyId: company.id },
			select: {
				id: true,
				originalFilename: true,
				importedAt: true,
				parseStatus: true,
				parsingVersion: true,
				sizeBytes: true,
				importedByUser: { select: { firstName: true, lastName: true } },
				rows: {
					orderBy: [{ rowIndex: 'asc' }],
					select: {
						id: true,
						rowIndex: true,
						transactionDate: true,
						description: true,
						amountCents: true,
						matchState: true,
						reviewNote: true,
						invoicePayment: {
							select: {
								id: true,
								amountCents: true,
								paymentDate: true,
								paymentMethod: true,
								notes: true,
								invoice: {
									select: {
										id: true,
										invoiceNumber: true,
										status: true,
										client: { select: { legalName: true } }
									}
								}
							}
						},
						standaloneIncome: {
							select: {
								id: true,
								description: true,
								amountCents: true,
								incomeDate: true
							}
						}
					}
				}
			}
		});

		if (!statement) {
			redirect(302, '/bank-statements');
		}

		// Group rows by matchState
		const matchedRows = statement.rows.filter((r) => r.matchState === 'auto_matched');
		const needsReviewRows = statement.rows.filter((r) => r.matchState === 'needs_review');
		const unmatchedRows = statement.rows.filter((r) => r.matchState === 'unmatched');
		const irrelevantRows = statement.rows.filter((r) => r.matchState === 'irrelevant');

		// Load open invoices for manual matching (issued/partially_paid for this company)
		const openInvoices = await db.invoice.findMany({
			where: {
				status: { in: ['issued', 'partially_paid'] },
				client: { companyId: company.id }
			},
			orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
			select: {
				id: true,
				invoiceNumber: true,
				grossTotalCents: true,
				paidTotalCents: true,
				status: true,
				client: { select: { legalName: true } }
			}
		});

		return {
			statement: {
				id: statement.id,
				originalFilename: statement.originalFilename,
				importedAt: statement.importedAt,
				parseStatus: statement.parseStatus,
				parsingVersion: statement.parsingVersion,
				sizeBytes: statement.sizeBytes,
				importedByName: `${statement.importedByUser.firstName} ${statement.importedByUser.lastName}`.trim()
			},
			matchedRows,
			needsReviewRows,
			unmatchedRows,
			irrelevantRows,
			openInvoices: openInvoices.map((inv) => ({
				id: inv.id,
				invoiceNumber: inv.invoiceNumber,
				clientName: inv.client.legalName,
				remainingCents: inv.grossTotalCents - inv.paidTotalCents,
				status: inv.status
			})),
			autoMatchCounts: {
				matched: matchedRows.length,
				needsReview: needsReviewRows.length,
				unmatched: unmatchedRows.length,
				irrelevant: irrelevantRows.length
			}
		};
	} catch (e) {
		if (isRedirect(e) || isHttpError(e)) throw e;
		console.error(e);
		throw error(500, 'Грешка при зареждане на данните.');
	}
};

export const actions: Actions = {
	markIrrelevant: async ({ request, locals, params, getClientAddress }) => {
		if (!locals.user || !canManageStatements(locals.user.role)) {
			return fail(403, { error: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const { statementId } = params;
		const formData = await request.formData();
		const rowId = String(formData.get('rowId') ?? '');

		const row = await db.bankStatementRow.findFirst({
			where: {
				id: rowId,
				statementId,
				statement: { companyId: company.id }
			},
			select: { id: true, matchState: true, invoicePaymentId: true, standaloneIncomeId: true }
		});

		if (!row) {
			return fail(404, { error: 'Редът не е намерен.' });
		}

		if (row.matchState !== 'unmatched' && row.matchState !== 'needs_review') {
			return fail(409, { error: 'Само несъвпаднали редове могат да бъдат маркирани като неотносими.' });
		}

		await db.bankStatementRow.update({
			where: { id: rowId },
			data: { matchState: 'irrelevant' }
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'statement_row_marked_irrelevant',
			entityType: 'bank_statement_row',
			entityId: rowId,
			newValueJson: { statementId, rowId },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { success: 'Редът е маркиран като неотносим.' };
	},

	convertToStandaloneIncome: async ({ request, locals, params, getClientAddress }) => {
		if (!locals.user || !canManageStatements(locals.user.role)) {
			return fail(403, { error: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const { statementId } = params;
		const formData = await request.formData();
		const rowId = String(formData.get('rowId') ?? '');

		const row = await db.bankStatementRow.findFirst({
			where: {
				id: rowId,
				statementId,
				statement: { companyId: company.id }
			},
			select: {
				id: true,
				matchState: true,
				amountCents: true,
				transactionDate: true,
				description: true
			}
		});

		if (!row) {
			return fail(404, { error: 'Редът не е намерен.' });
		}

		if (row.matchState !== 'unmatched' && row.matchState !== 'needs_review') {
			return fail(409, { error: 'Само несъвпаднали редове могат да бъдат превърнати в приход.' });
		}

		if (row.amountCents <= 0) {
			return fail(422, { error: 'Само кредитни редове могат да бъдат превърнати в приход.' });
		}

		// Find the bank container
		const bankContainer = await db.moneyContainer.findUnique({
			where: { companyId_containerType: { companyId: company.id, containerType: 'bank' } },
			select: { id: true }
		});

		if (!bankContainer) {
			return fail(404, { error: 'Банковият контейнер не е намерен. Моля, посетете Паричен поток първо.' });
		}

		const income = await db.$transaction(async (tx) => {
			const income = await tx.standaloneIncome.create({
				data: {
					companyId: company.id,
					containerId: bankContainer.id,
					description: row.description,
					amountCents: row.amountCents,
					incomeDate: row.transactionDate,
					notes: 'От банково извлечение',
					createdByUserId: locals.user!.id
				}
			});

			await tx.ledgerEntry.create({
				data: {
					containerId: bankContainer.id,
					entryType: 'standalone_income',
					amountCents: row.amountCents,
					entryDate: row.transactionDate,
					description: row.description,
					standaloneIncomeId: income.id,
					createdByUserId: locals.user!.id
				}
			});

			await tx.bankStatementRow.update({
				where: { id: rowId },
				data: {
					matchState: 'auto_matched',
					standaloneIncomeId: income.id
				}
			});

			return income;
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'statement_row_converted_to_income',
			entityType: 'bank_statement_row',
			entityId: rowId,
			newValueJson: {
				statementId,
				rowId,
				standaloneIncomeId: income.id,
				amountCents: row.amountCents,
				incomeDate: row.transactionDate.toISOString()
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { success: 'Редът е превърнат в самостоятелен приход.' };
	},

	manualMatchInvoice: async ({ request, locals, params, getClientAddress }) => {
		if (!locals.user || !canManageStatements(locals.user.role)) {
			return fail(403, { error: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const { statementId } = params;
		const formData = await request.formData();
		const rowId = String(formData.get('rowId') ?? '');
		const invoiceId = String(formData.get('invoiceId') ?? '');

		if (!invoiceId) {
			return fail(422, { error: 'Изберете фактура за свързване.', rowId });
		}

		const row = await db.bankStatementRow.findFirst({
			where: {
				id: rowId,
				statementId,
				statement: { companyId: company.id }
			},
			select: {
				id: true,
				matchState: true,
				amountCents: true,
				transactionDate: true
			}
		});

		if (!row) {
			return fail(404, { error: 'Редът не е намерен.' });
		}

		if (row.matchState !== 'unmatched' && row.matchState !== 'needs_review') {
			return fail(409, { error: 'Само несъвпаднали редове могат да бъдат свързани ръчно с фактура.' });
		}

		const invoice = await db.invoice.findFirst({
			where: {
				id: invoiceId,
				status: { in: ['issued', 'partially_paid'] },
				client: { companyId: company.id }
			},
			select: {
				id: true,
				invoiceNumber: true,
				grossTotalCents: true,
				paidTotalCents: true,
				paymentMethod: true,
				status: true
			}
		});

		if (!invoice) {
			return fail(404, { error: 'Фактурата не е намерена или вече не приема плащания.' });
		}

		// Find the bank container for ledger
		const bankContainer = await db.moneyContainer.findUnique({
			where: { companyId_containerType: { companyId: company.id, containerType: 'bank' } },
			select: { id: true }
		});

		const payment = await db.$transaction(async (tx) => {
			const payment = await tx.invoicePayment.create({
				data: {
					invoiceId: invoice.id,
					amountCents: row.amountCents,
					paymentDate: row.transactionDate,
					paymentMethod: invoice.paymentMethod,
					notes: 'Ръчно съвпадение от банк. извлечение',
					recordedByUserId: locals.user!.id
				}
			});

			const newPaidTotal = invoice.paidTotalCents + row.amountCents;
			const newStatus = newPaidTotal >= invoice.grossTotalCents ? 'paid' : 'partially_paid';

			await tx.invoice.update({
				where: { id: invoice.id },
				data: {
					paidTotalCents: newPaidTotal,
					status: newStatus,
					lastUpdatedAt: new Date()
				}
			});

			if (bankContainer) {
				await createInvoicePaymentLedgerEntry(
					tx,
					payment.id,
					bankContainer.id,
					row.amountCents,
					row.transactionDate,
					invoice.invoiceNumber ?? invoice.id,
					locals.user!.id
				);
			}

			await tx.bankStatementRow.update({
				where: { id: rowId },
				data: {
					matchState: 'auto_matched',
					invoicePaymentId: payment.id
				}
			});

			return payment;
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'statement_row_manually_matched',
			entityType: 'bank_statement_row',
			entityId: rowId,
			newValueJson: {
				statementId,
				rowId,
				invoiceId: invoice.id,
				invoiceNumber: invoice.invoiceNumber,
				amountCents: row.amountCents,
				paymentId: payment.id
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { success: 'Редът е свързан с фактура.' };
	},

	unresolveRow: async ({ request, locals, params, getClientAddress }) => {
		if (!locals.user || !canManageStatements(locals.user.role)) {
			return fail(403, { error: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const { statementId } = params;
		const formData = await request.formData();
		const rowId = String(formData.get('rowId') ?? '');

		const row = await db.bankStatementRow.findFirst({
			where: {
				id: rowId,
				statementId,
				statement: { companyId: company.id }
			},
			select: {
				id: true,
				matchState: true,
				amountCents: true,
				invoicePaymentId: true,
				standaloneIncomeId: true,
				invoicePayment: {
					select: {
						id: true,
						notes: true,
						amountCents: true,
						invoiceId: true,
						invoice: {
							select: {
								id: true,
								paidTotalCents: true,
								grossTotalCents: true,
								status: true
							}
						},
						ledgerEntry: { select: { id: true } }
					}
				}
			}
		});

		if (!row) {
			return fail(404, { error: 'Редът не е намерен.' });
		}

		if (row.matchState !== 'auto_matched' && row.matchState !== 'irrelevant') {
			return fail(409, { error: 'Само съвпаднали или неотносими редове могат да бъдат развъзани.' });
		}

		// If linked to an InvoicePayment, only allow unresolve if it came from bank statement matching
		if (row.invoicePayment) {
			const notes = row.invoicePayment.notes ?? '';
			if (!notes.includes('банк. извлечение')) {
				return fail(409, {
					error: 'Само плащания, записани от банково извлечение, могат да бъдат развъзани оттук.'
				});
			}

			const payment = row.invoicePayment;
			const invoice = payment.invoice;

			await db.$transaction(async (tx) => {
				// Delete the ledger entry first (due to FK constraints)
				if (payment.ledgerEntry) {
					await tx.ledgerEntry.delete({ where: { id: payment.ledgerEntry.id } });
				}

				// Revert invoice paid total
				const newPaidTotal = invoice.paidTotalCents - payment.amountCents;
				let newStatus: 'issued' | 'partially_paid';
				if (newPaidTotal <= 0) {
					newStatus = 'issued';
				} else {
					newStatus = 'partially_paid';
				}

				await tx.invoice.update({
					where: { id: invoice.id },
					data: {
						paidTotalCents: Math.max(0, newPaidTotal),
						status: newStatus,
						lastUpdatedAt: new Date()
					}
				});

				// Delete the invoice payment
				await tx.invoicePayment.delete({ where: { id: payment.id } });

				// Reset row to unmatched
				await tx.bankStatementRow.update({
					where: { id: rowId },
					data: {
						matchState: 'unmatched',
						invoicePaymentId: null
					}
				});
			});
		} else if (row.standaloneIncomeId) {
			// Linked to a standalone income — delete it and its ledger entry
			const income = await db.standaloneIncome.findUnique({
				where: { id: row.standaloneIncomeId },
				select: { id: true, ledgerEntry: { select: { id: true } } }
			});

			if (income) {
				await db.$transaction(async (tx) => {
					if (income.ledgerEntry) {
						await tx.ledgerEntry.delete({ where: { id: income.ledgerEntry.id } });
					}
					await tx.standaloneIncome.delete({ where: { id: income.id } });
					await tx.bankStatementRow.update({
						where: { id: rowId },
						data: {
							matchState: 'unmatched',
							standaloneIncomeId: null
						}
					});
				});
			} else {
				// No income found, just reset the row
				await db.bankStatementRow.update({
					where: { id: rowId },
					data: {
						matchState: 'unmatched',
						standaloneIncomeId: null
					}
				});
			}
		} else {
			// No linked entity — just reset the matchState (e.g. was irrelevant)
			await db.bankStatementRow.update({
				where: { id: rowId },
				data: { matchState: 'unmatched' }
			});
		}

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'statement_row_unresolved',
			entityType: 'bank_statement_row',
			entityId: rowId,
			newValueJson: {
				statementId,
				rowId,
				previousMatchState: row.matchState
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { success: 'Редът е върнат в несъвпаднало състояние.' };
	}
};
