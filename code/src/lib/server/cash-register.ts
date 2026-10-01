import { db } from './db';

/** WooCommerce statuses that never produce a receipt. */
const NON_SALE_STATUSES = ['cancelled', 'failed', 'refunded', 'pending', 'checkout-draft', 'trash'];

/**
 * What the register's turnover should be made of, for one period.
 * A receipt is issued for the goods only (the customer pays shipping to the
 * courier) when the order is marked completed, so shop orders count by their
 * completion date and without shipping.
 */
export async function reconcileCashRegister(companyId: string, from: Date, to: Date, cashSalesCents: number) {
	const toExclusive = new Date(to.getTime() + 86400_000);
	// Completion happens after creation; look back far enough to catch late completions.
	const candidates = await db.shopOrder.findMany({
		where: {
			companyId,
			orderDate: { gte: new Date(from.getTime() - 60 * 86400_000), lt: toExclusive },
			status: { notIn: NON_SALE_STATUSES }
		},
		select: { orderNumber: true, totalCents: true, rawJson: true, receiptDate: true }
	});
	const orders: Array<{ orderNumber: string; receiptDate: Date; goodsCents: number; receiptDateSet: boolean }> = [];
	for (const o of candidates) {
		const raw = o.rawJson as { date_completed?: string | null; shipping_total?: string; shipping_tax?: string };
		const receiptDate =
			o.receiptDate ?? (raw.date_completed ? new Date(`${raw.date_completed.slice(0, 10)}T00:00:00Z`) : null);
		if (!receiptDate || receiptDate < from || receiptDate >= toExclusive) continue;
		const shipping = Math.round((parseFloat(raw.shipping_total ?? '0') + parseFloat(raw.shipping_tax ?? '0')) * 100);
		orders.push({ orderNumber: o.orderNumber, receiptDate, goodsCents: o.totalCents - shipping, receiptDateSet: Boolean(o.receiptDate) });
	}
	orders.sort((a, b) => a.receiptDate.getTime() - b.receiptDate.getTime());
	const shopOrdersCents = orders.reduce((sum, o) => sum + o.goodsCents, 0);
	const shopOrdersCount = orders.length;
	const handmadeCod = await db.courierPayoutLine.aggregate({
		where: { kind: 'other', payout: { companyId, payoutDate: { gte: from, lte: to } } },
		_sum: { amountCents: true },
		_count: true
	});
	const expected = shopOrdersCents + (handmadeCod._sum.amountCents ?? 0) + cashSalesCents;
	return {
		shopOrdersCents,
		shopOrdersCount,
		handmadeCodCents: handmadeCod._sum.amountCents ?? 0,
		handmadeCodCount: handmadeCod._count,
		cashSalesCents,
		expectedCents: expected,
		orders
	};
}
