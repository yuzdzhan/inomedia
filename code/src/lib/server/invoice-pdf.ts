import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
	netTotalCents: number;
	vatTotalCents: number;
	grossTotalCents: number;
	vatRateBasisPoints: number;
	paidTotalCents?: number;
	bankName?: string | null;
	bankIban?: string | null;
	bankBic?: string | null;
};

type TtfInfo = {
	fontBytes: Buffer;
	unitsPerEm: number;
	ascent: number;
	descent: number;
	xMin: number;
	yMin: number;
	xMax: number;
	yMax: number;
	glyphIndexForCodePoint: (codePoint: number) => number;
	advanceWidthForGlyph: (glyphId: number) => number;
};

type Page = {
	commands: string[];
	y: number;
};

const A4_WIDTH = 595;
const A4_HEIGHT = 842;
const PAGE_MARGIN = 48;
const FONT_PATH = path.resolve(process.cwd(), 'static/fonts/OpenSans-Regular.ttf');

// Colors: RGB 0–1 — from template palette
const C_PRIMARY: readonly [number, number, number]      = [0.310, 0.216, 0.541]; // #4f378a
const C_CHARCOAL: readonly [number, number, number]     = [0.200, 0.255, 0.333]; // #334155
const C_MUTED: readonly [number, number, number]        = [0.286, 0.271, 0.318]; // #494551
const C_BLACK: readonly [number, number, number]        = [0.114, 0.106, 0.125]; // #1d1b20
const C_BORDER: readonly [number, number, number]       = [0.898, 0.910, 0.922]; // #E5E7EB
const C_TBL_HDR: readonly [number, number, number]      = [0.976, 0.980, 0.988]; // #F9FAFB
const C_ALT_ROW: readonly [number, number, number]      = [0.973, 0.949, 0.980]; // #f8f2fa
const C_SURFACE_HIGH: readonly [number, number, number] = [0.925, 0.902, 0.933]; // #ece6ee
const C_BADGE_BG: readonly [number, number, number]     = [0.788, 0.655, 0.302]; // #c9a74d
const C_BADGE_FG: readonly [number, number, number]     = [0.314, 0.239, 0.000]; // #503d00
const C_ERROR: readonly [number, number, number]        = [0.729, 0.102, 0.102]; // #ba1a1a
const C_SUCCESS: readonly [number, number, number]      = [0.133, 0.545, 0.133];

let fontInfoPromise: Promise<TtfInfo> | null = null;

function readUInt16(buffer: Buffer, offset: number) {
	return buffer.readUInt16BE(offset);
}

function readInt16(buffer: Buffer, offset: number) {
	return buffer.readInt16BE(offset);
}

function readUInt32(buffer: Buffer, offset: number) {
	return buffer.readUInt32BE(offset);
}

function formatMoney(valueCents: number, currency: string) {
	const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'BGN' ? 'лв.' : currency;
	return `${(valueCents / 100).toFixed(2)} ${symbol}`;
}

function formatPaymentMethod(value: string) {
	return value === 'cash' ? 'В брой' : 'Банков превод';
}

function formatHours(h: number): string {
	const totalMin = Math.round(h * 60);
	const hrs = Math.floor(totalMin / 60);
	const min = totalMin % 60;
	if (min === 0) return `${hrs}h`;
	return `${hrs}h ${min}min`;
}

