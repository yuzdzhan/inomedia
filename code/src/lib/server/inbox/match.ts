import { createHash } from 'node:crypto';
import type { InboxDocument, Prisma } from '@prisma/client';
import { db } from '../db';
import type { PayrollDue } from './parse';

/**
 * Puts an inbox document where it belongs:
 * - invoice / credit note → the bank row it was paid with (by its number in the
 *   payment text, by USD amount for card payments in dollars, else by amount and
 *   date), attached to that row's expense or income; an unmatched row gets an
 *   expense in the supplier's usual category. Invoices marked paid in cash become
 *   a cashbox expense.
 * - НАП dues for month M → the contribution payments made in M+1.
 * - payroll sheets → the cash expense for that month's net pay.
 */

type Tx = Prisma.TransactionClient;

const SUPPLIER_CATEGORY: Record<string, string> = {
	Vivacom: 'Интернет',
	'Елконсулт Русе': 'Счетоводни услуги',
	Спиди: 'Спиди',
	Еконт: 'Куриерски услуги',
	JetHost: 'Софтуер',
	ClouDNS: 'Софтуер',
	'MREJA.NET (И-Тех)': 'Софтуер',
	'Brevo (SendinBlue)': 'Софтуер',
	Meta: 'Реклами'
};

/** Words that identify the supplier in the bank's payment text. */
const SUPPLIER_BANK_TEXT: Record<string, RegExp> = {
	Vivacom: /vivacom/i,
	JetHost: /jethost/i,
	ClouDNS: /cloud dns/i,
	'MREJA.NET (И-Тех)': /mreja/i,
	'Brevo (SendinBlue)': /sendinblue|brevo/i,
	Meta: /facebk|facebook|meta/i,
	Спиди: /спиди|speedy|ф-ра 800/i
};

const DUE_CATEGORY = (d: PayrollDue) =>
	/ЗДДФЛ/.test(d.label) ? 'ЗДДФЛ' : /Здравно/.test(d.label) ? 'ЗО' : /ДЗПО/.test(d.label) ? 'ДЗПО' : 'ДОО';

const sha = (blob: Uint8Array) => createHash('sha256').update(blob).digest('hex');
const day = 86400_000;

async function context(companyId: string) {
	const containers = await db.moneyContainer.findMany({ where: { companyId } });
	const admin = await db.user.findFirstOrThrow({ where: { role: 'admin' }, select: { id: true } });
	return {
		bank: containers.find((c) => c.containerType === 'bank')!,
		cashbox: containers.find((c) => c.containerType === 'cashbox')!,
		userId: admin.id
	};
}

async function categoryId(tx: Tx, companyId: string, name: string) {
	const existing = await tx.expenseCategory.findFirst({ where: { companyId, name } });
	return (existing ?? (await tx.expenseCategory.create({ data: { companyId, name } }))).id;
}

/** Category the supplier's earlier expenses used, else the default for that supplier. */
async function categoryFor(tx: Tx, companyId: string, supplier: string | null) {
	if (supplier) {
		const previous = await tx.expense.findFirst({
			where: { companyId, description: { startsWith: supplier.split(' ')[0] } },
			orderBy: { incurredDate: 'desc' },
			select: { categoryId: true }
		});
		if (previous) return previous.categoryId;
	}
	return categoryId(tx, companyId, (supplier && SUPPLIER_CATEGORY[supplier]) || 'Други');
}

function describe(doc: InboxDocument) {
	const kind = doc.kind === 'credit_note' ? 'КИ' : 'ф-ра';
	return [doc.supplier ?? 'Доставчик', doc.documentNumber ? `${kind} ${doc.documentNumber}` : null].filter(Boolean).join(', ');
}

/** Attaches the document's file to an expense unless an identical file is already there. */
async function attachToExpense(tx: Tx, expenseId: string, doc: InboxDocument) {
	const existing = await tx.expenseAttachment.findMany({ where: { expenseId }, select: { blob: true } });
	if (!existing.some((a) => sha(a.blob) === doc.sha256)) {
		await tx.expenseAttachment.create({
			data: { expenseId, originalFilename: doc.filename, contentType: doc.contentType, sizeBytes: doc.sizeBytes, blob: doc.blob }
		});
	}
}

