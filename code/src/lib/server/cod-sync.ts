import type { Courier, Prisma } from '@prisma/client';
import { db } from './db';
import { logAuditEvent } from './audit';
import {
	courierConfigured,
	fetchEcontPayouts,
	fetchSpeedyPayouts,
	type NormalizedPayout
} from './couriers';
import { fetchWooOrderDocument, fetchWooOrders, wooConfigured } from './woocommerce';

/**
 * Cash-on-delivery reconciliation:
 *   bank credit row  ←→  courier payout  →  shipments  →  inobags.com orders
 */

const COURIER_LABEL: Record<Courier, string> = { econt: 'Еконт', speedy: 'Спиди' };

export type SyncResult = { payouts: number; orders: number; linked: number; matched: number; errors: string[] };

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Pulls payouts from both couriers for [from, to] and upserts them with their lines. */
export async function syncCourierPayouts(companyId: string, from: string, to: string) {
	const errors: string[] = [];
	const payouts: NormalizedPayout[] = [];

	for (const [courier, fetcher] of [
		['econt', fetchEcontPayouts],
		['speedy', fetchSpeedyPayouts]
	] as const) {
		if (!courierConfigured(courier)) {
			errors.push(`${COURIER_LABEL[courier]}: липсват данни за достъп в средата.`);
			continue;
		}
		try {
			payouts.push(...(await fetcher(from, to)));
		} catch (e) {
			errors.push(e instanceof Error ? e.message : String(e));
		}
	}

	for (const p of payouts) {
		const payout = await db.courierPayout.upsert({
			where: { courier_externalRef: { courier: p.courier, externalRef: p.externalRef } },
			create: {
				companyId,
				courier: p.courier,
				externalRef: p.externalRef,
				payoutDate: dateOnly(p.payoutDate),
				amountCents: p.amountCents,
				paidInCash: p.paidInCash,
				rawJson: p.raw as Prisma.InputJsonValue
			},
			update: { amountCents: p.amountCents, paidInCash: p.paidInCash, rawJson: p.raw as Prisma.InputJsonValue }
		});
		for (const line of p.lines) {
			// Never overwrite what a person resolved (kind/note/order) on re-sync.
			await db.courierPayoutLine.upsert({
				where: { payoutId_waybillNumber: { payoutId: payout.id, waybillNumber: line.waybillNumber } },
				create: {
					payoutId: payout.id,
					waybillNumber: line.waybillNumber,
					amountCents: line.amountCents,
					deliveryDate: line.deliveryDate ? dateOnly(line.deliveryDate) : null,
					recipient: line.recipient,
					reference: line.reference
				},
				update: { amountCents: line.amountCents }
			});
		}
	}

	return { count: payouts.length, errors };
}

/** Pulls inobags.com orders created in [after, before) and downloads missing order PDFs. */
export async function syncShopOrders(companyId: string, after: Date, before: Date) {
	if (!wooConfigured()) {
		return { count: 0, errors: ['WooCommerce: липсват данни за достъп в средата.'] };
	}
	const errors: string[] = [];
	let orders;
	try {
		orders = await fetchWooOrders(after, before);
	} catch (e) {
		return { count: 0, errors: [e instanceof Error ? e.message : String(e)] };
	}

	for (const o of orders) {
		const fields = {
			orderNumber: o.orderNumber,
			orderDate: o.orderDate,
			status: o.status,
			totalCents: o.totalCents,
			paymentMethod: o.paymentMethod,
			paymentMethodTitle: o.paymentMethodTitle,
			customerName: o.customerName,
			courier: o.courier,
			waybillNumber: o.waybillNumber,
			documentNumber: o.documentNumber,
			rawJson: o.raw as unknown as Prisma.InputJsonValue,
			syncedAt: new Date()
		};
		const saved = await db.shopOrder.upsert({
			where: { externalId: o.externalId },
			create: { companyId, externalId: o.externalId, ...fields },
			update: fields,
			select: { id: true, pdfFilename: true }
		});

		if (!saved.pdfFilename && o.documentAttachmentId) {
			try {
				const doc = await fetchWooOrderDocument(o.documentAttachmentId);
				if (doc) {
					await db.shopOrder.update({
						where: { id: saved.id },
						data: { pdfFilename: doc.filename, pdfBlob: doc.blob }
					});
				}
			} catch (e) {
				errors.push(`Поръчка #${o.orderNumber}: PDF не можа да се свали (${e instanceof Error ? e.message : e}).`);
			}
		}
	}

	return { count: orders.length, errors };
}

/** Links unresolved payout lines to shop orders by waybill number, then by the order number the courier carries. */
export async function linkPayoutLinesToOrders(companyId: string) {
	const lines = await db.courierPayoutLine.findMany({
		where: { kind: 'unresolved', payout: { companyId } },
		select: { id: true, waybillNumber: true, reference: true }
	});

	let linked = 0;
	for (const line of lines) {
		const order =
			(await db.shopOrder.findFirst({
				where: { companyId, waybillNumber: line.waybillNumber },
				select: { id: true }
			})) ??
			(line.reference
				? await db.shopOrder.findFirst({
						where: { companyId, orderNumber: line.reference },
						select: { id: true }
					})
				: null);
		if (!order) continue;
		await db.courierPayoutLine.update({
			where: { id: line.id },
			data: { kind: 'shop_order', shopOrderId: order.id }
		});
		linked++;
	}
	return linked;
}

const ECONT_BANK_TEXT = /НАЛОЖЕНИ ПЛАТЕЖИ (\d{2})\.(\d{2})\.(\d{4})/;