async function loadFontInfo(): Promise<TtfInfo> {
	if (!fontInfoPromise) {
		fontInfoPromise = (async () => {
			const fontBytes = await readFile(FONT_PATH);
			const numTables = readUInt16(fontBytes, 4);
			const tables = new Map<string, { offset: number; length: number }>();

			for (let index = 0; index < numTables; index += 1) {
				const entryOffset = 12 + index * 16;
				const tag = fontBytes.toString('ascii', entryOffset, entryOffset + 4);
				tables.set(tag, {
					offset: readUInt32(fontBytes, entryOffset + 8),
					length: readUInt32(fontBytes, entryOffset + 12)
				});
			}

			const table = (tag: string) => {
				const value = tables.get(tag);
				if (!value) throw new Error(`Missing TTF table: ${tag}`);
				return value;
			};

			const head = table('head');
			const hhea = table('hhea');
			const hmtx = table('hmtx');
			const cmap = table('cmap');

			const unitsPerEm = readUInt16(fontBytes, head.offset + 18);
			const xMin = readInt16(fontBytes, head.offset + 36);
			const yMin = readInt16(fontBytes, head.offset + 38);
			const xMax = readInt16(fontBytes, head.offset + 40);
			const yMax = readInt16(fontBytes, head.offset + 42);
			const ascent = readInt16(fontBytes, hhea.offset + 4);
			const descent = readInt16(fontBytes, hhea.offset + 6);
			const numberOfHMetrics = readUInt16(fontBytes, hhea.offset + 34);
			const advanceWidths: number[] = [];

			for (let index = 0; index < numberOfHMetrics; index += 1) {
				advanceWidths.push(readUInt16(fontBytes, hmtx.offset + index * 4));
			}

			const cmapVersion = readUInt16(fontBytes, cmap.offset);
			if (cmapVersion !== 0) throw new Error('Unsupported cmap version');

			const cmapSubtableCount = readUInt16(fontBytes, cmap.offset + 2);
			let selectedSubtableOffset = 0;
			let selectedFormat = 0;

			for (let index = 0; index < cmapSubtableCount; index += 1) {
				const recordOffset = cmap.offset + 4 + index * 8;
				const platformId = readUInt16(fontBytes, recordOffset);
				const encodingId = readUInt16(fontBytes, recordOffset + 2);
				const subtableOffset = readUInt32(fontBytes, recordOffset + 4);
				const format = readUInt16(fontBytes, cmap.offset + subtableOffset);

				if (platformId === 3 && encodingId === 10 && format === 12) {
					selectedSubtableOffset = cmap.offset + subtableOffset;
					selectedFormat = format;
					break;
				}

				if (!selectedSubtableOffset && platformId === 3 && encodingId === 1 && format === 4) {
					selectedSubtableOffset = cmap.offset + subtableOffset;
					selectedFormat = format;
				}
			}

			if (!selectedSubtableOffset || !selectedFormat) {
				throw new Error('No supported cmap subtable found');
			}

			const glyphIndexForCodePoint =
				selectedFormat === 12
					? buildFormat12Mapper(fontBytes, selectedSubtableOffset)
					: buildFormat4Mapper(fontBytes, selectedSubtableOffset);

			return {
				fontBytes,
				unitsPerEm,
				ascent,
				descent,
				xMin,
				yMin,
				xMax,
				yMax,
				glyphIndexForCodePoint,
				advanceWidthForGlyph: (glyphId: number) =>
					advanceWidths[Math.min(glyphId, advanceWidths.length - 1)] ?? advanceWidths.at(-1) ?? 1000
			};
		})().catch((err) => {
			fontInfoPromise = null;
			throw err;
		});
	}

	return fontInfoPromise;
}

function buildFormat12Mapper(buffer: Buffer, offset: number) {
	const groupCount = readUInt32(buffer, offset + 12);
	const groups: Array<{ start: number; end: number; startGlyph: number }> = [];

	for (let index = 0; index < groupCount; index += 1) {
		const groupOffset = offset + 16 + index * 12;
		groups.push({
			start: readUInt32(buffer, groupOffset),
			end: readUInt32(buffer, groupOffset + 4),
			startGlyph: readUInt32(buffer, groupOffset + 8)
		});
	}

	return (codePoint: number) => {
		for (const group of groups) {
			if (codePoint >= group.start && codePoint <= group.end) {
				return group.startGlyph + (codePoint - group.start);
			}
		}
		return 0;
	};
}

function buildFormat4Mapper(buffer: Buffer, offset: number) {
	const segCount = readUInt16(buffer, offset + 6) / 2;
	const endCodesOffset = offset + 14;
	const startCodesOffset = endCodesOffset + segCount * 2 + 2;
	const idDeltasOffset = startCodesOffset + segCount * 2;
	const idRangeOffsetsOffset = idDeltasOffset + segCount * 2;

	return (codePoint: number) => {
		for (let index = 0; index < segCount; index += 1) {
			const endCode = readUInt16(buffer, endCodesOffset + index * 2);
			const startCode = readUInt16(buffer, startCodesOffset + index * 2);

			if (codePoint < startCode || codePoint > endCode) continue;

			const idDelta = readUInt16(buffer, idDeltasOffset + index * 2);
			const idRangeOffset = readUInt16(buffer, idRangeOffsetsOffset + index * 2);

			if (idRangeOffset === 0) return (codePoint + idDelta) & 0xffff;

			const glyphIndexAddress =
				idRangeOffsetsOffset + index * 2 + idRangeOffset + (codePoint - startCode) * 2;
			const glyphIndex = readUInt16(buffer, glyphIndexAddress);
			if (glyphIndex === 0) return 0;
			return (glyphIndex + idDelta) & 0xffff;
		}
		return 0;
	};
}

