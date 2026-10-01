/**
 * Reads the facts the books need out of an incoming document's text:
 * supplier, number, date, total and currency for invoices; period, dues and
 * net pay for the accountant's payroll e-mails.
 *
 * Self-contained (no app imports) so it can be exercised against sample PDFs.
 */

export type DocumentKind = 'invoice' | 'credit_note' | 'payroll_dues' | 'payroll_sheet' | 'unknown';

export type PayrollDue = { label: string; employee: boolean; cents: number };

export type ParsedDocument = {
	kind: DocumentKind;
	supplier: string | null;
	supplierId: string | null;
	documentNumber: string | null;
	/** YYYY-MM-DD */
	documentDate: string | null;
	totalCents: number | null;
	currency: 'EUR' | 'USD' | null;
	paidInCash: boolean;
	/** YYYY-MM, payroll documents only */
	period: string | null;
	payrollDues: PayrollDue[];
	/** Net pay handed out in cash, from the payslip */
	netPayCents: number | null;
};

/** Our own identifiers – never the supplier. */
const OWN_IDS = ['207462997', 'BG207462997'];

/** Known suppliers by ЕИК / VAT number. */
const SUPPLIERS: Array<{ id: string; name: string }> = [
	{ id: '831642181', name: 'Vivacom' },
	{ id: '201107288', name: 'Елконсулт Русе' },
	{ id: '131371780', name: 'Спиди' },
	{ id: '207839658', name: 'Еконт' },
	{ id: '207538384', name: 'JetHost' },
	{ id: '202743734', name: 'ClouDNS' },
	{ id: '131174110', name: 'MREJA.NET (И-Тех)' },
	{ id: 'FR80498019298', name: 'Brevo (SendinBlue)' },
	{ id: 'IE9692928F', name: 'Meta' }
];

