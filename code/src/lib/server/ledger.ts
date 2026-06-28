import type { PrismaClient } from '@prisma/client';
import { db } from './db';

/**
 * Creates a LedgerEntry linked to an InvoicePayment.
 * Call this after creating the InvoicePayment record (within the same transaction if possible).
 * Silently skips if the container is not found.
 */
export async function createInvoicePaymentLedgerEntry(
	tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
	paymentId: string,
	containerId: string,
	amountCents: number,
	paymentDate: Date,
	invoiceNumber: string,
	userId: string
): Promise<void> {
	const container = await tx.moneyContainer.findUnique({
		where: { id: containerId },
		select: { id: true }
	});

	if (!container) {
		// Container doesn't exist yet — skip gracefully
		return;
	}

	await tx.ledgerEntry.create({
		data: {
			containerId,
			entryType: 'invoice_payment',
			amountCents: Math.abs(amountCents), // always positive (credit)
			entryDate: paymentDate,
			description: `Плащане по фактура #${invoiceNumber}`,
			invoicePaymentId: paymentId,
			createdByUserId: userId
		}
	});
}

/**
 * Creates a LedgerEntry linked to an Expense payment.
 * amountCents should be the positive expense amount — this function stores it as negative (debit).
 * Call this inside a transaction after updating the Expense record.
 * Silently skips if the container is not found.
 */
export async function createExpensePaymentLedgerEntry(
	tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
	expenseId: string,
	containerId: string,
	amountCents: number,
	paidDate: Date,
	description: string,
	userId: string
): Promise<void> {
	await tx.ledgerEntry.create({
		data: {
			containerId,
			entryType: 'expense_payment',
			amountCents: -Math.abs(amountCents), // always negative (debit)
			entryDate: paidDate,
			description: `Разход: ${description}`,
			expenseId,
			createdByUserId: userId
		}
	});
}

/**
 * Returns or creates both money containers for the given company.
 * Should be called from page load functions.
 */
export async function ensureMoneyContainers(companyId: string) {
	const existing = await db.moneyContainer.findMany({
		where: { companyId }
	});

	const hasBank = existing.some((c) => c.containerType === 'bank');
	const hasCashbox = existing.some((c) => c.containerType === 'cashbox');

	if (!hasBank) {
		await db.moneyContainer.create({
			data: {
				companyId,
				containerType: 'bank',
				name: 'Банка',
				openingBalanceCents: 0
			}
		});
	}

	if (!hasCashbox) {
		await db.moneyContainer.create({
			data: {
				companyId,
				containerType: 'cashbox',
				name: 'Каса',
				openingBalanceCents: 0
			}
		});
	}

	// Return fresh list after potential creation
	return db.moneyContainer.findMany({
		where: { companyId },
		orderBy: [{ containerType: 'asc' }]
	});
}
