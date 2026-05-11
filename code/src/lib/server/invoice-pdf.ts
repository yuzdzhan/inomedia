import puppeteer from 'puppeteer';
import type { Browser } from 'puppeteer';

type InvoicePdfParty = {
	legalName: string;
	registrationNumber?: string | null;
	vatNumber?: string | null;
	address?: string | null;
	molName?: string | null;
	email?: string | null;
	phone?: string | null;
	website?: string | null;
};

type InvoicePdfTask = {
	description: string;
	hours: number | null;
	amountCents: number;
};

type InvoicePdfProjectGroup = {
	projectName: string;
	tasks: InvoicePdfTask[];
	netAmountCents: number;
};

export type InvoicePdfSnapshot = {
	invoiceNumber: string;
	issueDate: string;
	dueDate: string | null;
	servicePeriodFrom: string | null;
	servicePeriodTo: string | null;
	currency: string;
	paymentMethod: string;
	company: InvoicePdfParty;
	client: InvoicePdfParty;
	projectGroups: InvoicePdfProjectGroup[];
	customRows?: Array<{ description: string; amountCents: number }>;
	netTotalCents: number;
	vatTotalCents: number;
	grossTotalCents: number;
	vatRateBasisPoints: number;
	paidTotalCents?: number;
	bankName?: string | null;
	bankIban?: string | null;
	bankBic?: string | null;
};

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
	if (!browserPromise) {
		browserPromise = puppeteer.launch({
			headless: true,
			executablePath: '/usr/bin/chromium-browser',
			args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
		}).catch(err => {
			browserPromise = null;
			throw err;
		});
	}
	return browserPromise;
}

