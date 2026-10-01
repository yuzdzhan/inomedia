import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { zipSync, strToU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { db } from './db';
import { renderHtmlToPdf } from './invoice-pdf';
import { reconcileCashRegister } from './cash-register';

/**
 * The monthly package for the accountant: every bank and cashbox movement of
 * the month with its document and explanation, as printable A4 PDFs.
 *
 *   00_Отчет_YYYY-MM.pdf            summary with explanations
 *   01_Документи_YYYY-MM.pdf        all documents in report order, A4, stamped D001…
 *   документи/<група>/D001_….pdf    the same documents one by one, A4
 */

const A4 = { width: 595.28, height: 841.89 };
const COURIER = { econt: 'Еконт', speedy: 'Спиди' } as const;

type DocGroup = 'приходи-фактури' | 'приходи-inobags' | 'приходи-други' | 'разходи' | 'заплати-осигуровки' | 'каса' | 'касов-апарат';

type Doc = {
	code: string;
	group: DocGroup;
	title: string;
	filename: string;
	contentType: string;
	blob: Uint8Array;
};

export function monthRange(month: string) {
	const [y, m] = month.split('-').map(Number);
	const from = new Date(Date.UTC(y, m - 1, 1));
	const to = new Date(Date.UTC(y, m, 0));
	return { from, to, toExclusive: new Date(Date.UTC(y, m, 1)) };
}

const fmtMoney = (cents: number) =>
	(cents / 100).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('.');
const esc = (s: string | null | undefined) =>
	(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PAYROLL_CATEGORIES = new Set(['ДОО', 'ЗО', 'ДЗПО', 'ЗДДФЛ', 'Заплати', 'Осигуровки']);

/** Everything the report and the readiness checklist need for one month. */
export async function loadMonth(companyId: string, month: string) {
	const { from, to, toExclusive } = monthRange(month);
	const inMonth = { gte: from, lt: toExclusive };

	const containers = await db.moneyContainer.findMany({ where: { companyId } });
	const bank = containers.find((c) => c.containerType === 'bank')!;
	const cashbox = containers.find((c) => c.containerType === 'cashbox')!;

	const balanceAt = async (containerId: string, opening: number, before: Date) =>
		opening +
		((await db.ledgerEntry.aggregate({ where: { containerId, entryDate: { lt: before } }, _sum: { amountCents: true } }))._sum
			.amountCents ?? 0);

	const attachmentSelect = { select: { id: true, originalFilename: true, contentType: true, blob: true } } as const;
	const orderSelect = {
		select: { id: true, orderNumber: true, customerName: true, totalCents: true, documentNumber: true, pdfBlob: true, rawJson: true }
	} as const;

	const bankRows = await db.bankStatementRow.findMany({
		where: { statement: { companyId }, transactionDate: inMonth },
		orderBy: [{ transactionDate: 'asc' }, { rowIndex: 'desc' }],
		select: {
			id: true,
			transactionDate: true,
			description: true,
			amountCents: true,
			matchState: true,
			reviewNote: true,
			invoicePayment: {
				select: {
					invoice: { select: { id: true, invoiceNumber: true, issueDate: true, issuedPdfBlob: true, client: { select: { legalName: true } } } }
				}
			},
			standaloneIncome: { select: { id: true, description: true, source: true, attachments: attachmentSelect } },
			expense: {
				select: { id: true, description: true, category: { select: { name: true } }, attachments: attachmentSelect }
			},
			courierPayout: {
				select: {
					courier: true,
					externalRef: true,
					lines: {
						orderBy: { waybillNumber: 'asc' },
						select: { waybillNumber: true, amountCents: true, kind: true, note: true, recipient: true, shopOrder: orderSelect }
					}
				}
			}
		}
	});

	const cashEntries = await db.ledgerEntry.findMany({
		where: { containerId: cashbox.id, entryDate: inMonth },
		orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
		select: {
			id: true,
			entryType: true,
			amountCents: true,
			entryDate: true,
			description: true,
			expense: { select: { description: true, category: { select: { name: true } }, attachments: attachmentSelect } },
			standaloneIncome: {
				select: {
					description: true,
					attachments: attachmentSelect,
					courierPayout: {
						select: {
							courier: true,
							lines: { select: { waybillNumber: true, amountCents: true, kind: true, note: true, recipient: true, shopOrder: orderSelect } }
						}
					}
				}
			}
		}
	});

	const issuedInvoices = await db.invoice.findMany({
		where: { client: { companyId }, issueDate: inMonth, status: { notIn: ['draft'] } },
		orderBy: { invoiceNumber: 'asc' },
		select: { id: true, invoiceNumber: true, issueDate: true, status: true, grossTotalCents: true, issuedPdfBlob: true, client: { select: { legalName: true } } }
	});

	const registerReports = await db.cashRegisterReport.findMany({
		where: { companyId, periodFrom: inMonth },
		orderBy: { periodFrom: 'asc' }
	});
	const registers = await Promise.all(
		registerReports.map(async (r) => ({ report: r, rec: await reconcileCashRegister(companyId, r.periodFrom, r.periodTo, r.cashSalesCents) }))
	);

	return {
		month,
		from,
		to,
		bank: {
			opening: await balanceAt(bank.id, bank.openingBalanceCents, from),
			closing: await balanceAt(bank.id, bank.openingBalanceCents, toExclusive)
		},
		cash: {
			opening: await balanceAt(cashbox.id, cashbox.openingBalanceCents, from),
			closing: await balanceAt(cashbox.id, cashbox.openingBalanceCents, toExclusive)
		},
		bankRows,
		cashEntries,
		issuedInvoices,
		registers
	};
}

type MonthData = Awaited<ReturnType<typeof loadMonth>>;
type Line = NonNullable<MonthData['bankRows'][number]['courierPayout']>['lines'][number];

/** Problems that keep the month from being complete. */
export function checklist(data: MonthData) {
	const unmatchedRows = data.bankRows.filter((r) => r.matchState === 'unmatched' || r.matchState === 'needs_review');
	const lines = [
		...data.bankRows.flatMap((r) => r.courierPayout?.lines ?? []),
		...data.cashEntries.flatMap((e) => e.standaloneIncome?.courierPayout?.lines ?? [])
	];
	const unresolvedLines = lines.filter((l) => l.kind === 'unresolved');
	const ordersWithoutPdf = lines.filter((l) => l.kind === 'shop_order' && !l.shopOrder?.pdfBlob);
	const registerDiffs = data.registers.filter((r) => r.report.totalTurnoverCents !== r.rec.expectedCents);
	return {
		unmatchedRows: unmatchedRows.length,
		unresolvedLines: unresolvedLines.length,
		ordersWithoutPdf: ordersWithoutPdf.length,
		missingRegisterReport: data.registers.length === 0,
		registerDiffs: registerDiffs.length,
		ready: unmatchedRows.length === 0 && unresolvedLines.length === 0 && data.registers.length > 0 && registerDiffs.length === 0
	};
}

/** Goods value of a shop order (the customer pays shipping to the courier). */
function goodsCents(order: { totalCents: number; rawJson: unknown }) {
	const raw = order.rawJson as { shipping_total?: string; shipping_tax?: string };
	return order.totalCents - Math.round((parseFloat(raw.shipping_total ?? '0') + parseFloat(raw.shipping_tax ?? '0')) * 100);
}

export async function buildMonthlyPackage(companyId: string, month: string) {
	const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { legalName: true } });
	const data = await loadMonth(companyId, month);
	const docs: Doc[] = [];
	const seen = new Map<string, string>();

	const addDoc = (key: string, group: DocGroup, title: string, filename: string, contentType: string, blob: Uint8Array | null) => {
		if (!blob) return null;
		// The same file is often attached to several rows (e.g. the monthly НАП dues to all seven payments).
		const hash = `sha:${createHash('sha256').update(blob).digest('hex')}`;
		const existing = seen.get(key) ?? seen.get(hash);
		if (existing) return existing;
		const code = `D${String(docs.length + 1).padStart(3, '0')}`;
		docs.push({ code, group, title, filename, contentType, blob });
		seen.set(key, code);
		seen.set(hash, code);
		return code;
	};
	const addAttachments = (group: DocGroup, title: string, atts: Array<{ id: string; originalFilename: string; contentType: string; blob: Uint8Array }>) =>
		atts.map((a) => addDoc(`att:${a.id}`, group, title, a.originalFilename, a.contentType, a.blob)).filter(Boolean) as string[];
	const addOrder = (o: NonNullable<Line['shopOrder']>) =>
		addDoc(`order:${o.id}`, 'приходи-inobags', `Поръчка inobags.com #${o.orderNumber}`, `inobags-${o.orderNumber}.pdf`, 'application/pdf', o.pdfBlob);

	const notes: string[] = [];
	const shippingWithoutReceipt: Array<{ order: string; cents: number }> = [];

	const lineRows = (lines: Line[]) =>
		lines
			.map((l) => {
				let doc = '';
				let text: string;
				if (l.kind === 'shop_order' && l.shopOrder) {
					doc = addOrder(l.shopOrder) ?? '';
					const goods = goodsCents(l.shopOrder);
					text = `Поръчка #${esc(l.shopOrder.orderNumber)} – ${esc(l.shopOrder.customerName)}${l.shopOrder.documentNumber ? `, документ ${esc(l.shopOrder.documentNumber)}` : ''}`;
					if (l.amountCents > goods) {
						shippingWithoutReceipt.push({ order: l.shopOrder.orderNumber, cents: l.amountCents - goods });
						text += ` <span class="warn">(включва доставка ${fmtMoney(l.amountCents - goods)} без касова бележка)</span>`;
					}
				} else if (l.kind === 'other') {
					text = esc(l.note ?? 'Друг приход');
				} else {
					text = '<span class="warn">Неразпозната пратка</span>';
				}
				return `<tr class="sub"><td></td><td colspan="2">↳ товарителница ${esc(l.waybillNumber)}</td><td class="num">${fmtMoney(l.amountCents)}</td><td>${doc}</td><td>${text}</td></tr>`;
			})
			.join('');

	// 1. Bank
	const bankHtml = data.bankRows
		.map((r, i) => {
			let codes: string[] = [];
			let explanation = '';
			let sub = '';
			if (r.invoicePayment) {
				const inv = r.invoicePayment.invoice;
				const code = addDoc(`inv:${inv.id}`, 'приходи-фактури', `Фактура №${inv.invoiceNumber}`, `Фактура-${inv.invoiceNumber}.pdf`, 'application/pdf', inv.issuedPdfBlob);
				if (code) codes = [code];
				explanation = `Плащане по фактура №${esc(inv.invoiceNumber)} – ${esc(inv.client.legalName)}`;
			} else if (r.courierPayout) {
				const p = r.courierPayout;
				explanation = `Изплатени наложени платежи ${COURIER[p.courier]}${p.courier === 'speedy' ? `, документ ${esc(p.externalRef)}` : ''} – ${p.lines.length} пратки`;
				if (p.lines.length === 0) explanation += ' <span class="warn">(куриерът не е предоставил списък с пратките)</span>';
				sub = lineRows(p.lines);
			} else if (r.standaloneIncome) {
				const inc = r.standaloneIncome;
				const group: DocGroup = inc.source === 'invoice-external' ? 'приходи-фактури' : 'приходи-други';
				codes = addAttachments(group, inc.description, inc.attachments);
				explanation = esc(inc.description);
			} else if (r.expense) {
				const e = r.expense;
				const group: DocGroup = PAYROLL_CATEGORIES.has(e.category.name) ? 'заплати-осигуровки' : 'разходи';
				codes = addAttachments(group, e.description, e.attachments);
				explanation = `${esc(e.category.name)}: ${esc(e.description)}`;
				if (r.reviewNote && r.reviewNote !== e.description) explanation += `<div class="note">${esc(r.reviewNote)}</div>`;
			} else if (r.reviewNote) {
				explanation = esc(r.reviewNote.replace(/\s*\(трансфер [^)]*\)$/, ''));
			} else {
				explanation = '<span class="warn">Няма обяснение</span>';
				notes.push(`Банков ред от ${fmtDate(r.transactionDate)} за ${fmtMoney(r.amountCents)} € няма документ и обяснение.`);
			}
			if (codes.length === 0 && !r.courierPayout && (r.expense || r.standaloneIncome) && !/документ:|без фактура|счетоводителя/i.test(explanation)) {
				explanation += ' <span class="warn">(няма прикачен документ)</span>';
			}
			return `<tr><td>${i + 1}</td><td>${fmtDate(r.transactionDate)}</td><td class="desc">${esc(r.description)}</td><td class="num ${r.amountCents < 0 ? 'neg' : ''}">${fmtMoney(r.amountCents)}</td><td>${codes.join('<br>')}</td><td>${explanation}</td></tr>${sub}`;
		})
		.join('');

	// 2. Cashbox
	const cashHtml = data.cashEntries
		.map((e, i) => {
			let codes: string[] = [];
			let explanation = esc(e.description);
			let sub = '';
			if (e.expense) {
				const group: DocGroup = PAYROLL_CATEGORIES.has(e.expense.category.name) ? 'заплати-осигуровки' : 'каса';
				codes = addAttachments(group, e.expense.description, e.expense.attachments);
				explanation = `${esc(e.expense.category.name)}: ${esc(e.expense.description)}`;
			} else if (e.standaloneIncome) {
				codes = addAttachments('каса', e.standaloneIncome.description, e.standaloneIncome.attachments);
				explanation = esc(e.standaloneIncome.description);
				if (e.standaloneIncome.courierPayout) sub = lineRows(e.standaloneIncome.courierPayout.lines);
			} else if (e.entryType === 'transfer_in') {
				explanation = 'Теглене от банкомат – пари от банковата сметка';
			}
			return `<tr><td>${i + 1}</td><td>${fmtDate(e.entryDate)}</td><td class="desc">${explanation}</td><td class="num ${e.amountCents < 0 ? 'neg' : ''}">${fmtMoney(e.amountCents)}</td><td>${codes.join('<br>')}</td></tr>${sub}`;
		})
		.join('');

	// 3. Invoices issued this month
	const invoicesHtml = data.issuedInvoices
		.map((inv) => {
			const code = addDoc(`inv:${inv.id}`, 'приходи-фактури', `Фактура №${inv.invoiceNumber}`, `Фактура-${inv.invoiceNumber}.pdf`, 'application/pdf', inv.issuedPdfBlob);
			const status = { issued: 'неплатена', partially_paid: 'частично платена', paid: 'платена', overdue: 'просрочена', voided: 'анулирана', draft: 'чернова' }[inv.status];
			return `<tr><td>№${esc(inv.invoiceNumber)}</td><td>${inv.issueDate ? fmtDate(inv.issueDate) : ''}</td><td class="desc">${esc(inv.client.legalName)}</td><td class="num">${fmtMoney(inv.grossTotalCents)}</td><td>${code ?? ''}</td><td>${status}</td></tr>`;
		})
		.join('');

	// 4. Cash register
	const registerHtml = data.registers
		.map(({ report: r, rec }) => {
			const code =
				r.attachmentBlob && r.attachmentType
					? addDoc(`reg:${r.id}`, 'касов-апарат', `Отчет на ФП №${r.documentNumber}`, r.attachmentFilename ?? `otchet-${r.documentNumber}`, r.attachmentType, r.attachmentBlob)
					: null;
			const diff = r.totalTurnoverCents - rec.expectedCents;
			if (diff !== 0) notes.push(`Касовият апарат се разминава с продажбите с ${fmtMoney(diff)} €.`);
			return `
			<p>Съкратен отчет на ФП №${esc(r.documentNumber)} от ${fmtDate(r.reportDate)} за ${fmtDate(r.periodFrom)} – ${fmtDate(r.periodTo)}, ФУ ${esc(r.deviceNumber)}, ФП ${esc(r.fiscalMemoryNumber)}${r.firstZReport != null ? `, блокове ${r.firstZReport}–${r.lastZReport}` : ''}${code ? ` · ${code}` : ''}</p>
			<table>
				<tr><td>Оборот А / Б / В / Г</td><td class="num">${fmtMoney(r.turnoverACents)} / ${fmtMoney(r.turnoverBCents)} / ${fmtMoney(r.turnoverVCents)} / ${fmtMoney(r.turnoverGCents)}</td></tr>
				<tr><td><b>Общ оборот</b> (ДДС ${fmtMoney(r.totalVatCents)}, сторно ${fmtMoney(r.stornoTurnoverCents)})</td><td class="num"><b>${fmtMoney(r.totalTurnoverCents)}</b></td></tr>
				<tr><td>Поръчки inobags.com с бележка през периода, без доставка (${rec.shopOrdersCount})</td><td class="num">${fmtMoney(rec.shopOrdersCents)}</td></tr>
				<tr><td>Ръчна изработка с наложен платеж (${rec.handmadeCodCount})</td><td class="num">${fmtMoney(rec.handmadeCodCents)}</td></tr>
				<tr><td>Ръчна изработка, продадена в брой</td><td class="num">${fmtMoney(rec.cashSalesCents)}</td></tr>
				<tr><td><b>Разлика</b></td><td class="num ${diff ? 'neg' : ''}"><b>${fmtMoney(diff)}</b></td></tr>
			</table>
			<p class="small">Поръчки в сверката: ${rec.orders.map((o) => `#${esc(o.orderNumber)} (${fmtDate(o.receiptDate)}, ${fmtMoney(o.goodsCents)})`).join(', ')}</p>`;
		})
		.join('');
	if (data.registers.length === 0) notes.push('Няма въведен месечен отчет от касовия апарат.');

	if (shippingWithoutReceipt.length) {
		const total = shippingWithoutReceipt.reduce((s, x) => s + x.cents, 0);
		notes.push(
			`Наложени платежи, включващи доставка, за която не е издадена касова бележка (бележката е само за стоката): ${shippingWithoutReceipt
				.map((x) => `#${esc(x.order)} – ${fmtMoney(x.cents)}`)
				.join(', ')}. Общо ${fmtMoney(total)} €.`
		);
	}
	if (data.bankRows.some((r) => r.expense?.description.includes('чл. 117'))) {
		notes.push('Фактурите от Meta Platforms Ireland са с обратно начисляване на ДДС – нужен е протокол по чл. 117 ЗДДС.');
	}

	const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
	const credits = sum(data.bankRows.filter((r) => r.amountCents > 0).map((r) => r.amountCents));
	const debits = sum(data.bankRows.filter((r) => r.amountCents < 0).map((r) => r.amountCents));
	const [y, m] = month.split('-');

	const docIndex = docs
		.map((d) => `<tr><td>${d.code}</td><td>${esc(d.group)}</td><td class="desc">${esc(d.title)}</td><td class="desc">${esc(d.filename)}</td></tr>`)
		.join('');

	const html = `<!doctype html><html lang="bg"><head><meta charset="utf-8"><style>
		body { font-family: 'DejaVu Sans', Arial, sans-serif; font-size: 9px; color: #111; }
		h1 { font-size: 16px; margin: 0 0 2px; } h2 { font-size: 12px; margin: 16px 0 6px; border-bottom: 1px solid #999; padding-bottom: 2px; }
		.small { font-size: 8px; color: #444; } table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
		th, td { border-bottom: 1px solid #ddd; padding: 3px 4px; vertical-align: top; text-align: left; }
		th { background: #f0f0f0; font-weight: bold; } .num { text-align: right; white-space: nowrap; }
		.neg { color: #a00; } .desc { word-break: break-word; } tr.sub td { color: #333; font-size: 8px; border-bottom: 1px dotted #eee; }
		.warn { color: #a00; } .note { color: #555; font-size: 8px; } .sum td { font-weight: bold; }
		tr { page-break-inside: avoid; } ul { margin: 4px 0; padding-left: 16px; }
	</style></head><body>
		<h1>${esc(company.legalName)} – отчет за ${m}.${y}</h1>
		<div class="small">Период ${fmtDate(data.from)} – ${fmtDate(data.to)} · генериран ${fmtDate(new Date())} · документите са в „01_Документи_${month}.pdf“ с номерата D001… в горния десен ъгъл</div>

		<h2>Обобщение</h2>
		<table>
			<tr><th></th><th class="num">Начало</th><th class="num">Постъпления</th><th class="num">Плащания</th><th class="num">Край</th></tr>
			<tr><td>Банка</td><td class="num">${fmtMoney(data.bank.opening)}</td><td class="num">${fmtMoney(credits)}</td><td class="num">${fmtMoney(debits)}</td><td class="num">${fmtMoney(data.bank.closing)}</td></tr>
			<tr><td>Каса</td><td class="num">${fmtMoney(data.cash.opening)}</td><td class="num">${fmtMoney(sum(data.cashEntries.filter((e) => e.amountCents > 0).map((e) => e.amountCents)))}</td><td class="num">${fmtMoney(sum(data.cashEntries.filter((e) => e.amountCents < 0).map((e) => e.amountCents)))}</td><td class="num">${fmtMoney(data.cash.closing)}</td></tr>
		</table>

		<h2>1. Банкова сметка – ${data.bankRows.length} движения</h2>
		<table><tr><th>№</th><th>Дата</th><th>Основание (банка)</th><th class="num">Сума €</th><th>Док.</th><th>Обяснение</th></tr>${bankHtml}</table>

		<h2>2. Каса – ${data.cashEntries.length} движения</h2>
		${cashHtml ? `<table><tr><th>№</th><th>Дата</th><th>Обяснение</th><th class="num">Сума €</th><th>Док.</th></tr>${cashHtml}</table>` : '<p>Няма движения.</p>'}

		<h2>3. Издадени фактури през месеца</h2>
		${invoicesHtml ? `<table><tr><th>Фактура</th><th>Дата</th><th>Клиент</th><th class="num">Сума €</th><th>Док.</th><th>Статус</th></tr>${invoicesHtml}</table>` : '<p>Няма издадени фактури.</p>'}

		<h2>4. Касов апарат</h2>
		${registerHtml || '<p>Няма въведен отчет.</p>'}

		<h2>5. Бележки за счетоводителя</h2>
		${notes.length ? `<ul>${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : '<p>Няма.</p>'}

		<h2>6. Опис на документите</h2>
		<table><tr><th>№</th><th>Група</th><th>Документ</th><th>Файл</th></tr>${docIndex}</table>
	</body></html>`;

	const summaryPdf = await renderHtmlToPdf(html);

	// Normalise every document to stamped A4.
	const merged = await PDFDocument.create();
	const files: Record<string, Uint8Array> = {
		[`00_Отчет_${month}.pdf`]: summaryPdf
	};
	const skipped: string[] = [];
	for (const doc of docs) {
		const single = await PDFDocument.create();
		const font = await single.embedFont(StandardFonts.HelveticaBold);
		try {
			await appendAsA4(single, doc, font, month);
		} catch {
			skipped.push(`${doc.code} ${doc.filename}`);
			continue;
		}
		const bytes = await single.save();
		files[`документи/${doc.group}/${doc.code}_${doc.filename.replace(/\.[^.]+$/, '')}.pdf`] = bytes;
		const loaded = await PDFDocument.load(bytes);
		for (const page of await merged.copyPages(loaded, loaded.getPageIndices())) merged.addPage(page);
	}
	if (docs.length) files[`01_Документи_${month}.pdf`] = await merged.save();
	if (skipped.length) {
		files['ПРОПУСНАТИ_ФАЙЛОВЕ.txt'] = strToU8(`Тези файлове не можаха да се превърнат в PDF и са пропуснати:\n${skipped.join('\n')}\n`);
	}

	return { filename: `Отчет_${month}.zip`, zip: zipSync(files, { level: 6 }), documents: docs.length };
}

/** Appends one document to `out` as A4 portrait pages, scaled to fit and stamped with its code. */
async function appendAsA4(out: PDFDocument, doc: Doc, font: Awaited<ReturnType<PDFDocument['embedFont']>>, month: string) {
	const margin = 24;
	const stampHeight = 14;
	const box = { width: A4.width - 2 * margin, height: A4.height - 2 * margin - stampHeight };
	const pages: Array<{ draw: (page: ReturnType<PDFDocument['addPage']>, x: number, y: number, scale: number) => void; width: number; height: number }> = [];

	if (doc.contentType === 'application/pdf' || doc.filename.toLowerCase().endsWith('.pdf')) {
		const src = await PDFDocument.load(doc.blob, { ignoreEncryption: true });
		const embedded = await out.embedPages(src.getPages());
		for (const e of embedded) {
			pages.push({ width: e.width, height: e.height, draw: (p, x, y, s) => p.drawPage(e, { x, y, xScale: s, yScale: s }) });
		}
	} else if (/png/i.test(doc.contentType)) {
		const img = await out.embedPng(doc.blob);
		pages.push({ width: img.width, height: img.height, draw: (p, x, y, s) => p.drawImage(img, { x, y, width: img.width * s, height: img.height * s }) });
	} else if (/jpe?g/i.test(doc.contentType)) {
		const img = await out.embedJpg(doc.blob);
		pages.push({ width: img.width, height: img.height, draw: (p, x, y, s) => p.drawImage(img, { x, y, width: img.width * s, height: img.height * s }) });
	} else {
		throw new Error(`unsupported ${doc.contentType}`);
	}

	pages.forEach((src, i) => {
		const page = out.addPage([A4.width, A4.height]);
		const scale = Math.min(box.width / src.width, box.height / src.height, 1.5);
		const w = src.width * scale;
		const h = src.height * scale;
		src.draw(page, margin + (box.width - w) / 2, margin + (box.height - h), scale);
		const stamp = `${doc.code}  ${month}${pages.length > 1 ? `  (${i + 1}/${pages.length})` : ''}`;
		const size = 10;
		page.drawText(stamp, {
			x: A4.width - margin - font.widthOfTextAtSize(stamp, size),
			y: A4.height - margin - size + 2,
			size,
			font,
			color: rgb(0.7, 0, 0)
		});
	});
}