function uniqueCharacters(values: string[]) {
	const characters = new Set<number>();
	for (const value of values) {
		for (const char of Array.from(value)) {
			characters.add(char.codePointAt(0) ?? 32);
		}
	}
	return [...characters].sort((left, right) => left - right);
}

function toHex16(value: number) {
	return value.toString(16).padStart(4, '0').toUpperCase();
}

function buildFontMaps(fontInfo: TtfInfo, strings: string[]) {
	const codePoints = uniqueCharacters(strings);
	const cidByCodePoint = new Map<number, number>();
	const glyphByCid = new Map<number, number>();
	const widthByCid = new Map<number, number>();

	let nextCid = 1;
	for (const codePoint of codePoints) {
		const cid = nextCid++;
		const glyphId = fontInfo.glyphIndexForCodePoint(codePoint);
		const width = Math.round(
			(fontInfo.advanceWidthForGlyph(glyphId) * 1000) / Math.max(fontInfo.unitsPerEm, 1)
		);
		cidByCodePoint.set(codePoint, cid);
		glyphByCid.set(cid, glyphId);
		widthByCid.set(cid, width);
	}

	return { cidByCodePoint, glyphByCid, widthByCid };
}

function encodeTextAsCidHex(text: string, cidByCodePoint: Map<number, number>) {
	let hex = '';
	for (const char of Array.from(text)) {
		const codePoint = char.codePointAt(0) ?? 32;
		hex += toHex16(cidByCodePoint.get(codePoint) ?? 0);
	}
	return hex;
}

function textWidth(
	text: string,
	fontSize: number,
	widthByCid: Map<number, number>,
	cidByCodePoint: Map<number, number>
) {
	let total = 0;
	for (const char of Array.from(text)) {
		const codePoint = char.codePointAt(0) ?? 32;
		const cid = cidByCodePoint.get(codePoint) ?? 0;
		total += widthByCid.get(cid) ?? 500;
	}
	return (total * fontSize) / 1000;
}

function wrapText(
	text: string,
	maxWidth: number,
	fontSize: number,
	widthByCid: Map<number, number>,
	cidByCodePoint: Map<number, number>
) {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return [''];

	const words = normalized.split(' ');
	const lines: string[] = [];
	let current = '';

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (textWidth(candidate, fontSize, widthByCid, cidByCodePoint) <= maxWidth || !current) {
			current = candidate;
			continue;
		}
		lines.push(current);
		current = word;
	}

	if (current) lines.push(current);
	return lines;
}

function createPage(): Page {
	return { commands: ['0 G', '0 g'], y: A4_HEIGHT - PAGE_MARGIN };
}

function addText(
	page: Page,
	text: string,
	x: number,
	y: number,
	fontSize: number,
	cidByCodePoint: Map<number, number>,
	color?: readonly [number, number, number]
) {
	if (color) {
		page.commands.push(`${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg`);
	}
	page.commands.push(
		`BT /F1 ${fontSize} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm <${encodeTextAsCidHex(text, cidByCodePoint)}> Tj ET`
	);
	if (color) {
		page.commands.push('0 g');
	}
}

function addLine(
	page: Page,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	color?: readonly [number, number, number]
) {
	if (color) {
		page.commands.push(`${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} RG`);
	}
	page.commands.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
	if (color) {
		page.commands.push('0 G');
	}
}

function addRect(
	page: Page,
	x: number,
	y: number,
	w: number,
	h: number,
	color: readonly [number, number, number]
) {
	page.commands.push(`${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg`);
	page.commands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
	page.commands.push('0 g');
}

