// Dependency-free A4 invoice PDF writer.
//
// No PDF library: Helvetica core fonts with real AFM widths for accurate wrapping,
// a wrapped item table that repeats its header on every page and never splits a
// row, plus optional JPEG logo/signature embedding (DCTDecode). Runs inside a free
// Vercel serverless function with zero dependencies.
//
// Three templates share one layout engine and differ in header treatment and rules:
//   classic - bordered table, boxed header, formal
//   modern  - accent band across the top, filled header row, airy
//   minimal - hairline rules only, no fills

import type { RenderDoc } from './model.ts';

const W = 595.28;
const H = 841.89;
const ML = 42;
const MR = 42;
const MT = 40;
const MB = 46;
const CW = W - ML - MR;

type RGB = readonly [number, number, number];
const INK: RGB = [0.106, 0.141, 0.251]; // #1B2440
const MUTED: RGB = [0.42, 0.45, 0.5];
const RULE: RGB = [0.82, 0.83, 0.86];
const SOFT: RGB = [0.957, 0.957, 0.969];
const WHITE: RGB = [1, 1, 1];

type FontKey = 'R' | 'B';
const FONT_ID: Record<FontKey, string> = { R: 'F1', B: 'F2' };

const n556 = (n: number) => Array<number>(n).fill(556);
const WR = [
	278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, ...n556(10), 278, 278, 584, 584, 584, 556, 1015,
	667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
	278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278,
	556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];
const WB = [
	278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, ...n556(10), 333, 333, 584, 584, 584, 611, 975,
	722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
	333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333,
	611, 556, 778, 556, 556, 500, 389, 280, 389, 584
];
// WinAnsi extras actually used by this app: [code, regular, bold]
const SPECIAL: Record<string, [number, number, number]> = {
	'\u2022': [0x95, 350, 350],
	'\u2013': [0x96, 556, 556],
	'\u2014': [0x97, 1000, 1000],
	'\u2018': [0x91, 222, 278],
	'\u2019': [0x92, 222, 278],
	'\u201C': [0x93, 333, 500],
	'\u201D': [0x94, 333, 500],
	'\u2026': [0x85, 1000, 1000],
	'\u20AC': [0x80, 556, 556],
	'\u00A3': [0xa3, 556, 556]
};
// The rupee sign has no WinAnsi code point, so it is spelled out.
const REPLACE: Record<string, string> = {
	'\u20B9': 'Rs.',
	'\u00A0': ' ',
	'\u2212': '-',
	'\u2011': '-',
	'\u2010': '-',
	'\u2192': '->'
};

