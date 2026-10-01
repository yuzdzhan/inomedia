import { env } from '$env/dynamic/private';
import type { Courier } from '@prisma/client';

/**
 * Courier COD payout reports, normalized to one shape.
 *
 * Mirrors the payout calls of yuzdzhan/econt-js-sdk and yuzdzhan/speedy-js-sdk
 * with plain fetch, because those repos are private and the Dokploy build
 * cannot install them.
 */

export type NormalizedPayoutLine = {
	waybillNumber: string;
	amountCents: number;
	deliveryDate: string | null;
	recipient: string | null;
	reference: string | null;
};

export type NormalizedPayout = {
	courier: Courier;
	externalRef: string;
	/** YYYY-MM-DD, Europe/Sofia */
	payoutDate: string;
	amountCents: number;
	paidInCash: boolean;
	lines: NormalizedPayoutLine[];
	raw: unknown;
};

const toCents = (amount: number) => Math.round(amount * 100);

export function courierConfigured(courier: Courier): boolean {
	return courier === 'econt'
		? Boolean(env.ECONT_USERNAME && env.ECONT_PASSWORD)
		: Boolean(env.SPEEDY_USERNAME && env.SPEEDY_PASSWORD);
}

type EcontPaymentReportRow = {
	num?: number | string | null;
	type?: string | null;
	payType?: string | null;
	payDate?: string | null;
	amount?: number | null;
	currency?: string | null;
};

/**
 * Econt reports one row per shipment and has no payout id. Shipments paid out
 * together share the exact same `payDate` timestamp, so that timestamp is the
 * payout's identity.
 */
export async function fetchEcontPayouts(dateFrom: string, dateTo: string): Promise<NormalizedPayout[]> {
	const auth = Buffer.from(`${env.ECONT_USERNAME}:${env.ECONT_PASSWORD}`).toString('base64');
	const res = await fetch(
		'https://ee.econt.com/services/PaymentReport/PaymentReportService.PaymentReport.json',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
			body: JSON.stringify({ dateFrom, dateTo })
		}
	);
	const body = await res.json().catch(() => null);
	if (!res.ok) {
		throw new Error(`Еконт: HTTP ${res.status} ${body?.message ?? ''}`.trim());
	}

	// The live API wraps rows in { PaymentReportRows: [...] }; the published spec says a bare array.
	const rows: EcontPaymentReportRow[] = Array.isArray(body) ? body : (body?.PaymentReportRows ?? []);

	const byPayDate = new Map<string, EcontPaymentReportRow[]>();
	for (const row of rows) {
		if (!row.payDate || row.num == null || row.amount == null) continue;
		const group = byPayDate.get(row.payDate) ?? [];
		group.push(row);
		byPayDate.set(row.payDate, group);
	}

	return [...byPayDate.entries()].map(([payDate, group]) => ({
		courier: 'econt' as const,
		externalRef: payDate,
		payoutDate: payDate.slice(0, 10),
		amountCents: group.reduce((sum, r) => sum + toCents(r.amount!), 0),
		// "по банка" vs "в офис" (cash at the Econt office)
		paidInCash: group.every((r) => !/банка/i.test(r.payType ?? '')),
		lines: group.map((r) => ({
			waybillNumber: String(r.num),
			amountCents: toCents(r.amount!),
			deliveryDate: null,
			recipient: null,
			reference: null
		})),
		raw: group
	}));
}

type SpeedyPayout = {
	date?: string;
	docId?: number;
	paymentType?: 'CASH' | 'BANK';
	amount?: number;
	details?: Array<{
		shipmentId?: string;
		deliveryDate?: string;
		recipient?: string;
		ref1?: string;
		ref2?: string;
		amount?: number;
	}>;
};

export async function fetchSpeedyPayouts(dateFrom: string, dateTo: string): Promise<NormalizedPayout[]> {
	const res = await fetch('https://api.speedy.bg/v1/payments', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			userName: env.SPEEDY_USERNAME,
			password: env.SPEEDY_PASSWORD,
			language: 'BG',
			fromDate: Date.parse(`${dateFrom}T00:00:00+03:00`),
			toDate: Date.parse(`${dateTo}T23:59:59+03:00`),
			includeDetails: true
		})
	});
	const body = await res.json().catch(() => null);
	if (!res.ok || body?.error) {
		throw new Error(`Спиди: ${body?.error?.message ?? `HTTP ${res.status}`}`);
	}

	const payouts: SpeedyPayout[] = body?.payouts ?? [];
	return payouts
		.filter((p) => p.docId != null && p.date && p.amount != null)
		.map((p) => ({
			courier: 'speedy' as const,
			externalRef: String(p.docId),
			payoutDate: p.date!.slice(0, 10),
			amountCents: toCents(p.amount!),
			paidInCash: p.paymentType === 'CASH',
			lines: (p.details ?? [])
				.filter((d) => d.shipmentId && d.amount != null)
				.map((d) => ({
					waybillNumber: d.shipmentId!,
					amountCents: toCents(d.amount!),
					deliveryDate: d.deliveryDate?.slice(0, 10) ?? null,
					recipient: d.recipient ?? null,
					reference: d.ref1 || d.ref2 || null
				})),
			raw: p
		}));
}