function renderInvoicePages(
	snapshot: InvoicePdfSnapshot,
	cidByCodePoint: Map<number, number>,
	widthByCid: Map<number, number>
) {
	const pages: Page[] = [];
	let page = createPage();
	pages.push(page);

	const RIGHT_X = A4_WIDTH - PAGE_MARGIN;
	const CONTENT_W = RIGHT_X - PAGE_MARGIN;
	const MID_X = PAGE_MARGIN + CONTENT_W / 2;
	const HALF_W = CONTENT_W / 2 - 8;

	function ensureSpace(height: number) {
		if (page.y - height < PAGE_MARGIN + 20) {
			page = createPage();
			pages.push(page);
		}
	}

	function rtext(str: string, rx: number, y: number, sz: number, col?: readonly [number, number, number]) {
		const w = textWidth(str, sz, widthByCid, cidByCodePoint);
		addText(page, str, rx - w, y, sz, cidByCodePoint, col);
	}

	// ── 1. HEADER ─────────────────────────────────────────────────────────────
	const hY = page.y;

	// Company name + contact info
	addText(page, snapshot.company.legalName, PAGE_MARGIN, hY - 20, 13, cidByCodePoint, C_PRIMARY);
	let cy = hY - 36;
	if (snapshot.company.email)   { addText(page, snapshot.company.email,   PAGE_MARGIN, cy, 9, cidByCodePoint, C_MUTED); cy -= 16; }
	if (snapshot.company.phone)   { addText(page, snapshot.company.phone,   PAGE_MARGIN, cy, 9, cidByCodePoint, C_MUTED); cy -= 16; }
	if (snapshot.company.website) { addText(page, snapshot.company.website, PAGE_MARGIN, cy, 9, cidByCodePoint, C_MUTED); }

	// Right: ФАКТУРА + meta
	rtext('ФАКТУРА', RIGHT_X, hY - 24, 18, C_CHARCOAL);
	const isDraft = !snapshot.invoiceNumber || snapshot.invoiceNumber === 'ЧЕРНОВА';
	rtext(isDraft ? '(ЧЕРНОВА)' : '(ОРИГИНАЛ)', RIGHT_X, hY - 40, 11, C_MUTED);

	const ML = 388;
	addText(page, 'Номер:', ML, hY - 56, 8, cidByCodePoint, C_MUTED);
	rtext(snapshot.invoiceNumber || '—', RIGHT_X, hY - 56, 9, C_BLACK);
	addText(page, 'Дата:', ML, hY - 72, 8, cidByCodePoint, C_MUTED);
	rtext(snapshot.issueDate || '—', RIGHT_X, hY - 72, 9, C_BLACK);
	addText(page, 'Падеж:', ML, hY - 88, 8, cidByCodePoint, C_MUTED);
	rtext(snapshot.dueDate || '—', RIGHT_X, hY - 88, 9, C_BLACK);

	// Status badge
	const bl = isDraft ? 'ЧЕРНОВА' : 'НЕПЛАТЕНА';
	const bw = textWidth(bl, 8, widthByCid, cidByCodePoint) + 14;
	addRect(page, RIGHT_X - bw, hY - 109, bw, 14, isDraft ? C_SURFACE_HIGH : C_BADGE_BG);
	rtext(bl, RIGHT_X - 7, hY - 103, 8, isDraft ? C_MUTED : C_BADGE_FG);

	// Header divider
	const hBot = hY - 120;
	addLine(page, PAGE_MARGIN, hBot, RIGHT_X, hBot, C_BORDER);
	page.y = hBot - 16;

	// ── 2. LEGAL GRID ─────────────────────────────────────────────────────────
	function pfield(label: string, val: string | null | undefined, x: number, y: number): number {
		if (!val) return y;
		const paragraphs = val.split('\n').map((p) => p.trim()).filter(Boolean);
		if (paragraphs.length === 0) return y;
		addText(page, label, x, y, 8, cidByCodePoint, C_MUTED);
		const lw = textWidth(label, 8, widthByCid, cidByCodePoint) + 3;
		const allLines: string[] = [];
		for (const para of paragraphs) {
			allLines.push(...wrapText(para, HALF_W - lw - 4, 9, widthByCid, cidByCodePoint));
		}
		addText(page, allLines[0] ?? '', x + lw, y, 9, cidByCodePoint, C_BLACK);
		let ny = y - 15;
		for (let i = 1; i < allLines.length; i++) {
			addText(page, allLines[i] ?? '', x + lw, ny, 9, cidByCodePoint, C_BLACK);
			ny -= 15;
		}
		return ny;
	}

	// Section titles with underlines
	addText(page, 'ДОСТАВЧИК', PAGE_MARGIN, page.y, 10, cidByCodePoint, C_CHARCOAL);
	addLine(page, PAGE_MARGIN, page.y - 5, PAGE_MARGIN + HALF_W, page.y - 5, C_BORDER);
	addText(page, 'КЛИЕНТ', MID_X + 4, page.y, 10, cidByCodePoint, C_CHARCOAL);
	addLine(page, MID_X + 4, page.y - 5, MID_X + 4 + HALF_W, page.y - 5, C_BORDER);
	page.y -= 18;

	const partyY = page.y;

	// Provider
	addText(page, snapshot.company.legalName, PAGE_MARGIN, partyY, 10, cidByCodePoint, C_BLACK);
	let lY = partyY - 16;
	lY = pfield('ЕИК/БУЛСТАТ:', snapshot.company.registrationNumber, PAGE_MARGIN, lY);
	lY = pfield('ДДС №:', snapshot.company.vatNumber, PAGE_MARGIN, lY);
	lY = pfield('Адрес:', snapshot.company.address, PAGE_MARGIN, lY);
	lY = pfield('МОЛ:', snapshot.company.molName, PAGE_MARGIN, lY);

	// Client
	addText(page, snapshot.client.legalName, MID_X + 4, partyY, 10, cidByCodePoint, C_BLACK);
	let rY = partyY - 16;
	rY = pfield('ЕИК/БУЛСТАТ:', snapshot.client.registrationNumber, MID_X + 4, rY);
	rY = pfield('ДДС №:', snapshot.client.vatNumber, MID_X + 4, rY);
	rY = pfield('Адрес:', snapshot.client.address, MID_X + 4, rY);
	rY = pfield('МОЛ:', snapshot.client.molName, MID_X + 4, rY);

	page.y = Math.min(lY, rY) - 12;
	addLine(page, PAGE_MARGIN, page.y + 5, RIGHT_X, page.y + 5, C_BORDER);
	page.y -= 16;

	// ── 3. ITEMS TABLE ────────────────────────────────────────────────────────
	const NW = 20, VW = 44, TW = 82;
	const DX = PAGE_MARGIN + NW + 4;
	const DW = CONTENT_W - NW - 4 - VW - TW;
	const VX = DX + DW;

	ensureSpace(24 + 30);
	addRect(page, PAGE_MARGIN, page.y - 22, CONTENT_W, 22, C_TBL_HDR);
	addText(page, '№', PAGE_MARGIN + 5, page.y - 14, 8, cidByCodePoint, C_MUTED);
	addText(page, 'Описание', DX, page.y - 14, 8, cidByCodePoint, C_MUTED);
	rtext('ДДС %', VX + VW, page.y - 14, 8, C_MUTED);
	rtext('Сума', RIGHT_X - 4, page.y - 14, 8, C_MUTED);
	page.y -= 22;

	const vp = `${(snapshot.vatRateBasisPoints / 100).toFixed(0)}%`;
	for (let gi = 0; gi < snapshot.projectGroups.length; gi++) {
		const group = snapshot.projectGroups[gi];

		// Pre-compute wrapped task lines
		const taskLines = group.tasks.map((task) => {
			const label = task.hours != null
				? `${formatHours(task.hours)} — ${task.description}`
				: task.description;
			return wrapText(label, DW - 16, 8, widthByCid, cidByCodePoint);
		});
		const totalTaskLines = taskLines.reduce((s, l) => s + l.length, 0);
		const taskBlockH = group.tasks.length > 0
			? 8 + totalTaskLines * 13 + Math.max(0, group.tasks.length - 1) * 3 + 8
			: 0;
		const groupH = 22 + taskBlockH;

		ensureSpace(Math.min(groupH + 4, A4_HEIGHT - PAGE_MARGIN * 2 - 20));

		// Project header row
		addRect(page, PAGE_MARGIN, page.y - 22, CONTENT_W, 22, gi % 2 === 0 ? C_SURFACE_HIGH : C_ALT_ROW);
		const py = page.y - 13;
		addText(page, String(gi + 1), PAGE_MARGIN + 5, py, 9, cidByCodePoint, C_MUTED);
		addText(page, group.projectName, DX, py, 9, cidByCodePoint, C_BLACK);
		rtext(vp, VX + VW - 4, py, 9, C_MUTED);
		rtext(formatMoney(group.netAmountCents, snapshot.currency), RIGHT_X - 4, py, 9, C_BLACK);
		page.y -= 22;

		// Task sub-rows (descriptions, indented)
		if (group.tasks.length > 0) {
			let taskY = page.y - 8;
			for (let ti = 0; ti < group.tasks.length; ti++) {
				const lines = taskLines[ti] ?? [];
				for (let j = 0; j < lines.length; j++) {
					addText(page, lines[j] ?? '', DX + 12, taskY, 8, cidByCodePoint, C_MUTED);
					taskY -= 13;
				}
				if (ti < group.tasks.length - 1) taskY -= 3;
			}
			page.y = taskY - 8;
		}

		addLine(page, PAGE_MARGIN, page.y + 2, RIGHT_X, page.y + 2, C_BORDER);
	}

	// ── 4. SUMMARY ────────────────────────────────────────────────────────────
	page.y -= 10;
	const SX = PAGE_MARGIN + CONTENT_W / 2;

	function srow(
		label: string, val: string,
		lsz: number, vsz: number,
		lc: readonly [number, number, number],
		vc: readonly [number, number, number]
	) {
		ensureSpace(lsz + 12);
		addText(page, label, SX, page.y, lsz, cidByCodePoint, lc);
		rtext(val, RIGHT_X, page.y, vsz, vc);
		page.y -= lsz + 10;
	}

	srow('Сума без ДДС:', formatMoney(snapshot.netTotalCents, snapshot.currency), 9, 9, C_MUTED, C_BLACK);
	srow(`ДДС ${(snapshot.vatRateBasisPoints / 100).toFixed(0)}%:`, formatMoney(snapshot.vatTotalCents, snapshot.currency), 9, 9, C_MUTED, C_BLACK);
	addLine(page, SX, page.y + 5, RIGHT_X, page.y + 5, C_BORDER);
	page.y -= 4;
	srow('Общо с ДДС:', formatMoney(snapshot.grossTotalCents, snapshot.currency), 12, 12, C_CHARCOAL, C_CHARCOAL);

	const paid = snapshot.paidTotalCents ?? 0;
	srow('Платено:', formatMoney(paid, snapshot.currency), 9, 9, C_MUTED, C_MUTED);

	const rem = Math.max(0, snapshot.grossTotalCents - paid);
	const rc: readonly [number, number, number] = rem > 0 ? C_ERROR : C_SUCCESS;
	ensureSpace(24);
	addRect(page, SX - 4, page.y - 5, RIGHT_X - SX + 4, 20, C_SURFACE_HIGH);
	srow('Остатък за плащане:', formatMoney(rem, snapshot.currency), 10, 10, rc, rc);

	// ── 5. PAYMENT SLIP ───────────────────────────────────────────────────────
	if (snapshot.bankName || snapshot.bankIban || snapshot.bankBic) {
		page.y -= 14;
		const SH = 86;
		ensureSpace(SH + 12);
		const st = page.y;
		const sb = st - SH;

		// Dashed border rectangle
		page.commands.push(`[4 3] 0 d ${C_MUTED[0].toFixed(3)} ${C_MUTED[1].toFixed(3)} ${C_MUTED[2].toFixed(3)} RG 0.5 w`);
		page.commands.push(
			`${PAGE_MARGIN.toFixed(2)} ${st.toFixed(2)} m ${RIGHT_X.toFixed(2)} ${st.toFixed(2)} l ` +
			`${RIGHT_X.toFixed(2)} ${sb.toFixed(2)} l ${PAGE_MARGIN.toFixed(2)} ${sb.toFixed(2)} l ` +
			`${PAGE_MARGIN.toFixed(2)} ${st.toFixed(2)} l S`
		);
		page.commands.push('[] 0 d 0 G 1 w');

		addText(page, 'ДАННИ ЗА ПЛАЩАНЕ', PAGE_MARGIN + 8, st - 14, 9, cidByCodePoint, C_CHARCOAL);

		const CW3 = CONTENT_W / 3;
		const fy = st - 32;

		addText(page, 'БАНКА', PAGE_MARGIN + 8, fy, 7, cidByCodePoint, C_MUTED);
		if (snapshot.bankName) addText(page, snapshot.bankName, PAGE_MARGIN + 8, fy - 14, 9, cidByCodePoint, C_BLACK);

		addText(page, 'IBAN', PAGE_MARGIN + 8 + CW3, fy, 7, cidByCodePoint, C_MUTED);
		if (snapshot.bankIban) addText(page, snapshot.bankIban, PAGE_MARGIN + 8 + CW3, fy - 14, 9, cidByCodePoint, C_PRIMARY);

		addText(page, 'BIC/SWIFT', PAGE_MARGIN + 8 + CW3 * 2, fy, 7, cidByCodePoint, C_MUTED);
		if (snapshot.bankBic) addText(page, snapshot.bankBic, PAGE_MARGIN + 8 + CW3 * 2, fy - 14, 9, cidByCodePoint, C_BLACK);

		const ry = fy - 38;
		addText(page, 'ОСНОВАНИЕ ЗА ПЛАЩАНЕ', PAGE_MARGIN + 8, ry, 7, cidByCodePoint, C_MUTED);
		addText(page, `Плащане по фактура №${snapshot.invoiceNumber}`, PAGE_MARGIN + 8, ry - 14, 9, cidByCodePoint, C_BLACK);
		if (snapshot.dueDate) rtext(`Краен срок: ${snapshot.dueDate}`, RIGHT_X - 8, ry - 14, 8, C_MUTED);

		page.y = sb - 12;
	}

	// Page numbers (post-pass so total page count is known)
	const np = pages.length;
	for (let p = 0; p < pages.length; p++) {
		const pg = pages[p];
		const pt = `Page ${p + 1} of ${np}`;
		const pw = textWidth(pt, 8, widthByCid, cidByCodePoint);
		pg.commands.push(`${C_MUTED[0].toFixed(3)} ${C_MUTED[1].toFixed(3)} ${C_MUTED[2].toFixed(3)} rg`);
		pg.commands.push(
			`BT /F1 8 Tf 1 0 0 1 ${(RIGHT_X - pw).toFixed(2)} ${(PAGE_MARGIN + 4).toFixed(2)} Tm <${encodeTextAsCidHex(pt, cidByCodePoint)}> Tj ET`
		);
		pg.commands.push('0 g');
	}

	return pages;
}