async function attachToIncome(tx: Tx, standaloneIncomeId: string, doc: InboxDocument) {
	const existing = await tx.standaloneIncomeAttachment.findMany({ where: { standaloneIncomeId }, select: { blob: true } });
	if (!existing.some((a) => sha(a.blob) === doc.sha256)) {
		await tx.standaloneIncomeAttachment.create({
			data: { standaloneIncomeId, originalFilename: doc.filename, contentType: doc.contentType, sizeBytes: doc.sizeBytes, blob: doc.blob }
		});
	}
}

type Row = { id: string; transactionDate: Date; amountCents: number; description: string; matchState: string; expenseId: string | null; standaloneIncomeId: string | null };

/** Books an unmatched bank row as an expense carrying the document. */
async function createBankExpense(tx: Tx, companyId: string, ctx: Awaited<ReturnType<typeof context>>, row: Row, catId: string, description: string, doc: InboxDocument | null, note?: string) {
	const amount = -row.amountCents;
	const expense = await tx.expense.create({
		data: {
			companyId, categoryId: catId, description, amountCents: amount, incurredDate: row.transactionDate,
			status: 'paid', paidDate: row.transactionDate, paidByUserId: ctx.userId, paidContainerId: ctx.bank.id,
			createdByUserId: ctx.userId
		}
	});
	if (doc) await attachToExpense(tx, expense.id, doc);
	await tx.ledgerEntry.create({
		data: { containerId: ctx.bank.id, entryType: 'expense_payment', amountCents: row.amountCents, entryDate: row.transactionDate, description, expenseId: expense.id, createdByUserId: ctx.userId }
	});
	await tx.bankStatementRow.update({ where: { id: row.id }, data: { matchState: 'auto_matched', expenseId: expense.id, reviewNote: note ?? null } });
	return expense.id;
}

async function createCashExpense(tx: Tx, companyId: string, ctx: Awaited<ReturnType<typeof context>>, date: Date, amountCents: number, catId: string, description: string) {
	const expense = await tx.expense.create({
		data: {
			companyId, categoryId: catId, description, amountCents, incurredDate: date, status: 'paid', paidDate: date,
			paidByUserId: ctx.userId, paidContainerId: ctx.cashbox.id, createdByUserId: ctx.userId
		}
	});
	await tx.ledgerEntry.create({
		data: { containerId: ctx.cashbox.id, entryType: 'expense_payment', amountCents: -amountCents, entryDate: date, description: `Разход: ${description}`, expenseId: expense.id, createdByUserId: ctx.userId }
	});
	return expense.id;
}

const rowSelect = { id: true, transactionDate: true, amountCents: true, description: true, matchState: true, expenseId: true, standaloneIncomeId: true } as const;