export function cleanText(s: string): string {
	let out = '';
	for (const ch of (s ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ')) {
		const c = ch.codePointAt(0)!;
		const rep = REPLACE[ch];
		if (rep !== undefined) out += rep;
		else if (ch === '\n' || (c >= 32 && c < 127) || SPECIAL[ch] || (c > 0xa0 && c <= 0xff)) out += ch;
		else {
			const base = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
			if (base !== ch && /^[\x20-\x7e]+$/.test(base)) out += base;
		}
	}
	return out;
}

function charW(ch: string, font: FontKey): number {
	const c = ch.charCodeAt(0);
	if (c >= 32 && c < 127) return (font === 'B' ? WB : WR)[c - 32];
	const sp = SPECIAL[ch];
	if (sp) return font === 'B' ? sp[2] : sp[1];
	return 556;
}

export function textWidth(s: string, font: FontKey, size: number): number {
	let w = 0;
	for (const ch of cleanText(s)) w += charW(ch, font);
	return (w / 1000) * size;
}

function esc(s: string): string {
	let out = '';
	for (const ch of s) {
		const c = ch.charCodeAt(0);
		if (ch === '\\' || ch === '(' || ch === ')') out += '\\' + ch;
		else if (c >= 32 && c < 127) out += ch;
		else {
			const code = SPECIAL[ch]?.[0] ?? (c <= 0xff ? c : 63);
			out += '\\' + code.toString(8).padStart(3, '0');
		}
	}
	return out;
}

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();
const rgb = (c: RGB) => c.map(f2).join(' ');

function hexToRgb(hex: string): RGB {
	const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
	if (!m) return [0.31, 0.275, 0.898];
	const v = parseInt(m[1], 16);
	return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** Greedy word wrap; long unbreakable tokens are split by character. */
export function wrap(text: string, font: FontKey, size: number, maxW: number): string[] {
	const out: string[] = [];
	for (const para of cleanText(text).split('\n')) {
		let cur = '';
		for (const tok of para.split(/\s+/)) {
			if (!tok) continue;
			const candidate = cur ? `${cur} ${tok}` : tok;
			if (textWidth(candidate, font, size) <= maxW) {
				cur = candidate;
				continue;
			}
			if (cur) out.push(cur);
			if (textWidth(tok, font, size) <= maxW) {
				cur = tok;
				continue;
			}
			let rest = tok;
			while (rest && textWidth(rest, font, size) > maxW) {
				let n = rest.length;
				while (n > 1 && textWidth(rest.slice(0, n), font, size) > maxW) n--;
				out.push(rest.slice(0, n));
				rest = rest.slice(n);
			}
			cur = rest;
		}
		out.push(cur);
	}
	return out.length ? out : [''];
}

interface XObject {
	id: number;
	name: string;
}

interface JpegImage {
	bytes: Uint8Array;
	width: number;
	height: number;
	gray: boolean;
}

/** Reads width/height/components out of a JPEG so it can be embedded as DCTDecode. */
export function parseJpeg(bytes: Uint8Array): JpegImage | null {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
	let i = 2;
	while (i < bytes.length - 9) {
		if (bytes[i] !== 0xff) {
			i++;
			continue;
		}
		const marker = bytes[i + 1];
		const len = (bytes[i + 2] << 8) | bytes[i + 3];
		// SOF0..SOF15 except DHT(c4) DAC(cc) and RSTn
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			const height = (bytes[i + 5] << 8) | bytes[i + 6];
			const width = (bytes[i + 7] << 8) | bytes[i + 8];
			const comps = bytes[i + 9];
			return { bytes, width, height, gray: comps === 1 };
		}
		i += 2 + len;
	}
	return null;
}

function decodeDataUrlJpeg(dataUrl: string): JpegImage | null {
	if (!dataUrl || !/^data:image\/jpe?g;base64,/i.test(dataUrl)) return null;
	try {
		const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
		const bin = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64') : null;
		if (!bin) return null;
		return parseJpeg(new Uint8Array(bin));
	} catch {
		return null;
	}
}

class Page {
	ops: string[] = [];
	images: XObject[] = [];
}

class Writer {
	pages: Page[] = [];
	pg!: Page;
	y = MT;
	constructor() {
		this.newPage();
	}
	newPage() {
		this.pg = new Page();
		this.pages.push(this.pg);
		this.y = MT;
	}
	room(h: number) {
		if (this.y + h > H - MB) {
			this.newPage();
			return true;
		}
		return false;
	}
	text(s: string, x: number, baseline: number, size: number, font: FontKey, color: RGB) {
		const t = cleanText(s);
		if (!t) return;
		this.pg.ops.push(`BT /${FONT_ID[font]} ${f2(size)} Tf ${rgb(color)} rg ${f2(x)} ${f2(H - baseline)} Td (${esc(t)}) Tj ET`);
	}
	right(s: string, xRight: number, baseline: number, size: number, font: FontKey, color: RGB) {
		this.text(s, xRight - textWidth(s, font, size), baseline, size, font, color);
	}
	center(s: string, cx: number, baseline: number, size: number, font: FontKey, color: RGB) {
		this.text(s, cx - textWidth(s, font, size) / 2, baseline, size, font, color);
	}
	fill(x: number, y: number, w: number, h: number, color: RGB) {
		this.pg.ops.push(`${rgb(color)} rg ${f2(x)} ${f2(H - y - h)} ${f2(w)} ${f2(h)} re f`);
	}
	rect(x: number, y: number, w: number, h: number, color: RGB, lw = 0.6) {
		this.pg.ops.push(`${rgb(color)} RG ${f2(lw)} w ${f2(x)} ${f2(H - y - h)} ${f2(w)} ${f2(h)} re S`);
	}
	hline(x1: number, x2: number, y: number, color: RGB, lw = 0.6) {
		this.pg.ops.push(`${rgb(color)} RG ${f2(lw)} w ${f2(x1)} ${f2(H - y)} m ${f2(x2)} ${f2(H - y)} l S`);
	}
	image(name: string, id: number, x: number, y: number, w: number, h: number) {
		if (!this.pg.images.some((im) => im.name === name)) this.pg.images.push({ id, name });
		this.pg.ops.push(`q ${f2(w)} 0 0 ${f2(h)} ${f2(x)} ${f2(H - y - h)} cm /${name} Do Q`);
	}
	/** Paragraph with page breaks. Returns the new y. */
	para(text: string, x: number, w: number, size: number, lh: number, font: FontKey = 'R', color: RGB = INK) {
		for (const line of wrap(text, font, size, w)) {
			this.room(lh);
			this.text(line, x, this.y + size, size, font, color);
			this.y += lh;
		}
	}
}

interface Col {
	key: keyof RenderDoc['rows'][number];
	label: string;
	w: number;
	align: 'left' | 'right' | 'center';
}

function buildColumns(doc: RenderDoc): Col[] {
	const cols: Col[] = [{ key: 'sn', label: '#', w: 22, align: 'left' }];
	cols.push({ key: 'description', label: 'Description', w: 0, align: 'left' });
	if (doc.hasHsnColumn) cols.push({ key: 'hsn', label: 'HSN/SAC', w: 52, align: 'left' });
	cols.push({ key: 'qty', label: 'Qty', w: 38, align: 'right' });
	cols.push({ key: 'unit', label: 'Unit', w: 34, align: 'left' });
	cols.push({ key: 'rate', label: 'Rate', w: 62, align: 'right' });
	if (doc.hasDiscountColumn) cols.push({ key: 'discount', label: 'Disc.', w: 44, align: 'right' });
	cols.push({ key: 'taxRate', label: 'Tax', w: 36, align: 'right' });
	cols.push({ key: 'amount', label: 'Amount', w: 74, align: 'right' });
	const fixed = cols.reduce((s, c) => s + c.w, 0);
	cols[1].w = CW - fixed;
	return cols;
}

/** Renders one invoice/quotation to PDF bytes. */
export function renderInvoicePdf(doc: RenderDoc, now = new Date()): Uint8Array {
	const accent = hexToRgb(doc.accent);
	const wr = new Writer();
	const tpl = doc.template;

	// Images are embedded only when they are JPEG data URLs; the client converts
	// PNG/SVG logos to JPEG before posting, so this stays simple and dependency free.
	const logo = decodeDataUrlJpeg(doc.business.logo);
	const sign = decodeDataUrlJpeg(doc.signature);
	const imageObjs: Array<{ name: string; img: JpegImage; id: number }> = [];
	if (logo) imageObjs.push({ name: 'ImLogo', img: logo, id: 0 });
	if (sign) imageObjs.push({ name: 'ImSign', img: sign, id: 0 });
	const imageId = (name: string) => imageObjs.findIndex((o) => o.name === name);

	// ---------------- header ----------------
	if (tpl === 'modern') {
		wr.fill(0, 0, W, 8, accent);
		wr.y = MT + 2;
	}

	const headTop = wr.y;
	let leftX = ML;
	if (logo) {
		const maxH = 46;
		const maxW = 120;
		const scale = Math.min(maxW / logo.width, maxH / logo.height);
		const lw = logo.width * scale;
		const lh = logo.height * scale;
		wr.image('ImLogo', 0, ML, headTop, lw, lh);
		leftX = ML + lw + 12;
	}

	wr.text(doc.business.name, leftX, headTop + 14, 15, 'B', tpl === 'minimal' ? INK : accent);
	let by = headTop + 28;
	for (const line of doc.business.addressLines.slice(0, 4)) {
		wr.text(line, leftX, by, 8.5, 'R', MUTED);
		by += 11;
	}
	for (const line of doc.business.contactLines) {
		wr.text(line, leftX, by, 8.5, 'R', MUTED);
		by += 11;
	}
	if (doc.business.gstin) {
		wr.text(`GSTIN: ${doc.business.gstin}`, leftX, by, 8.5, 'B', INK);
		by += 11;
	}
	if (doc.business.pan) {
		wr.text(`PAN: ${doc.business.pan}`, leftX, by, 8.5, 'R', MUTED);
		by += 11;
	}

	// Document title block (right aligned)
	wr.right(doc.title, W - MR, headTop + 16, 19, 'B', INK);
	let my = headTop + 34;
	for (const m of doc.meta) {
		wr.right(m.label, W - MR - 112, my, 8.5, 'R', MUTED);
		wr.right(m.value, W - MR, my, 9, 'B', INK);
		my += 13;
	}

	wr.y = Math.max(by, my) + 10;
	if (tpl === 'classic') {
		wr.hline(ML, ML + CW, wr.y, accent, 1.4);
		wr.y += 14;
	} else if (tpl === 'modern') {
		wr.fill(ML, wr.y, CW, 1.6, accent);
		wr.y += 14;
	} else {
		wr.hline(ML, ML + CW, wr.y, RULE, 0.6);
		wr.y += 14;
	}

	// ---------------- bill to ----------------
	const billTop = wr.y;
	const colW = (CW - 16) / 2;
	wr.text('Bill to', ML, billTop + 9, 8.5, 'B', MUTED);
	let cy = billTop + 24;
	const clientTitle = doc.client.company || doc.client.name || 'Client';
	wr.text(clientTitle, ML, cy, 11, 'B', INK);
	cy += 14;
	if (doc.client.company && doc.client.name) {
		wr.text(doc.client.name, ML, cy, 9, 'R', MUTED);
		cy += 11;
	}
	for (const line of wrap(doc.client.addressLines.join('\n'), 'R', 9, colW)) {
		wr.text(line, ML, cy, 9, 'R', MUTED);
		cy += 11;
	}
	for (const line of doc.client.contactLines) {
		wr.text(line, ML, cy, 9, 'R', MUTED);
		cy += 11;
	}
	if (doc.client.gstin) {
		wr.text(`GSTIN: ${doc.client.gstin}`, ML, cy, 9, 'B', INK);
		cy += 11;
	}
	if (doc.client.state) {
		wr.text(`State: ${doc.client.state}`, ML, cy, 9, 'R', MUTED);
		cy += 11;
	}

	// Supply summary on the right
	const rx = ML + colW + 16;
	wr.text(doc.interState ? 'Inter-state supply (IGST)' : 'Intra-state supply (CGST + SGST)', rx, billTop + 9, 8.5, 'B', MUTED);
	let sy = billTop + 24;
	if (doc.business.state) {
		wr.text(`Supplier state: ${doc.business.state}`, rx, sy, 9, 'R', MUTED);
		sy += 11;
	}
	const pos = doc.meta.find((m) => m.label === 'Place of supply');
	if (pos) {
		wr.text(`Place of supply: ${pos.value}`, rx, sy, 9, 'R', MUTED);
		sy += 11;
	}
	if (doc.footerNote) {
		wr.text(doc.footerNote, rx, sy, 9, 'B', INK);
		sy += 11;
	}

	wr.y = Math.max(cy, sy) + 8;

	// ---------------- item table ----------------
	const cols = buildColumns(doc);
	const PAD = 5;
	const SIZE = 8.8;
	const LH = 11.5;
	const headH = 20;

	const drawTableHeader = () => {
		if (tpl === 'minimal') {
			wr.hline(ML, ML + CW, wr.y, INK, 0.8);
		} else {
			wr.fill(ML, wr.y, CW, headH, tpl === 'modern' ? accent : SOFT);
		}
		let x = ML;
		for (const c of cols) {
			const color: RGB = tpl === 'modern' ? WHITE : INK;
			const baseline = wr.y + headH - 7;
			if (c.align === 'right') wr.right(c.label, x + c.w - PAD, baseline, 8.2, 'B', color);
			else wr.text(c.label, x + PAD, baseline, 8.2, 'B', color);
			if (tpl === 'classic') wr.rect(x, wr.y, c.w, headH, RULE);
			x += c.w;
		}
		wr.y += headH;
		if (tpl === 'minimal') wr.hline(ML, ML + CW, wr.y, RULE, 0.6);
	};

	// Pre-wrap every row so a row is never split across a page break.
	const laid = doc.rows.map((row) => {
		const cells = cols.map((c) => wrap(String(row[c.key] ?? ''), 'R', SIZE, c.w - 2 * PAD));
		const rowH = Math.max(...cells.map((l) => l.length)) * LH + 2 * PAD;
		return { cells, rowH };
	});

	// Keep the header with at least one row.
	wr.room(headH + (laid[0]?.rowH ?? 24));
	drawTableHeader();

	laid.forEach(({ cells, rowH }, ri) => {
		if (wr.y + rowH > H - MB) {
			wr.newPage();
			drawTableHeader();
		}
		if (tpl !== 'minimal' && ri % 2 === 1) wr.fill(ML, wr.y, CW, rowH, [0.985, 0.985, 0.99]);
		let x = ML;
		cells.forEach((linesArr, ci) => {
			const c = cols[ci];
			linesArr.forEach((line, li) => {
				const baseline = wr.y + PAD + li * LH + SIZE;
				if (c.align === 'right') wr.right(line, x + c.w - PAD, baseline, SIZE, 'R', INK);
				else wr.text(line, x + PAD, baseline, SIZE, 'R', INK);
			});
			if (tpl === 'classic') wr.rect(x, wr.y, c.w, rowH, RULE);
			x += c.w;
		});
		if (tpl !== 'classic') wr.hline(ML, ML + CW, wr.y + rowH, RULE, 0.4);
		wr.y += rowH;
	});
	wr.y += 8;

	// ---------------- totals + tax summary ----------------
	const totalsW = 210;
	const taxW = CW - totalsW - 16;
	const totalsRows = doc.totals.length;
	const taxRows = doc.taxRows.length;
	// Totals rows are 15pt, the strong (grand total) row is 24pt.
	const strongRows = doc.totals.filter((t) => t.strong).length;
	const blockH = Math.max((totalsRows - strongRows) * 15 + strongRows * 24 + 16, taxRows * 14 + 34) + 8;
	// Keep the totals block together with the amount-in-words strip beneath it.
	wr.room(blockH + 44);

	const blockTop = wr.y;

	// Tax summary table (left)
	if (doc.taxRows.length) {
		const taxCols = doc.interState
			? [
					{ label: 'Rate', w: 42, align: 'left' as const, key: 'rate' as const },
					{ label: 'Taxable value', w: taxW - 42 - 80, align: 'right' as const, key: 'taxable' as const },
					{ label: 'IGST', w: 80, align: 'right' as const, key: 'igst' as const }
				]
			: [
					{ label: 'Rate', w: 42, align: 'left' as const, key: 'rate' as const },
					{ label: 'Taxable value', w: taxW - 42 - 136, align: 'right' as const, key: 'taxable' as const },
					{ label: 'CGST', w: 68, align: 'right' as const, key: 'cgst' as const },
					{ label: 'SGST', w: 68, align: 'right' as const, key: 'sgst' as const }
				];
		wr.text('Tax summary', ML, blockTop + 9, 8.5, 'B', MUTED);
		let ty = blockTop + 16;
		if (tpl !== 'minimal') wr.fill(ML, ty, taxW, 15, SOFT);
		let tx = ML;
		for (const c of taxCols) {
			if (c.align === 'right') wr.right(c.label, tx + c.w - 4, ty + 10.5, 7.8, 'B', INK);
			else wr.text(c.label, tx + 4, ty + 10.5, 7.8, 'B', INK);
			tx += c.w;
		}
		ty += 15;
		wr.hline(ML, ML + taxW, ty, RULE, 0.5);
		for (const row of doc.taxRows) {
			let cx2 = ML;
			for (const c of taxCols) {
				const val = String(row[c.key] ?? '');
				if (c.align === 'right') wr.right(val, cx2 + c.w - 4, ty + 10, 8.2, 'R', INK);
				else wr.text(val, cx2 + 4, ty + 10, 8.2, 'R', INK);
				cx2 += c.w;
			}
			ty += 14;
			wr.hline(ML, ML + taxW, ty, RULE, 0.3);
		}
	}

	// Totals (right)
	const tRight = ML + CW;
	const tLeft = tRight - totalsW;
	let qy = blockTop + 16;
	for (const row of doc.totals) {
		if (row.strong) {
			wr.fill(tLeft, qy - 3, totalsW, 20, tpl === 'minimal' ? SOFT : accent);
			wr.text(row.label, tLeft + 8, qy + 11, 10, 'B', tpl === 'minimal' ? INK : WHITE);
			wr.right(row.value, tRight - 8, qy + 11, 11, 'B', tpl === 'minimal' ? INK : WHITE);
			qy += 24;
		} else {
			wr.text(row.label, tLeft + 8, qy + 10, 9, 'R', MUTED);
			wr.right(row.value, tRight - 8, qy + 10, 9, 'R', INK);
			qy += 15;
		}
	}

	wr.y = Math.max(qy, blockTop + blockH) + 2;

	// ---------------- amount in words ----------------
	wr.room(22 + wrap(doc.amountWords, 'B', 9.5, CW - 10).length * 12);
	wr.hline(ML, ML + CW, wr.y, RULE, 0.5);
	wr.y += 10;
	wr.text('Amount in words', ML, wr.y + 8, 8.2, 'B', MUTED);
	wr.y += 12;
	wr.para(doc.amountWords, ML, CW - 10, 9.5, 12, 'B', INK);
	wr.y += 10;

	// ---------------- bank, notes, terms, signature ----------------
	// Measure the block instead of reserving a fixed height, so a footer that does
	// fit on the current page is not pushed onto a nearly empty extra page.
	const halfW = (CW - 20) / 2;
	const leftH =
		(doc.bank.length ? 22 + doc.bank.length * 12 : 0) +
		(doc.upi ? 14 : 0) +
		(doc.notes ? 18 + wrap(doc.notes, 'R', 8.5, halfW).length * 11 : 0);
	const termsH = doc.terms ? 22 + wrap(doc.terms, 'R', 8.5, halfW).length * 11 + 6 : 0;
	const signH = (sign ? Math.min(40, (sign.height * Math.min(110 / sign.width, 40 / sign.height)) || 40) + 4 : 26) + 30;
	wr.room(Math.max(leftH, termsH + signH) + 6);
	const footTop = wr.y;

	let fy = footTop;
	if (doc.bank.length) {
		wr.text('Bank details', ML, fy + 9, 8.5, 'B', MUTED);
		fy += 22;
		for (const b of doc.bank) {
			wr.text(`${b.label}:`, ML, fy, 8.5, 'R', MUTED);
			wr.text(b.value, ML + 74, fy, 8.5, 'B', INK);
			fy += 12;
		}
	}
	if (doc.upi) {
		wr.text(`UPI: ${doc.upi.id}`, ML, fy, 8.5, 'B', INK);
		fy += 14;
	}
	if (doc.notes) {
		wr.text('Notes', ML, fy + 6, 8.5, 'B', MUTED);
		fy += 18;
		for (const line of wrap(doc.notes, 'R', 8.5, halfW)) {
			wr.text(line, ML, fy, 8.5, 'R', MUTED);
			fy += 11;
		}
	}

	let ty2 = footTop;
	const rx2 = ML + halfW + 20;
	if (doc.terms) {
		wr.text('Terms and conditions', rx2, ty2 + 9, 8.5, 'B', MUTED);
		ty2 += 22;
		for (const line of wrap(doc.terms, 'R', 8.5, halfW)) {
			wr.text(line, rx2, ty2, 8.5, 'R', MUTED);
			ty2 += 11;
		}
		ty2 += 6;
	}
	// Signature block, bottom right of the footer area.
	const sigTop = Math.max(ty2, footTop + 26);
	if (sign) {
		const scale = Math.min(110 / sign.width, 40 / sign.height);
		wr.image('ImSign', 0, rx2, sigTop, sign.width * scale, sign.height * scale);
		ty2 = sigTop + sign.height * scale + 4;
	} else {
		ty2 = sigTop + 26;
	}
	wr.hline(rx2, rx2 + 140, ty2, RULE, 0.6);
	wr.text(`For ${doc.business.name}`, rx2, ty2 + 12, 8.5, 'B', INK);
	wr.text('Authorised signatory', rx2, ty2 + 23, 8, 'R', MUTED);

	wr.y = Math.max(fy, ty2 + 30) + 4;

	// ---------------- page furniture ----------------
	const pageCount = wr.pages.length;
	wr.pages.forEach((pg, i) => {
		wr.pg = pg;
		wr.hline(ML, ML + CW, H - 42, RULE, 0.5);
		wr.text(`${doc.title} ${doc.number}`, ML, H - 28, 7.8, 'R', MUTED);
		wr.center('This is a computer generated document.', W / 2, H - 28, 7.8, 'R', MUTED);
		wr.right(`Page ${i + 1} of ${pageCount}`, ML + CW, H - 28, 7.8, 'R', MUTED);
	});

	// ---------------- object assembly (binary safe) ----------------
	const chunks: Uint8Array[] = [];
	let length = 0;
	const pushBytes = (b: Uint8Array) => {
		chunks.push(b);
		length += b.length;
	};
	const pushLatin1 = (s: string) => {
		const b = new Uint8Array(s.length);
		for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
		pushBytes(b);
	};

	type Obj = { body: string; stream?: Uint8Array };
	const objs: Obj[] = [{ body: '' }, { body: '' }];
	const add = (body: string, stream?: Uint8Array) => {
		objs.push({ body, stream });
		return objs.length;
	};
	add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
	add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
	const infoId = add(
		`<< /Title (${esc(cleanText(`${doc.title} ${doc.number}`))}) /Author (${esc(cleanText(doc.business.name))}) /Subject (${esc(
			doc.isQuotation ? 'Quotation' : 'Tax invoice'
		)}) /Creator (InvoiceNest) /Producer (InvoiceNest) /CreationDate (${pdfDate(now)}) >>`
	);
	for (const im of imageObjs) {
		im.id = add(
			`<< /Type /XObject /Subtype /Image /Width ${im.img.width} /Height ${im.img.height} /ColorSpace /Device${
				im.img.gray ? 'Gray' : 'RGB'
			} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.img.bytes.length} >>`,
			im.img.bytes
		);
	}
	const pageIds: number[] = [];
	for (const pg of wr.pages) {
		const content = pg.ops.join('\n');
		const contentBytes = new Uint8Array(content.length);
		for (let i = 0; i < content.length; i++) contentBytes[i] = content.charCodeAt(i) & 0xff;
		const contentId = add(`<< /Length ${contentBytes.length} >>`, contentBytes);
		const xobjs = pg.images
			.map((im) => {
				const idx = imageId(im.name);
				return idx >= 0 ? `/${im.name} ${imageObjs[idx].id} 0 R` : '';
			})
			.filter(Boolean)
			.join(' ');
		pageIds.push(
			add(
				`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${
					xobjs ? ` /XObject << ${xobjs} >>` : ''
				} >> /Contents ${contentId} 0 R >>`
			)
		);
	}
	objs[0] = { body: '<< /Type /Catalog /Pages 2 0 R /Lang (en-IN) /ViewerPreferences << /DisplayDocTitle true >> >>' };
	objs[1] = { body: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>` };

	pushLatin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
	const offsets: number[] = [];
	objs.forEach((o, i) => {
		offsets.push(length);
		pushLatin1(`${i + 1} 0 obj\n${o.body}\n`);
		if (o.stream) {
			pushLatin1('stream\n');
			pushBytes(o.stream);
			pushLatin1('\nendstream\n');
		}
		pushLatin1('endobj\n');
	});
	const xref = length;
	pushLatin1(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
	pushLatin1(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

	const out = new Uint8Array(length);
	let at = 0;
	for (const c of chunks) {
		out.set(c, at);
		at += c.length;
	}
	return out;
}

function pdfDate(d: Date) {
	const p = (n: number) => String(n).padStart(2, '0');
	return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