function buildToUnicodeCMap(cidByCodePoint: Map<number, number>) {
	const entries = [...cidByCodePoint.entries()]
		.map(([codePoint, cid]) => `<${toHex16(cid)}> <${toHex16(codePoint)}>`)
		.join('\n');

	return Buffer.from(
		`/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${cidByCodePoint.size} beginbfchar
${entries}
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end`,
		'utf8'
	);
}

function buildPdfDocument(
	pages: Page[],
	fontInfo: TtfInfo,
	cidByCodePoint: Map<number, number>,
	glyphByCid: Map<number, number>,
	widthByCid: Map<number, number>
) {
	const objects: Buffer[] = [];
	const pushObject = (body: Buffer | string) => {
		const buffer = typeof body === 'string' ? Buffer.from(body, 'binary') : body;
		objects.push(buffer);
		return objects.length;
	};
	const pushStream = (dictionary: string, stream: Buffer | string) => {
		const streamBuffer = typeof stream === 'string' ? Buffer.from(stream, 'binary') : stream;
		return pushObject(`${dictionary}\nstream\n${streamBuffer.toString('binary')}\nendstream`);
	};

	const fontFileId = pushStream(
		`<< /Length ${fontInfo.fontBytes.length} /Length1 ${fontInfo.fontBytes.length} >>`,
		fontInfo.fontBytes
	);
	const fontDescriptorId = pushObject(
		`<< /Type /FontDescriptor /FontName /F1 /Flags 32 /FontBBox [${fontInfo.xMin} ${fontInfo.yMin} ${fontInfo.xMax} ${fontInfo.yMax}] /ItalicAngle 0 /Ascent ${fontInfo.ascent} /Descent ${fontInfo.descent} /CapHeight ${fontInfo.ascent} /StemV 80 /FontFile2 ${fontFileId} 0 R >>`
	);

	const maxCid = Math.max(...glyphByCid.keys(), 0);
	const cidToGidMap = Buffer.alloc((maxCid + 1) * 2);
	for (let cid = 1; cid <= maxCid; cid += 1) {
		cidToGidMap.writeUInt16BE(glyphByCid.get(cid) ?? 0, cid * 2);
	}
	const cidToGidMapId = pushStream(`<< /Length ${cidToGidMap.length} >>`, cidToGidMap);

	const widths = Array.from({ length: maxCid }, (_, index) => widthByCid.get(index + 1) ?? 500).join(' ');
	const cidFontId = pushObject(
		`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /F1 /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${fontDescriptorId} 0 R /W [1 [${widths}]] /CIDToGIDMap ${cidToGidMapId} 0 R >>`
	);
	const toUnicode = buildToUnicodeCMap(cidByCodePoint);
	const toUnicodeId = pushStream(`<< /Length ${toUnicode.length} >>`, toUnicode);
	const type0FontId = pushObject(
		`<< /Type /Font /Subtype /Type0 /BaseFont /F1 /Encoding /Identity-H /DescendantFonts [${cidFontId} 0 R] /ToUnicode ${toUnicodeId} 0 R >>`
	);

	const pageIds: number[] = [];
	for (const page of pages) {
		const contents = Buffer.from(page.commands.join('\n'), 'utf8');
		const contentsId = pushStream(`<< /Length ${contents.length} >>`, contents);
		const pageId = pushObject(
			`<< /Type /Page /Parent PAGES_ID 0 R /MediaBox [0 0 ${A4_WIDTH} ${A4_HEIGHT}] /Contents ${contentsId} 0 R /Resources << /Font << /F1 ${type0FontId} 0 R >> >> >>`
		);
		pageIds.push(pageId);
	}

	const pagesId = pushObject(
		`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`
	);
	const catalogId = pushObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

	for (let index = 0; index < pageIds.length; index += 1) {
		objects[pageIds[index] - 1] = Buffer.from(
			objects[pageIds[index] - 1].toString('binary').replace('PAGES_ID', String(pagesId)),
			'binary'
		);
	}

	let offset = 0;
	const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n', 'binary')];
	offset += chunks[0].length;
	const xrefOffsets = [0];

	for (let index = 0; index < objects.length; index += 1) {
		xrefOffsets.push(offset);
		const objectBuffer = Buffer.from(`${index + 1} 0 obj\n`, 'binary');
		const endBuffer = Buffer.from('\nendobj\n', 'binary');
		chunks.push(objectBuffer, objects[index], endBuffer);
		offset += objectBuffer.length + objects[index].length + endBuffer.length;
	}

	const xrefOffset = offset;
	const xrefBody = xrefOffsets
		.map((entry, index) =>
			index === 0 ? '0000000000 65535 f ' : `${entry.toString().padStart(10, '0')} 00000 n `
		)
		.join('\n');
	chunks.push(
		Buffer.from(
			`xref\n0 ${xrefOffsets.length}\n${xrefBody}\ntrailer\n<< /Size ${xrefOffsets.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
			'binary'
		)
	);

	return Buffer.concat(chunks);
}

export async function generateInvoicePdf(snapshot: InvoicePdfSnapshot) {
	const fontInfo = await loadFontInfo();
	const strings = [
		'ФАКТУРА',
		'(ОРИГИНАЛ)', '(ЧЕРНОВА)',
		'НЕПЛАТЕНА', 'ЧЕРНОВА',
		'Номер:', 'Дата:', 'Падеж:',
		'ДОСТАВЧИК', 'КЛИЕНТ',
		'ЕИК/БУЛСТАТ:', 'ДДС №:', 'Адрес:', 'МОЛ:',
		'Описание', 'ДДС %', 'Сума',
		'Сума без ДДС:',
		'Общо с ДДС:',
		'Платено:',
		'Остатък за плащане:',
		'ДАННИ ЗА ПЛАЩАНЕ',
		'БАНКА', 'IBAN', 'BIC/SWIFT',
		'ОСНОВАНИЕ ЗА ПЛАЩАНЕ',
		'Плащане по фактура №',
		'Краен срок: ',
		'Page 1 of 1', 'Page 1 of 2', 'Page 2 of 2',
		'—',
		formatPaymentMethod(snapshot.paymentMethod),
		snapshot.invoiceNumber,
		snapshot.issueDate,
		snapshot.dueDate ?? '—',
		snapshot.company.legalName,
		snapshot.company.registrationNumber ?? '',
		snapshot.company.vatNumber ?? '',
		snapshot.company.address ?? '',
		snapshot.company.molName ?? '',
		snapshot.company.email ?? '',
		snapshot.company.phone ?? '',
		snapshot.company.website ?? '',
		snapshot.client.legalName,
		snapshot.client.registrationNumber ?? '',
		snapshot.client.vatNumber ?? '',
		snapshot.client.address ?? '',
		snapshot.client.molName ?? '',
		snapshot.bankName ?? '',
		snapshot.bankIban ?? '',
		snapshot.bankBic ?? '',
		`Плащане по фактура №${snapshot.invoiceNumber}`,
		snapshot.dueDate ? `Краен срок: ${snapshot.dueDate}` : '',
		`ДДС ${(snapshot.vatRateBasisPoints / 100).toFixed(0)}%:`,
		`${(snapshot.vatRateBasisPoints / 100).toFixed(0)}%`,
		'h ', 'min', ' — ',
		...snapshot.projectGroups.flatMap((group) => [
			group.projectName,
			formatMoney(group.netAmountCents, snapshot.currency),
			...group.tasks.flatMap((task) => [
				task.description,
				task.hours != null ? formatHours(task.hours) : '',
				formatMoney(task.amountCents, snapshot.currency)
			])
		]),
		formatMoney(snapshot.netTotalCents, snapshot.currency),
		formatMoney(snapshot.vatTotalCents, snapshot.currency),
		formatMoney(snapshot.grossTotalCents, snapshot.currency),
		formatMoney(snapshot.paidTotalCents ?? 0, snapshot.currency),
		formatMoney(Math.max(0, snapshot.grossTotalCents - (snapshot.paidTotalCents ?? 0)), snapshot.currency)
	];
	const { cidByCodePoint, glyphByCid, widthByCid } = buildFontMaps(fontInfo, strings);
	const pages = renderInvoicePages(snapshot, cidByCodePoint, widthByCid);
	return buildPdfDocument(pages, fontInfo, cidByCodePoint, glyphByCid, widthByCid);
}