/** The bank row an invoice or credit note was paid with, if it can be told apart. */
async function findBankRow(companyId: string, doc: InboxDocument): Promise<Row | null> {
	// 1. Its number in the payment text ("Ф-ра 8002372441 и 8002420879", "по ф/ра 0000006438").
	const digits = doc.documentNumber?.replace(/\D/g, '') ?? '';
	if (digits.length >= 6) {
		const rows = await db.bankStatementRow.findMany({
			where: { statement: { companyId }, description: { contains: digits } },
			select: rowSelect
		});
		if (rows.length === 1) return rows[0];
	}
	if (!doc.totalCents || !doc.documentDate) return null;

	const credit = doc.kind === 'credit_note';
	const from = new Date(doc.documentDate.getTime() - 5 * day);
	const to = new Date(doc.documentDate.getTime() + 45 * day);
	const candidates = await db.bankStatementRow.findMany({
		where: { statement: { companyId }, transactionDate: { gte: from, lte: to }, amountCents: credit ? { gt: 0 } : { lt: 0 } },
		select: {
			...rowSelect,
			expense: { select: { description: true, attachments: { select: { id: true } }, inboxDocuments: { select: { id: true } } } }
		}
	});

	// An expense that already names this document wins (e.g. one of several equal MREJA payments).
	if (doc.documentNumber) {
		const named = candidates.filter((r) => r.expense?.description.includes(doc.documentNumber!));
		if (named.length === 1) return named[0];
	}
	// Rows already carrying another inbox document are taken.
	const free = candidates.filter((r) => !r.expense?.inboxDocuments.some((d) => d.id !== doc.id));

	// 2. Card payments in dollars carry the USD amount: "ПОС 47.59 USD".
	let hits = free;
	if (doc.currency === 'USD') {
		const usd = (doc.totalCents / 100).toFixed(2);
		hits = free.filter((r) => r.description.includes(`${usd} USD`));
	} else {
		// 3. Same amount (2 cents for rounding), preferring the supplier's name in the text.
		hits = free.filter((r) => Math.abs(Math.abs(r.amountCents) - doc.totalCents!) <= 2);
		const named = doc.supplier && SUPPLIER_BANK_TEXT[doc.supplier];
		if (named && hits.some((r) => named.test(r.description))) hits = hits.filter((r) => named.test(r.description));
	}
	if (hits.length === 0) return null;
	// Prefer rows that still lack a document, then the nearest date.
	const ranked = hits
		.map((r) => ({ r, empty: !r.expense || r.expense.attachments.length === 0, gap: Math.abs(r.transactionDate.getTime() - doc.documentDate!.getTime()) }))
		.sort((a, b) => Number(b.empty) - Number(a.empty) || a.gap - b.gap);
	if (ranked.length > 1 && ranked[0].empty === ranked[1].empty && ranked[0].gap === ranked[1].gap && ranked[0].r.matchState === 'unmatched') {
		return null; // two equally good unbooked rows – leave it to a person
	}
	return ranked[0].r;
}

export type MatchOutcome = { status: 'matched' | 'cash_expense' | 'pending'; note: string; expenseId?: string | null };

export async function matchInvoice(companyId: string, doc: InboxDocument): Promise<MatchOutcome> {
	const ctx = await context(companyId);

	if (doc.paidInCash) {
		if (!doc.totalCents || !doc.documentDate) return { status: 'pending', note: 'Платена в брой, но сумата или датата не са разчетени.' };
		const existing = await db.expense.findFirst({
			where: {
				companyId,
				paidContainerId: ctx.cashbox.id,
				OR: [
					...(doc.documentNumber ? [{ description: { contains: doc.documentNumber } }] : []),
					{ amountCents: doc.totalCents, incurredDate: doc.documentDate }
				]
			},
			select: { id: true }
		});
		const expenseId = await db.$transaction(async (tx) => {
			if (existing) {
				await attachToExpense(tx, existing.id, doc);
				return existing.id;
			}
			const id = await createCashExpense(tx, companyId, ctx, doc.documentDate!, doc.totalCents!, await categoryFor(tx, companyId, doc.supplier), `${describe(doc)} (платена в брой)`);
			await attachToExpense(tx, id, doc);
			return id;
		});
		return { status: 'cash_expense', note: existing ? 'Прикачена към съществуващ разход в брой.' : 'Записана като разход от касата.', expenseId };
	}

	const row = await findBankRow(companyId, doc);
	if (!row) return { status: 'pending', note: 'Не е намерено плащане в банката.' };

	return db.$transaction(async (tx) => {
		if (row.expenseId) {
			await attachToExpense(tx, row.expenseId, doc);
			return { status: 'matched' as const, note: `Прикачена към плащане от ${row.transactionDate.toISOString().slice(0, 10)}.`, expenseId: row.expenseId };
		}
		if (row.standaloneIncomeId) {
			await attachToIncome(tx, row.standaloneIncomeId, doc);
			return { status: 'matched' as const, note: `Прикачена към постъпление от ${row.transactionDate.toISOString().slice(0, 10)}.`, expenseId: null };
		}
		if (row.amountCents < 0 && row.matchState === 'unmatched') {
			const id = await createBankExpense(tx, companyId, ctx, row, await categoryFor(tx, companyId, doc.supplier), describe(doc), doc);
			return { status: 'matched' as const, note: `Създаден разход за плащане от ${row.transactionDate.toISOString().slice(0, 10)}.`, expenseId: id };
		}
		return { status: 'pending' as const, note: 'Намереният банков ред е свързан с друго – проверете ръчно.', expenseId: null };
	});
}