const MONTHS_EN: Record<string, string> = {
	jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
	jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

const toCents = (s: string) => Math.round(parseFloat(s.replace(/\s/g, '').replace(',', '.')) * 100);

function isoDate(d: string, m: string, y: string) {
	return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function findDate(text: string): string | null {
	const labelled =
		text.match(/(?:Дата на (?:издаване|Фактура|фактура)|Дата|Date)\s*[:/]?\s*(?:Дата\s*:)?\s*(\d{1,2})[./](\d{1,2})[./](\d{4})/) ??
		text.match(/№[^\n]*?\/\s*(\d{2})\.(\d{2})\.(\d{4})/);
	if (labelled) return isoDate(labelled[1], labelled[2], labelled[3]);
	const en = text.match(/(?:Invoice Date|Invoice\/Payment Date)\s+(?:—\s*)?([A-Z][a-z]{2})[a-z]*\s+(\d{1,2}),\s+(\d{4})/);
	if (en) return isoDate(en[2], MONTHS_EN[en[1].toLowerCase()], en[3]);
	const any = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
	return any ? isoDate(any[1], any[2], any[3]) : null;
}

function findNumber(text: string): string | null {
	const patterns = [
		/КРЕДИТНО ИЗВЕСТИЕ\s*№\s*:?\s*(\d{6,})/,
		/Кредитно известие\s*N\s*:?\s*(\d{6,})/,
		/ФАКТУРА\s*№\s*:?\s*(\d{6,})/i,
		/Номер на фактура\s*№?\s*(\d{6,})/,
		/Invoice\s*#\s*(?:—\s*)?(FBADS-[\d-]+|SIB-\d+)/,
		/Number \/ Номер\s*#\s*(\d+)/,
		/№\s*:\s*(\d{6,})/,
		/Номер:\s*(\d{6,})/,
		/No\.\s*(\d{8,})\s*\//,
		/_IID:(\d{8,})/
	];
	for (const p of patterns) {
		const m = text.match(p);
		if (m) return m[1];
	}
	return null;
}

function findTotal(text: string): { cents: number; currency: 'EUR' | 'USD' } | null {
	// Meta receipts are in USD: the first "$x.xx" next to the payment method.
	const usd = text.match(/Paid\s+[\s\S]{0,80}?\$\s?([\d,]+\.\d{2})/) ?? text.match(/^\s*\$([\d,]+\.\d{2})\s*$/m);
	if (/Meta Platforms Ireland/.test(text) && usd) return { cents: toCents(usd[1].replace(/,/g, '')), currency: 'USD' };
	// ClouDNS bills in USD and the card statement shows the USD amount.
	const cloudns = text.match(/([\d.]+)\s*EUR\s+([\d.]+)\s*USD\s*\n\s*Total:/);
	if (cloudns) return { cents: toCents(cloudns[2]), currency: 'USD' };

	const eurPatterns = [
		/Обща сума за плащане\s+([\d\s]+[.,]\d{2})\s*€/,
		/Обща стойност\s+([\d.,]+)\s*€/,
		/Сума по кредита\s+([\d.,]+)\s*€/,
		/ДДС 20%\s*\n\s*EUR BGN\s*\n\s*([\d.]+)\s+[\d.]+/,
		/Сума за плащане(?:\s*\(1 € = [\d.]+ лв\s?\.\))?\s*:\s*([\d\s]+[.,]\d{2})\s*€/,
		/Сума за плащане:\s*[\d.]+\s*лв\.\s*([\d.]+)\s*€/,
		/Общо с ДДС:?\s*([\d\s]+[.,]\d{2})\s*€/,
		/Обща сума\s+([\d\s]+[.,]\d{2})\s*€/,
		/Invoice Amount\s*(?:—\s*)?€([\d.,]+)/,
		/Total:\s*([\d.,]+)\s*EUR/,
		/Общо\s*€\s*(-?[\d.,]+)/,
		/СУМА ЗА ПЛАЩАНЕ\s*([\d\s]+[.,]\d{2})/i,
		/ВСИЧКО\s*([\d\s]+[.,]\d{2})\s*€/i
	];
	for (const p of eurPatterns) {
		const m = text.match(p);
		if (m) return { cents: toCents(m[1]), currency: 'EUR' };
	}
	// MREJA.NET prints only the tax base and the VAT.
	const base = text.match(/Общо \(без данък\)\s+([\d.]+)/);
	const vat = text.match(/ДДС 20%\s+([\d.]+)\s*EUR/);
	if (base && vat) return { cents: toCents(base[1]) + toCents(vat[1]), currency: 'EUR' };
	const vatLv = text.match(/ДДС 20%\s+([\d.]+)\s*BGN/);
	if (base && vatLv) return { cents: toCents(base[1]) + Math.round(toCents(vatLv[1]) / 1.95583), currency: 'EUR' };
	// Speedy: "Сума за плащане: 0.64" in BGN-era invoices only states leva; the euro line follows.
	const lv = text.match(/Сума за плащане:\s*([\d.]+)\s*$/m);
	if (lv) return { cents: Math.round(toCents(lv[1]) / 1.95583), currency: 'EUR' };
	return null;
}

function findSupplier(text: string): { id: string; name: string } | null {
	for (const s of SUPPLIERS) if (text.includes(s.id)) return s;
	const ids = [...text.matchAll(/(?:ЕИК|ИН по ДДС|ДДС №|ДДС номер|БУЛСТАТ)[^\d]{0,20}(?:BG)?(\d{9,10})/g)].map((m) => m[1]);
	const other = ids.find((id) => !OWN_IDS.includes(id));
	return other ? { id: other, name: `ЕИК ${other}` } : null;
}

function parsePayroll(text: string, filename: string): Pick<ParsedDocument, 'kind' | 'period' | 'payrollDues' | 'netPayCents'> | null {
	const period = text.match(/(?:от|за)\s+(\d{2})\.(\d{4})\s*г?\.?/) ?? null;
	const monthNames: Record<string, string> = {
		януари: '01', февруари: '02', март: '03', април: '04', май: '05', юни: '06',
		юли: '07', август: '08', септември: '09', октомври: '10', ноември: '11', декември: '12'
	};
	const named = text.match(/за (?:месец )?(януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември) (\d{4})/i);
	const fromName = filename.match(/(\d{4})\.(\d{2})\.pdf$/i);
	const ym = period ? `${period[2]}-${period[1]}` : named ? `${named[2]}-${monthNames[named[1].toLowerCase()]}` : fromName ? `${fromName[1]}-${fromName[2]}` : null;

	if (/Дължими вноски към НАП/.test(text)) {
		const dues: PayrollDue[] = [];
		for (const m of text.matchAll(/^\s*(Осиг\. вноски[^\n]*?|Здравноосигурителни вноски[^\n]*?|Данък по ЗДДФЛ)\s+BG\w+\s+([\d.]+)\s*$/gm)) {
			const label = m[1].trim();
			const cents = toCents(m[2]);
			if (cents > 0) dues.push({ label, employee: !/самоосигуряващи/.test(label), cents });
		}
		return { kind: 'payroll_dues', period: ym, payrollDues: dues, netPayCents: null };
	}
	if (/Фиш за заплат|Разчетно - платежна ведомост|Ведомост за самоосигуряващо|ОТЧЕТНА ФОРМА/.test(text) || /Форма[_ ]76|РПВ[_ ]|Фиш[_ ]за[_ ]заплата/i.test(filename)) {
		let net: number | null = null;
		if (/Фиш за заплат/.test(text)) {
			const amounts = [...text.matchAll(/Сума за получаване:\s*([\d.]+)\s*€/g)].map((m) => toCents(m[1])).filter((c) => c > 0);
			net = amounts.length ? amounts.reduce((a, b) => a + b, 0) : 0;
		}
		return { kind: 'payroll_sheet', period: ym, payrollDues: [], netPayCents: net };
	}
	return null;
}

export function parseDocumentText(text: string, filename = ''): ParsedDocument {
	const payroll = parsePayroll(text, filename);
	if (payroll) {
		return {
			...payroll,
			supplier: null,
			supplierId: null,
			documentNumber: null,
			documentDate: null,
			totalCents: payroll.payrollDues.reduce((s, d) => s + d.cents, 0) || null,
			currency: 'EUR',
			paidInCash: false
		};
	}

	const supplier = findSupplier(text);
	const total = findTotal(text);
	const creditNote = /КРЕДИТНО ИЗВЕСТИЕ|Кредитно известие|ДЕБИТНО ИЗВЕСТИЕ|към фактура (No\.|N:)/i.test(text);
	const isInvoice = /ФАКТУРА|Фактура|Invoice|INVOICE/.test(text) || creditNote;
	return {
		kind: creditNote ? 'credit_note' : isInvoice ? 'invoice' : 'unknown',
		supplier: supplier?.name ?? null,
		supplierId: supplier?.id ?? null,
		documentNumber: findNumber(text),
		documentDate: findDate(text),
		totalCents: total ? Math.abs(total.cents) : null,
		currency: total?.currency ?? null,
		paidInCash: /Форма на плащане\s+в брой/.test(text),
		period: null,
		payrollDues: [],
		netPayCents: null
	};
}

/** pdf.js puts spaces before punctuation ("Сума : 15.46", "Осиг . вноски"). */
export function normalizeText(text: string) {
	return text.replace(/[ \t]+:/g, ':').replace(/(\p{L})[ \t]+\.(?=[ \t]|$)/gmu, '$1.').replace(/\([ \t]+/g, '(').replace(/[ \t]+\)/g, ')');
}

/** Text of a PDF, one line per text row, using pdf.js. */
export async function extractPdfText(data: Uint8Array): Promise<string> {
	const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const doc = await pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true, isEvalSupported: false }).promise;
	const lines: string[] = [];
	for (let i = 1; i <= doc.numPages; i++) {
		const page = await doc.getPage(i);
		const content = await page.getTextContent();
		// Group text items into rows: items within 3pt vertically share a row.
		const items = (content.items as Array<{ str: string; transform: number[] }>)
			.filter((item) => item.str?.trim())
			.map((item) => ({ x: item.transform[4], y: item.transform[5], s: item.str }))
			.sort((a, b) => b.y - a.y);
		const rows: Array<{ y: number; items: typeof items }> = [];
		for (const item of items) {
			const row = rows.find((r) => Math.abs(r.y - item.y) <= 3);
			if (row) row.items.push(item);
			else rows.push({ y: item.y, items: [item] });
		}
		for (const row of rows.sort((a, b) => b.y - a.y)) {
			lines.push(row.items.sort((a, b) => a.x - b.x).map((r) => r.s).join(' ').replace(/\s+/g, ' '));
		}
	}
	await doc.destroy();
	return normalizeText(lines.join('\n'));
}
