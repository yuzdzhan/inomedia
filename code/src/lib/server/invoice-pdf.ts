import { readFile } from 'node:fs/promises';
import path from 'node:path';

type InvoicePdfParty = {
	legalName: string;
	registrationNumber?: string | null;
	vatNumber?: string | null;
	address?: string | null;
	molName?: string | null;
};

type InvoicePdfLine = {
	description: string;
	amountCents: number;
	projectName: string;
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
	lines: InvoicePdfLine[];
	netTotalCents: number;
	vatTotalCents: number;
	grossTotalCents: number;
	vatRateBasisPoints: number;
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
const FONT_PATH = path.resolve(process.cwd(), 'static/fonts/Lato-Regular.ttf');

// Colors: RGB 0–1
const C_PURPLE: readonly [number, number, number] = [0.310, 0.216, 0.541];   // #4f378a
const C_LAVENDER: readonly [number, number, number] = [0.820, 0.760, 0.960]; // soft lavender on purple
const C_WHITE: readonly [number, number, number] = [1.0, 1.0, 1.0];
const C_MUTED: readonly [number, number, number] = [0.435, 0.451, 0.502];    // #6f7380
const C_LIGHT_BG: readonly [number, number, number] = [0.976, 0.980, 0.988]; // #f9fafb
const C_BORDER: readonly [number, number, number] = [0.894, 0.902, 0.918];   // #e5e7eb

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

function encodePdfString(value: string) {
	return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function formatMoney(valueCents: number, currency: string) {
	return `${(valueCents / 100).toFixed(2)} ${currency}`;
}

function formatPaymentMethod(value: string) {
	return value === 'cash' ? 'В брой' : 'Банков превод';
}

function formatDateRange(from: string | null, to: string | null) {
	if (from && to) return `${from} - ${to}`;
	if (from) return from;
	if (to) return to;
	return 'Няма';
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
		})();
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

	function ensureSpace(height: number) {
		if (page.y - height < PAGE_MARGIN) {
			page = createPage();
			pages.push(page);
		}
	}

	function rtext(
		str: string,
		rightX: number,
		y: number,
		size: number,
		color?: readonly [number, number, number]
	) {
		const w = textWidth(str, size, widthByCid, cidByCodePoint);
		addText(page, str, rightX - w, y, size, cidByCodePoint, color);
	}

	// ── Header bar ───────────────────────────────────────────────────────────────
	const HEADER_H = 66;
	addRect(page, 0, A4_HEIGHT - HEADER_H, A4_WIDTH, HEADER_H, C_PURPLE);

	addText(page, 'ФАКТУРА', PAGE_MARGIN, A4_HEIGHT - 26, 18, cidByCodePoint, C_WHITE);
	addText(page, snapshot.invoiceNumber, PAGE_MARGIN, A4_HEIGHT - 45, 10, cidByCodePoint, C_LAVENDER);

	rtext(snapshot.company.legalName, RIGHT_X, A4_HEIGHT - 28, 11, C_WHITE);
	const regLabel = snapshot.company.vatNumber
		? `ДДС: ${snapshot.company.vatNumber}`
		: snapshot.company.registrationNumber
			? `ЕИК: ${snapshot.company.registrationNumber}`
			: '';
	if (regLabel) {
		rtext(regLabel, RIGHT_X, A4_HEIGHT - 44, 9, C_LAVENDER);
	}

	// ── Metadata row ─────────────────────────────────────────────────────────────
	page.y = A4_HEIGHT - HEADER_H - 22;

	const metaColW = CONTENT_W / 4;
	const metaItems: [string, string][] = [
		['ДАТА НА ИЗДАВАНЕ', snapshot.issueDate],
		['ПАДЕЖ', snapshot.dueDate ?? 'Няма'],
		['ПЕРИОД', formatDateRange(snapshot.servicePeriodFrom, snapshot.servicePeriodTo)],
		['ПЛАЩАНЕ', formatPaymentMethod(snapshot.paymentMethod)]
	];

	for (let i = 0; i < metaItems.length; i++) {
		const mx = PAGE_MARGIN + i * metaColW;
		const [label, value] = metaItems[i];
		addText(page, label, mx, page.y + 13, 7, cidByCodePoint, C_MUTED);
		addText(page, value, mx, page.y, 9, cidByCodePoint);
	}
	page.y -= 16;

	// ── Divider ──────────────────────────────────────────────────────────────────
	addLine(page, PAGE_MARGIN, page.y, RIGHT_X, page.y, C_BORDER);
	page.y -= 18;

	// ── Party columns ────────────────────────────────────────────────────────────
	const COL_L = PAGE_MARGIN;
	const COL_MID = A4_WIDTH / 2 + 8;
	const COL_W = A4_WIDTH / 2 - PAGE_MARGIN - 8;

	addText(page, 'ДОСТАВЧИК', COL_L, page.y, 7, cidByCodePoint, C_MUTED);
	addText(page, 'ПОЛУЧАТЕЛ', COL_MID, page.y, 7, cidByCodePoint, C_MUTED);
	page.y -= 13;

	const partyStartY = page.y;

	function drawParty(party: InvoicePdfParty, x: number): number {
		let y = partyStartY;

		addText(page, party.legalName, x, y, 11, cidByCodePoint);
		y -= 15;

		function fieldRow(label: string, value: string | null | undefined): void {
			if (!value) return;
			const labelW = textWidth(label, 9, widthByCid, cidByCodePoint);
			addText(page, label, x, y, 9, cidByCodePoint, C_MUTED);
			const lines = wrapText(value, COL_W - labelW, 9, widthByCid, cidByCodePoint);
			addText(page, lines[0] ?? '', x + labelW, y, 9, cidByCodePoint);
			y -= 13;
			for (let i = 1; i < lines.length; i++) {
				addText(page, lines[i] ?? '', x, y, 9, cidByCodePoint);
				y -= 13;
			}
		}

		fieldRow('ЕИК: ', party.registrationNumber);
		fieldRow('ДДС: ', party.vatNumber);
		fieldRow('Адрес: ', party.address);
		fieldRow('МОЛ: ', party.molName);
		return y;
	}

	const leftBottom = drawParty(snapshot.company, COL_L);
	const rightBottom = drawParty(snapshot.client, COL_MID);
	page.y = Math.min(leftBottom, rightBottom) - 14;

	// ── Divider ──────────────────────────────────────────────────────────────────
	addLine(page, PAGE_MARGIN, page.y, RIGHT_X, page.y, C_BORDER);
	page.y -= 4;

	// ── Line items table ─────────────────────────────────────────────────────────
	const DESC_COL = PAGE_MARGIN;
	const PROJ_COL = 336;
	const TABLE_HDR_H = 22;

	ensureSpace(TABLE_HDR_H + 20);
	addRect(page, PAGE_MARGIN, page.y - TABLE_HDR_H, CONTENT_W, TABLE_HDR_H, C_LIGHT_BG);
	addText(page, 'ОПИСАНИЕ', DESC_COL + 4, page.y - 14, 8, cidByCodePoint, C_MUTED);
	addText(page, 'ПРОЕКТ', PROJ_COL + 4, page.y - 14, 8, cidByCodePoint, C_MUTED);
	rtext('СУМА', RIGHT_X, page.y - 14, 8, C_MUTED);
	page.y -= TABLE_HDR_H;

	for (const line of snapshot.lines) {
		const descLines = wrapText(line.description, PROJ_COL - DESC_COL - 10, 10, widthByCid, cidByCodePoint);
		const projLines = wrapText(line.projectName, RIGHT_X - PROJ_COL - 65, 10, widthByCid, cidByCodePoint);
		const rowLineCount = Math.max(descLines.length, projLines.length);
		const rowH = rowLineCount * 14 + 10;

		ensureSpace(rowH + 4);

		const rowTopY = page.y - 5;
		for (let i = 0; i < descLines.length; i++) {
			addText(page, descLines[i] ?? '', DESC_COL + 4, rowTopY - i * 14, 10, cidByCodePoint);
		}
		for (let i = 0; i < projLines.length; i++) {
			addText(page, projLines[i] ?? '', PROJ_COL + 4, rowTopY - i * 14, 10, cidByCodePoint, C_MUTED);
		}
		rtext(formatMoney(line.amountCents, snapshot.currency), RIGHT_X, rowTopY, 10);

		page.y -= rowH;
		addLine(page, PAGE_MARGIN, page.y + 2, RIGHT_X, page.y + 2, C_BORDER);
		page.y -= 2;
	}

	// ── Totals section ───────────────────────────────────────────────────────────
	page.y -= 12;
	const TOTALS_L = 360;

	function totalsRow(label: string, value: string, size = 10) {
		ensureSpace(size + 8);
		addText(page, label, TOTALS_L, page.y, size, cidByCodePoint, C_MUTED);
		rtext(value, RIGHT_X, page.y, size);
		page.y -= size + 8;
	}

	totalsRow('Нетна сума:', formatMoney(snapshot.netTotalCents, snapshot.currency));
	totalsRow(`ДДС (${(snapshot.vatRateBasisPoints / 100).toFixed(0)}%):`, formatMoney(snapshot.vatTotalCents, snapshot.currency));

	ensureSpace(20);
	addLine(page, TOTALS_L, page.y + 4, RIGHT_X, page.y + 4, C_BORDER);
	page.y -= 4;

	ensureSpace(26);
	addText(page, 'ОБЩО:', TOTALS_L, page.y, 13, cidByCodePoint);
	rtext(formatMoney(snapshot.grossTotalCents, snapshot.currency), RIGHT_X, page.y, 13);
	page.y -= 30;

	// ── Footer ───────────────────────────────────────────────────────────────────
	ensureSpace(24);
	addLine(page, PAGE_MARGIN, page.y + 10, RIGHT_X, page.y + 10, C_BORDER);
	addText(
		page,
		'Документът е генериран и запазен като неизменима версия при издаване.',
		PAGE_MARGIN,
		page.y,
		8,
		cidByCodePoint,
		C_MUTED
	);

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
		'ДАТА НА ИЗДАВАНЕ',
		'ПАДЕЖ',
		'ПЕРИОД',
		'ПЛАЩАНЕ',
		'ДОСТАВЧИК',
		'ПОЛУЧАТЕЛ',
		'ЕИК: ',
		'ДДС: ',
		'Адрес: ',
		'МОЛ: ',
		'ОПИСАНИЕ',
		'ПРОЕКТ',
		'СУМА',
		'Нетна сума:',
		'ОБЩО:',
		'Документът е генериран и запазен като неизменима версия при издаване.',
		'Няма',
		formatPaymentMethod(snapshot.paymentMethod),
		snapshot.invoiceNumber,
		snapshot.issueDate,
		snapshot.dueDate ?? 'Няма',
		formatDateRange(snapshot.servicePeriodFrom, snapshot.servicePeriodTo),
		snapshot.company.legalName,
		snapshot.company.registrationNumber ?? '',
		snapshot.company.vatNumber ?? '',
		snapshot.company.address ?? '',
		snapshot.company.molName ?? '',
		snapshot.client.legalName,
		snapshot.client.registrationNumber ?? '',
		snapshot.client.vatNumber ?? '',
		snapshot.client.address ?? '',
		snapshot.client.molName ?? '',
		...snapshot.lines.flatMap((line) => [
			line.description,
			line.projectName,
			formatMoney(line.amountCents, snapshot.currency)
		]),
		formatMoney(snapshot.netTotalCents, snapshot.currency),
		formatMoney(snapshot.vatTotalCents, snapshot.currency),
		formatMoney(snapshot.grossTotalCents, snapshot.currency),
		`ДДС (${(snapshot.vatRateBasisPoints / 100).toFixed(0)}%):`
	];
	const { cidByCodePoint, glyphByCid, widthByCid } = buildFontMaps(fontInfo, strings);
	const pages = renderInvoicePages(snapshot, cidByCodePoint, widthByCid);
	return buildPdfDocument(pages, fontInfo, cidByCodePoint, glyphByCid, widthByCid);
}