/** НАП dues for month M → the contribution payments made in M+1, matched by amount. */
export async function matchPayrollDues(companyId: string, doc: InboxDocument, dues: PayrollDue[]): Promise<MatchOutcome> {
	if (!doc.period || dues.length === 0) return { status: 'pending', note: 'Не е разчетен периодът или сумите.' };
	const ctx = await context(companyId);
	const [y, m] = doc.period.split('-').map(Number);
	const from = new Date(Date.UTC(y, m, 1));
	const to = new Date(Date.UTC(y, m + 1, 1));
	const rows = await db.bankStatementRow.findMany({
		where: { statement: { companyId }, transactionDate: { gte: from, lt: to }, amountCents: { lt: 0 } },
		select: { ...rowSelect, expense: { select: { category: { select: { name: true } } } } }
	});

	let matched = 0;
	const used = new Set<string>();
	await db.$transaction(async (tx) => {
		for (const due of dues) {
			const category = DUE_CATEGORY(due);
			const row =
				rows.find((r) => !used.has(r.id) && -r.amountCents === due.cents && r.expense?.category.name === category) ??
				rows.find((r) => !used.has(r.id) && -r.amountCents === due.cents && r.matchState === 'unmatched');
			if (!row) continue;
			used.add(row.id);
			const who = due.employee ? 'трудов договор' : 'самоосигуряващо се лице';
			if (row.expenseId) {
				await attachToExpense(tx, row.expenseId, doc);
			} else {
				await createBankExpense(tx, companyId, ctx, row, await categoryId(tx, companyId, category), `${category} за ${String(m).padStart(2, '0')}.${y} – ${who}`, doc, 'Документ: справка „Дължими вноски към НАП“ и платежно нареждане');
			}
			matched++;
		}
	});
	if (matched === 0) return { status: 'pending', note: `Няма плащания към НАП през ${String(m % 12 + 1).padStart(2, '0')}.${m === 12 ? y + 1 : y} с тези суми.` };
	return { status: 'matched', note: `Прикачена към ${matched} от ${dues.length} плащания към НАП.` };
}

/** Payroll sheets of one month → the cash expense for net pay (created once). */
export async function matchPayrollSheets(companyId: string, period: string, netPayCents: number | null, docs: InboxDocument[]): Promise<MatchOutcome> {
	const ctx = await context(companyId);
	const [y, m] = period.split('-').map(Number);
	const label = `Нетна заплата ${String(m).padStart(2, '0')}.${y}`;
	const lastDay = new Date(Date.UTC(y, m, 0));
	const existing = await db.expense.findFirst({ where: { companyId, description: { startsWith: label } }, select: { id: true } });
	if (!existing && !netPayCents) return { status: 'matched', note: 'Ведомост без изплатена нетна сума.' };

	const expenseId = await db.$transaction(async (tx) => {
		const id = existing?.id ?? (await createCashExpense(tx, companyId, ctx, lastDay, netPayCents!, await categoryId(tx, companyId, 'Заплати'), `${label} (изплатена в брой)`));
		for (const d of docs) await attachToExpense(tx, id, d);
		return id;
	});
	return { status: 'cash_expense', note: existing ? `Прикачена към „${label}“.` : `Записана „${label}“ ${(netPayCents! / 100).toFixed(2)} € от касата.`, expenseId };
}
