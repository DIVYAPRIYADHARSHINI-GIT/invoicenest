// UPI payment link + a dependency-free QR encoder (byte mode, ECC level M).
//
// The QR matrix is generated in the browser from the UPI URI, so no external QR
// service, no API key and no extra library. Version is chosen automatically for
// the payload length (up to version 10, far more than a UPI string needs).

import { paiseToDecimal } from './money.ts';

export interface UpiLinkInput {
	upiId: string;
	payeeName: string;
	amountPaise: number;
	note: string;
}

/** Builds a standard upi://pay URI. Amount is always in rupees with 2 decimals. */
export function upiLink({ upiId, payeeName, amountPaise, note }: UpiLinkInput): string {
	const params = new URLSearchParams({
		pa: upiId.trim(),
		pn: payeeName.trim() || 'Payee',
		am: paiseToDecimal(Math.max(0, amountPaise)),
		cu: 'INR'
	});
	if (note.trim()) params.set('tn', note.trim().slice(0, 50));
	return `upi://pay?${params.toString()}`;
}

// ---------------- QR encoding ----------------

const EC_CODEWORDS_M: Record<number, number> = { 1: 10, 2: 16, 3: 26, 4: 18, 5: 24, 6: 16, 7: 18, 8: 22, 9: 22, 10: 26 };
const EC_BLOCKS_M: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 4, 7: 4, 8: 4, 9: 5, 10: 5 };
const TOTAL_CODEWORDS: Record<number, number> = { 1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172, 7: 196, 8: 242, 9: 292, 10: 346 };
const ALIGN_POS: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
(() => {
	let x = 1;
	for (let i = 0; i < 255; i++) {
		EXP[i] = x;
		LOG[x] = i;
		x <<= 1;
		if (x & 0x100) x ^= 0x11d;
	}
	for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generatorPoly(degree: number): number[] {
	let poly = [1];
	for (let i = 0; i < degree; i++) {
		const next = new Array<number>(poly.length + 1).fill(0);
		for (let j = 0; j < poly.length; j++) {
			next[j] ^= mul(poly[j], 1);
			next[j + 1] ^= mul(poly[j], EXP[i]);
		}
		poly = next;
	}
	return poly;
}

function ecCodewords(data: number[], count: number): number[] {
	const gen = generatorPoly(count);
	const res = new Array<number>(count).fill(0);
	for (const byte of data) {
		const factor = byte ^ res[0];
		res.shift();
		res.push(0);
		for (let i = 0; i < count; i++) res[i] ^= mul(gen[i + 1], factor);
	}
	return res;
}

function chooseVersion(byteLen: number): number {
	for (let v = 1; v <= 10; v++) {
		const ecTotal = EC_CODEWORDS_M[v] * EC_BLOCKS_M[v];
		const dataCodewords = TOTAL_CODEWORDS[v] - ecTotal;
		const lenBits = v < 10 ? 8 : 16;
		const needed = Math.ceil((4 + lenBits + byteLen * 8) / 8);
		if (needed <= dataCodewords) return v;
	}
	throw new Error('QR payload is too long for this encoder.');
}

/** Returns the QR modules as a size x size boolean grid (true = dark). */
export function qrMatrix(text: string): boolean[][] {
	const bytes = [...new TextEncoder().encode(text)];
	const version = chooseVersion(bytes.length);
	const size = 17 + version * 4;
	const ecPerBlock = EC_CODEWORDS_M[version];
	const blocks = EC_BLOCKS_M[version];
	const dataCodewords = TOTAL_CODEWORDS[version] - ecPerBlock * blocks;

	// --- bit stream ---
	const bits: number[] = [];
	const push = (val: number, len: number) => {
		for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
	};
	push(0b0100, 4); // byte mode
	push(bytes.length, version < 10 ? 8 : 16);
	for (const b of bytes) push(b, 8);
	const capacity = dataCodewords * 8;
	for (let i = 0; i < 4 && bits.length < capacity; i++) bits.push(0);
	while (bits.length % 8 !== 0) bits.push(0);
	const codewords: number[] = [];
	for (let i = 0; i < bits.length; i += 8) codewords.push(parseInt(bits.slice(i, i + 8).join(''), 2));
	const PAD = [0xec, 0x11];
	for (let i = 0; codewords.length < dataCodewords; i++) codewords.push(PAD[i % 2]);

	// --- split into blocks, add EC ---
	const perBlock = Math.floor(dataCodewords / blocks);
	const extra = dataCodewords % blocks;
	const dataBlocks: number[][] = [];
	const ecBlocks: number[][] = [];
	let pos = 0;
	for (let b = 0; b < blocks; b++) {
		const len = perBlock + (b >= blocks - extra ? 1 : 0);
		const chunk = codewords.slice(pos, pos + len);
		pos += len;
		dataBlocks.push(chunk);
		ecBlocks.push(ecCodewords(chunk, ecPerBlock));
	}
	const interleaved: number[] = [];
	const maxData = Math.max(...dataBlocks.map((b) => b.length));
	for (let i = 0; i < maxData; i++) for (const b of dataBlocks) if (i < b.length) interleaved.push(b[i]);
	for (let i = 0; i < ecPerBlock; i++) for (const b of ecBlocks) interleaved.push(b[i]);

	// --- matrix ---
	const m: (boolean | null)[][] = Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));
	const setFinder = (r: number, c: number) => {
		for (let dr = -1; dr <= 7; dr++) {
			for (let dc = -1; dc <= 7; dc++) {
				const rr = r + dr;
				const cc = c + dc;
				if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
				const inRing = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
				const dark = inRing && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
				m[rr][cc] = dark;
			}
		}
	};
	setFinder(0, 0);
	setFinder(0, size - 7);
	setFinder(size - 7, 0);
	for (const r of ALIGN_POS[version]) {
		for (const c of ALIGN_POS[version]) {
			if (m[r][c] !== null) continue;
			for (let dr = -2; dr <= 2; dr++) {
				for (let dc = -2; dc <= 2; dc++) {
					m[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
				}
			}
		}
	}
	for (let i = 8; i < size - 8; i++) {
		if (m[6][i] === null) m[6][i] = i % 2 === 0;
		if (m[i][6] === null) m[i][6] = i % 2 === 0;
	}
	m[size - 8][8] = true; // dark module

	// Reserve format areas.
	const reserved: Array<[number, number]> = [];
	for (let i = 0; i < 9; i++) {
		if (m[8][i] === null) reserved.push([8, i]);
		if (m[i][8] === null) reserved.push([i, 8]);
	}
	for (let i = 0; i < 8; i++) {
		if (m[8][size - 1 - i] === null) reserved.push([8, size - 1 - i]);
		if (m[size - 1 - i][8] === null) reserved.push([size - 1 - i, 8]);
	}
	for (const [r, c] of reserved) m[r][c] = false;
	const isReserved = new Set(reserved.map(([r, c]) => `${r},${c}`));

	// --- place data with mask 0 ((r+c) % 2 === 0) ---
	let bitIdx = 0;
	const dataBits: number[] = [];
	for (const cw of interleaved) for (let i = 7; i >= 0; i--) dataBits.push((cw >> i) & 1);
	let upward = true;
	for (let col = size - 1; col > 0; col -= 2) {
		if (col === 6) col -= 1; // skip the vertical timing column
		for (let i = 0; i < size; i++) {
			const row = upward ? size - 1 - i : i;
			for (const c of [col, col - 1]) {
				if (m[row][c] !== null && !isReserved.has(`${row},${c}`)) continue;
				if (isReserved.has(`${row},${c}`)) continue;
				const bit = bitIdx < dataBits.length ? dataBits[bitIdx++] : 0;
				const masked = (row + c) % 2 === 0 ? bit ^ 1 : bit;
				m[row][c] = masked === 1;
			}
		}
		upward = !upward;
	}

	// --- format information (ECC M, mask 0) ---
	const FORMAT_M0 = 0b101010000010010;
	const fmtBits = [...Array(15).keys()].map((i) => (FORMAT_M0 >> (14 - i)) & 1);
	const place = (r: number, c: number, bit: number) => {
		m[r][c] = bit === 1;
	};
	// Top-left copy.
	for (let i = 0; i <= 5; i++) place(8, i, fmtBits[14 - i]);
	place(8, 7, fmtBits[14 - 6]);
	place(8, 8, fmtBits[14 - 7]);
	place(7, 8, fmtBits[14 - 8]);
	for (let i = 9; i <= 14; i++) place(14 - i, 8, fmtBits[14 - i]);
	// Second copy.
	for (let i = 0; i <= 7; i++) place(size - 1 - i, 8, fmtBits[14 - i]);
	for (let i = 8; i <= 14; i++) place(8, size - 15 + i, fmtBits[14 - i]);

	return m.map((row) => row.map((v) => v === true));
}

/** Renders a QR as a compact SVG path string plus its module count. */
export function qrSvgPath(text: string): { path: string; size: number } {
	const m = qrMatrix(text);
	const parts: string[] = [];
	for (let r = 0; r < m.length; r++) {
		for (let c = 0; c < m.length; c++) {
			if (m[r][c]) parts.push(`M${c} ${r}h1v1h-1z`);
		}
	}
	return { path: parts.join(''), size: m.length };
}