const payoutDescription = (p: { courier: Courier; payoutDate: Date }) =>
	`Наложени платежи ${COURIER_LABEL[p.courier]} ${p.payoutDate.toISOString().slice(0, 10)}`;

/**
 * Books every unbooked payout as a standalone income:
 * - Paid to the bank: paired with an unmatched bank credit row, only when the
 *   pair is unique in both directions.
 *   - Speedy: the bank text starts with the payout docId
 *     ("52164906329/cash on delivery…", older rows have no slash).
 *   - Econt: the bank text is "НАЛОЖЕНИ ПЛАТЕЖИ dd.mm.yyyy" with the payout date and the same amount.
 * - Paid in cash at the courier office: booked straight into the cashbox.
 * Returns how many payouts were booked.
 */
export async function matchPayoutsToStatementRows(companyId: string, userId: string) {
	const containers = await db.moneyContainer.findMany({ where: { companyId }, select: { id: true, containerType: true } });
	const bank = containers.find((c) => c.containerType === 'bank');
	const cashbox = containers.find((c) => c.containerType === 'cashbox');

	const payouts = await db.courierPayout.findMany({
		where: { companyId, standaloneIncomeId: null },
		select: { id: true, courier: true, externalRef: true, payoutDate: true, amountCents: true, paidInCash: true }
	});
	const rows = await db.bankStatementRow.findMany({
		where: {
			statement: { companyId },
			matchState: { in: ['unmatched', 'needs_review'] },
			amountCents: { gt: 0 }
		},
		select: { id: true, description: true, amountCents: true, transactionDate: true }
	});

	const econtDate = (description: string) => {
		const m = description.match(ECONT_BANK_TEXT);
		return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
	};
	const bankPayouts = payouts.filter((p) => !p.paidInCash);
	const candidatesFor = (p: (typeof payouts)[number]) =>
		rows.filter((r) =>
			p.courier === 'speedy'
				? new RegExp(`^${p.externalRef}(\\D|$)`).test(r.description.trim())
				: r.amountCents === p.amountCents &&
					econtDate(r.description) === p.payoutDate.toISOString().slice(0, 10)
		);

	let booked = 0;

	if (cashbox) {
		for (const p of payouts.filter((p) => p.paidInCash)) {
			await db.$transaction(async (tx) => {
				const income = await tx.standaloneIncome.create({
					data: {
						companyId,
						containerId: cashbox.id,
						description: payoutDescription(p),
						amountCents: p.amountCents,
						incomeDate: p.payoutDate,
						notes: 'Изплащане на наложени платежи в брой в офис на куриера',
						source: `cod:${p.courier}`,
						createdByUserId: userId
					}
				});
				await tx.ledgerEntry.create({
					data: {
						containerId: cashbox.id,
						entryType: 'standalone_income',
						amountCents: p.amountCents,
						entryDate: p.payoutDate,
						description: payoutDescription(p),
						standaloneIncomeId: income.id,
						createdByUserId: userId
					}
				});
				await tx.courierPayout.update({ where: { id: p.id }, data: { standaloneIncomeId: income.id } });
			});
			booked++;
		}
	}

	if (!bank) return booked;

	for (const p of bankPayouts) {
		const candidates = candidatesFor(p);
		if (candidates.length !== 1) continue;
		const row = candidates[0];
		const rivals = bankPayouts.filter((other) => other.id !== p.id && candidatesFor(other).some((r) => r.id === row.id));
		if (rivals.length > 0) continue;

		await db.$transaction(async (tx) => {
			const income = await tx.standaloneIncome.create({
				data: {
					companyId,
					containerId: bank.id,
					description: payoutDescription(p),
					amountCents: row.amountCents,
					incomeDate: row.transactionDate,
					notes: 'Изплащане на наложени платежи (авт. съвпадение)',
					source: `cod:${p.courier}`,
					createdByUserId: userId
				}
			});
			await tx.ledgerEntry.create({
				data: {
					containerId: bank.id,
					entryType: 'standalone_income',
					amountCents: row.amountCents,
					entryDate: row.transactionDate,
					description: row.description,
					standaloneIncomeId: income.id,
					createdByUserId: userId
				}
			});
			await tx.bankStatementRow.update({
				where: { id: row.id },
				data: { matchState: 'auto_matched', standaloneIncomeId: income.id }
			});
			await tx.courierPayout.update({
				where: { id: p.id },
				data: { statementRowId: row.id, standaloneIncomeId: income.id }
			});
		});
		rows.splice(rows.indexOf(row), 1);

		await logAuditEvent({
			actorUserId: userId,
			eventType: 'statement_row_matched_cod_payout',
			entityType: 'bank_statement_row',
			entityId: row.id,
			newValueJson: { courierPayoutId: p.id, courier: p.courier, externalRef: p.externalRef, amountCents: row.amountCents }
		});
		booked++;
	}
	return booked;
}

/**
 * Full COD sync for a date range: payouts, the orders they may belong to
 * (orders go back 45 days before `from`, since shipments are paid out after
 * delivery), linking, and bank matching.
 */
export async function syncCashOnDelivery(companyId: string, userId: string, from: string, to: string): Promise<SyncResult> {
	const payouts = await syncCourierPayouts(companyId, from, to);
	const ordersFrom = new Date(dateOnly(from).getTime() - 45 * 86400_000);
	const ordersTo = new Date(dateOnly(to).getTime() + 86400_000);
	const orders = await syncShopOrders(companyId, ordersFrom, ordersTo);
	const linked = await linkPayoutLinesToOrders(companyId);
	const matched = await matchPayoutsToStatementRows(companyId, userId);
	return {
		payouts: payouts.count,
		orders: orders.count,
		linked,
		matched,
		errors: [...payouts.errors, ...orders.errors]
	};
}