function h(s: string | null | undefined): string {
	if (!s) return '';
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hNl(s: string | null | undefined): string {
	return h(s).replace(/\n/g, '<br>');
}

function fmtMoney(cents: number): string {
	return (cents / 100).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtHours(hours: number): string {
	const totalMinutes = Math.round(hours * 60);
	const hh = Math.floor(totalMinutes / 60);
	const mm = totalMinutes % 60;
	return mm === 0 ? `${hh}h` : `${hh}h ${mm}min`;
}

function partyFields(party: InvoicePdfParty): string {
	let rows = `<span class="inv-fk">Фирма:</span><span class="inv-fv inv-fv-bold">${h(party.legalName)}</span>`;
	if (party.registrationNumber)
		rows += `<span class="inv-fk">ЕИК/БУЛСТАТ:</span><span class="inv-fv inv-fv-num">${h(party.registrationNumber)}</span>`;
	if (party.vatNumber)
		rows += `<span class="inv-fk">ДДС №:</span><span class="inv-fv inv-fv-num">${h(party.vatNumber)}</span>`;
	if (party.address)
		rows += `<span class="inv-fk">Адрес:</span><span class="inv-fv">${hNl(party.address)}</span>`;
	if (party.molName)
		rows += `<span class="inv-fk">МОЛ:</span><span class="inv-fv">${h(party.molName)}</span>`;
	return rows;
}

function buildInvoiceHtml(snap: InvoicePdfSnapshot): string {
	const { company, client, projectGroups, vatRateBasisPoints, currency } = snap;
	const vatPct = (vatRateBasisPoints / 100).toFixed(0);
	const paidCents = snap.paidTotalCents ?? 0;
	const remainingCents = Math.max(0, snap.grossTotalCents - paidCents);

	const companyDetails = [
		company.email ? `<p class="inv-company-detail">${h(company.email)}</p>` : '',
		company.phone ? `<p class="inv-company-detail">${h(company.phone)}</p>` : '',
		company.website ? `<p class="inv-company-detail">${h(company.website)}</p>` : ''
	].join('');

	let tableRows = '';
	for (let gi = 0; gi < projectGroups.length; gi++) {
		const group = projectGroups[gi];
		const bgClass = gi % 2 === 0 ? 'inv-tr-surface' : 'inv-tr-alt';
		tableRows += `
		<tr class="inv-tr ${bgClass}">
			<td class="inv-td inv-td-num">${gi + 1}</td>
			<td class="inv-td inv-td-desc inv-td-project">${h(group.projectName)}</td>
			<td class="inv-td inv-td-vat">${vatPct}%</td>
			<td class="inv-td inv-td-total">${fmtMoney(group.netAmountCents)}</td>
		</tr>`;
		for (const task of group.tasks) {
			const prefix = task.hours != null ? `${fmtHours(task.hours)} — ` : '';
			tableRows += `
		<tr class="inv-tr">
			<td class="inv-td inv-td-num"></td>
			<td class="inv-td inv-td-desc inv-td-task-desc">${h(prefix + task.description)}</td>
			<td class="inv-td"></td>
			<td class="inv-td inv-td-total inv-td-task-total">${fmtMoney(task.amountCents)}</td>
		</tr>`;
		}
	}
	const customRows = snap.customRows ?? [];
	for (let ci = 0; ci < customRows.length; ci++) {
		const row = customRows[ci];
		const idx = projectGroups.length + ci;
		const bgClass = idx % 2 === 0 ? 'inv-tr-surface' : 'inv-tr-alt';
		tableRows += `
		<tr class="inv-tr ${bgClass}">
			<td class="inv-td inv-td-num">${idx + 1}</td>
			<td class="inv-td inv-td-desc inv-td-project">${h(row.description)}</td>
			<td class="inv-td inv-td-vat">${vatPct}%</td>
			<td class="inv-td inv-td-total">${fmtMoney(row.amountCents)}</td>
		</tr>`;
	}

	let bankFields = '';
	if (snap.bankName)
		bankFields += `<div class="inv-bank-field"><span class="inv-bk">Банка</span><span class="inv-bv">${h(snap.bankName)}</span></div>`;
	if (snap.bankIban)
		bankFields += `<div class="inv-bank-field"><span class="inv-bk">IBAN</span><span class="inv-bv inv-bv-iban">${h(snap.bankIban)}</span></div>`;
	if (snap.bankBic)
		bankFields += `<div class="inv-bank-field"><span class="inv-bk">BIC/SWIFT</span><span class="inv-bv">${h(snap.bankBic)}</span></div>`;
	bankFields += `<div class="inv-bank-field"><span class="inv-bk">Получател</span><span class="inv-bv">${h(company.legalName)}</span></div>`;
	bankFields += `<div class="inv-bank-field inv-bank-wide"><span class="inv-bk">Основание за плащане</span><span class="inv-bv inv-bv-ref">Плащане по фактура №${h(snap.invoiceNumber)}</span></div>`;

	const remainingClass = remainingCents === 0 ? 'inv-sum-due inv-sum-due-zero' : 'inv-sum-due';

	return `<!DOCTYPE html>
<html lang="bg">
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&family=Montserrat:wght@600;700&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; padding: 0; font-family: 'Open Sans', sans-serif; color: #1d1b20; background: #fff; }

.inv-header {
	display: flex; justify-content: space-between; align-items: flex-start;
	margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #E5E7EB;
}
.inv-header-left { width: 50%; }
.inv-company-name {
	font-family: 'Montserrat', sans-serif; font-size: 18px; font-weight: 600;
	letter-spacing: -0.01em; line-height: 24px; color: #4f378a; margin: 0 0 4px 0;
}
.inv-company-detail { font-size: 12px; line-height: 18px; color: #494551; margin: 0; }
.inv-header-right { width: 50%; text-align: right; }
.inv-doc-title {
	font-family: 'Montserrat', sans-serif; font-size: 24px; font-weight: 700;
	letter-spacing: -0.02em; line-height: 32px; color: #334155; margin: 0 0 4px 0;
}
.inv-doc-subtitle {
	font-family: 'Montserrat', sans-serif; font-size: 18px; font-weight: 700;
	letter-spacing: -0.01em; color: #494551; text-transform: uppercase; margin: 0 0 8px 0;
}
.inv-meta-grid {
	display: grid; grid-template-columns: auto auto; gap: 4px 8px;
	justify-content: end; margin-bottom: 4px;
}
.inv-mk { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: #494551; text-align: right; }
.inv-mv { font-size: 13px; font-weight: 600; color: #1d1b20; text-align: right; font-variant-numeric: tabular-nums; }

.inv-legal { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
.inv-section-title {
	font-family: 'Montserrat', sans-serif; font-size: 14px; font-weight: 600; line-height: 20px;
	color: #334155; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px; margin: 0 0 8px 0;
}
.inv-fields { display: grid; grid-template-columns: 100px 1fr; gap: 4px 0; font-size: 12px; line-height: 18px; }
.inv-fk { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: #494551; padding-right: 8px; }
.inv-fv { color: #1d1b20; }
.inv-fv-num { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.inv-fv-bold { font-weight: 600; }

.inv-table-wrap { margin-bottom: 32px; }
.inv-table { width: 100%; border-collapse: collapse; }
.inv-th {
	background: #F9FAFB; font-size: 11px; font-weight: 700; letter-spacing: 0.02em;
	color: #494551; padding: 8px; text-align: left;
	border-top: 1px solid #E5E7EB; border-bottom: 1px solid #E5E7EB;
}
.inv-th-num { width: 36px; text-align: center; }
.inv-th-vat { width: 64px; text-align: right; }
.inv-th-total { width: 110px; text-align: right; }
.inv-tr { border-bottom: 1px solid #ece6ee; }
.inv-tr-alt { background: #f8f2fa; }
.inv-tr-surface { background: #ece6ee; }
.inv-td { font-size: 12px; line-height: 18px; color: #1d1b20; padding: 8px; vertical-align: top; }
.inv-td-num { text-align: center; }
.inv-td-vat { text-align: right; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.inv-td-total { text-align: right; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.inv-td-project { font-weight: 600; }
.inv-td-task-desc { font-size: 11px; color: #494551; padding-top: 4px; padding-bottom: 4px; padding-left: 20px; }
.inv-td-task-total { font-size: 11px; font-weight: 400; color: #494551; padding-top: 4px; padding-bottom: 4px; }

.inv-summary-wrap { display: flex; justify-content: flex-end; margin-bottom: 32px; }
.inv-summary { width: 300px; }
.inv-sum-row { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 0; }
.inv-sum-sep { border-bottom: 1px solid #E5E7EB; }
.inv-sum-muted { color: #494551; }
.inv-sum-label { font-size: 12px; color: #494551; }
.inv-sum-val { font-size: 13px; font-weight: 600; color: #1d1b20; font-variant-numeric: tabular-nums; }
.inv-sum-grand { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; margin-top: 4px; }
.inv-sum-grand-label {
	font-family: 'Montserrat', sans-serif; font-size: 18px; font-weight: 600;
	letter-spacing: -0.01em; color: #334155;
}
.inv-sum-grand-val {
	font-family: 'Montserrat', sans-serif; font-size: 18px; font-weight: 600;
	letter-spacing: -0.01em; color: #334155; font-variant-numeric: tabular-nums;
}
.inv-sum-sm-label { font-size: 10px; color: #494551; }
.inv-sum-sm-val { font-size: 13px; font-weight: 600; color: #1d1b20; font-variant-numeric: tabular-nums; }
.inv-sum-due {
	display: flex; justify-content: space-between; align-items: baseline;
	padding: 4px 8px; background: #ece6ee; border-radius: 2px; margin-top: 4px;
	font-family: 'Montserrat', sans-serif; font-size: 14px; font-weight: 600; color: #ba1a1a;
}
.inv-sum-due.inv-sum-due-zero { color: #15803d; background: #dcfce7; }

.inv-footer { padding-top: 24px; border-top: 1px solid #E5E7EB; }
.inv-bank {
	background: #f8f2fa; border: 2px dashed #cbc4d2; border-radius: 2px;
	padding: 16px; margin-bottom: 24px;
}
.inv-bank-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.inv-bank-title {
	font-family: 'Montserrat', sans-serif; font-size: 14px; font-weight: 600;
	color: #334155; display: flex; align-items: center; gap: 6px; margin: 0;
}
.inv-bank-icon { width: 18px; height: 18px; color: #334155; flex-shrink: 0; }
.inv-bank-subtitle { font-size: 10px; font-weight: 700; letter-spacing: 0.02em; color: #494551; }
.inv-bank-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px 32px; font-size: 12px; }
.inv-bank-field { display: flex; flex-direction: column; gap: 2px; }
.inv-bank-wide { grid-column: span 2; }
.inv-bk { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: #494551; text-transform: uppercase; }
.inv-bv { font-weight: 600; color: #1d1b20; }
.inv-bv-iban { font-size: 13px; font-weight: 700; color: #4f378a; font-variant-numeric: tabular-nums; }
.inv-bv-ref { background: #f2ecf4; padding: 2px 8px; border-radius: 2px; font-weight: 600; }
.inv-bank-footer {
	margin-top: 12px; padding-top: 8px; border-top: 1px dotted #cbc4d2;
	display: flex; justify-content: space-between; align-items: center;
	font-size: 10px; color: #494551; font-style: italic;
}
.inv-bank-footer p { margin: 0; }
.inv-page-num { text-align: right; font-size: 10px; color: #494551; margin-top: 8px; }
</style>
</head>
<body>

<header class="inv-header">
	<div class="inv-header-left">
		<h1 class="inv-company-name">${h(company.legalName)}</h1>
		${companyDetails}
	</div>
	<div class="inv-header-right">
		<h2 class="inv-doc-title">ФАКТУРА</h2>
		<p class="inv-doc-subtitle">(ОРИГИНАЛ)</p>
		<div class="inv-meta-grid">
			<span class="inv-mk">Номер:</span>
			<span class="inv-mv">${h(snap.invoiceNumber)}</span>
			<span class="inv-mk">Дата:</span>
			<span class="inv-mv">${h(snap.issueDate)}</span>
			<span class="inv-mk">Падеж:</span>
			<span class="inv-mv">${snap.dueDate ? h(snap.dueDate) : '—'}</span>
		</div>
	</div>
</header>

<div class="inv-legal">
	<div>
		<h3 class="inv-section-title">ДОСТАВЧИК</h3>
		<div class="inv-fields">${partyFields(company)}</div>
	</div>
	<div>
		<h3 class="inv-section-title">КЛИЕНТ</h3>
		<div class="inv-fields">${partyFields(client)}</div>
	</div>
</div>

<div class="inv-table-wrap">
	<table class="inv-table">
		<thead>
			<tr>
				<th class="inv-th inv-th-num">№</th>
				<th class="inv-th">Описание</th>
				<th class="inv-th inv-th-vat">VAT %</th>
				<th class="inv-th inv-th-total">Сума (${h(currency)})</th>
			</tr>
		</thead>
		<tbody>${tableRows}</tbody>
	</table>
</div>

<div class="inv-summary-wrap">
	<div class="inv-summary">
		<div class="inv-sum-row inv-sum-sep">
			<span class="inv-sum-label">Сума без ДДС:</span>
			<span class="inv-sum-val">${fmtMoney(snap.netTotalCents)} ${h(currency)}</span>
		</div>
		<div class="inv-sum-row inv-sum-sep">
			<span class="inv-sum-label">ДДС ${vatPct}%:</span>
			<span class="inv-sum-val">${fmtMoney(snap.vatTotalCents)} ${h(currency)}</span>
		</div>
		<div class="inv-sum-grand">
			<span class="inv-sum-grand-label">Общо с ДДС:</span>
			<span class="inv-sum-grand-val">${fmtMoney(snap.grossTotalCents)} ${h(currency)}</span>
		</div>
		<div class="inv-sum-row inv-sum-muted">
			<span class="inv-sum-sm-label">Платено:</span>
			<span class="inv-sum-sm-val">${fmtMoney(paidCents)} ${h(currency)}</span>
		</div>
		<div class="${remainingClass}">
			<span>Остатък за плащане:</span>
			<span>${fmtMoney(remainingCents)} ${h(currency)}</span>
		</div>
	</div>
</div>

<footer class="inv-footer">
	<div class="inv-bank">
		<div class="inv-bank-head">
			<h3 class="inv-bank-title">
				<svg class="inv-bank-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93V18c0-.55-.45-1-1-1s-1 .45-1 1v1.93C7.06 19.44 4.56 16.94 4.07 14H6c.55 0 1-.45 1-1s-.45-1-1-1H4.07C4.56 8.06 7.06 5.56 10 5.07V7c0 .55.45 1 1 1s1-.45 1-1V5.07C16.94 5.56 19.44 8.06 19.93 11H18c-.55 0-1 .45-1 1s.45 1 1 1h1.93c-.49 2.94-2.99 5.44-5.93 5.93z"/>
				</svg>
				ДАННИ ЗА ПЛАЩАНЕ
			</h3>
			<span class="inv-bank-subtitle">Платежно нареждане</span>
		</div>
		<div class="inv-bank-grid">${bankFields}</div>
		<div class="inv-bank-footer">
			<p>Please use the exact reference provided to ensure automatic processing.</p>
			${snap.dueDate ? `<p>Deadline: ${h(snap.dueDate)}</p>` : ''}
		</div>
	</div>
	<div class="inv-page-num">Page 1 of 1</div>
</footer>

</body>
</html>`;
}

export async function generateInvoicePdf(snapshot: InvoicePdfSnapshot): Promise<Uint8Array<ArrayBuffer>> {
	const browser = await getBrowser();
	const page = await browser.newPage();
	try {
		const html = buildInvoiceHtml(snapshot);
		await page.setContent(html, { waitUntil: 'networkidle0' });
		const pdfBuffer = await page.pdf({
			format: 'A4',
			printBackground: true,
			margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
		});
		// Copy into Uint8Array<ArrayBuffer> to satisfy BodyInit / Prisma bytes type
		const result = new Uint8Array(new ArrayBuffer(pdfBuffer.length));
		result.set(pdfBuffer);
		return result;
	} finally {
		await page.close();
	}
}
