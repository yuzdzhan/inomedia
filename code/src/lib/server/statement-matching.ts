import type { PrismaClient } from '@prisma/client';
import { db } from './db';
import { logAuditEvent } from './audit';
import { createInvoicePaymentLedgerEntry } from './ledger';

/**
 * Runs auto-matching for all unmatched credit rows in the given statement.
 * For each credit row, looks for an issued/partially_paid invoice whose
 * remaining balance (grossTotalCents - paidTotalCents) exactly equals the row amount.
 * If exactly one match is found, creates an InvoicePayment, a LedgerEntry, and marks
 * the row as auto_matched. If zero or multiple matches, leaves row as unmatched.
 *
 * Returns counts of matched / unmatched rows.
 */
export async function autoMatchStatementRows(
	statementId: string,
	companyId: string,
	userId: string
): Promise<{ matched: number; unmatched: number }> {
	// Load all unmatched credit rows for this statement
	const rows = await db.bankStatementRow.findMany({
		where: {
			statementId,
			matchState: 'unmatched',
			amountCents: { gt: 0 }
		},
		select: {
			id: true,
			amountCents: true,
			transactionDate: true,
			description: true
		}
	});

	// Find the bank container for ledger entries
	const bankContainer = await db.moneyContainer.findUnique({
		where: { companyId_containerType: { companyId, containerType: 'bank' } },
		select: { id: true }
	});

	let matched = 0;
	let unmatched = 0;

	for (const row of rows) {
		// Find invoices where remaining balance == row amount
		const matchingInvoices = await db.invoice.findMany({
			where: {
				status: { in: ['issued', 'partially_paid'] },
				client: { companyId }
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

		const exactMatches = matchingInvoices.filter(
			(inv) => inv.grossTotalCents - inv.paidTotalCents === row.amountCents
		);

		if (exactMatches.length !== 1) {
			unmatched++;
			continue;
		}

		const invoice = exactMatches[0];

		try {
			await db.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
				// Create the invoice payment
				const payment = await tx.invoicePayment.create({
					data: {
						invoiceId: invoice.id,
						amountCents: row.amountCents,
						paymentDate: row.transactionDate,
						paymentMethod: invoice.paymentMethod,
						notes: 'Авт. съвпадение от банк. извлечение',
						recordedByUserId: userId
					}
				});

				// Update invoice status
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

				// Create ledger entry if bank container exists
				if (bankContainer) {
					await createInvoicePaymentLedgerEntry(
						tx,
						payment.id,
						bankContainer.id,
						row.amountCents,
						row.transactionDate,
						invoice.invoiceNumber ?? invoice.id,
						userId
					);
				}

				// Mark the row as auto_matched
				await tx.bankStatementRow.update({
					where: { id: row.id },
					data: {
						matchState: 'auto_matched',
						invoicePaymentId: payment.id
					}
				});
			});

			await logAuditEvent({
				actorUserId: userId,
				eventType: 'statement_row_auto_matched',
				entityType: 'bank_statement_row',
				entityId: row.id,
				newValueJson: {
					statementId,
					invoiceId: invoice.id,
					invoiceNumber: invoice.invoiceNumber,
					amountCents: row.amountCents,
					transactionDate: row.transactionDate.toISOString()
				}
			});

			matched++;
		} catch {
			// If transaction fails (e.g. race condition), leave as unmatched
			unmatched++;
		}
	}

	return { matched, unmatched };
}
