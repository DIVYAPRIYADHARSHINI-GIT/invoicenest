// Document numbering series with a financial-year reset.
//
//   prefix 'INV', useFy true, padding 4, FY 2026-27 -> INV/2026-27/0001
//   prefix 'INV', useFy false, padding 5            -> INV/00001
//
// The sequence is stored per financial-year key, so the counter restarts at 1 in
// each new financial year without touching old numbers. A number is only reserved
// when a document is actually saved, and `nextNumber` always skips values that are
// already used (so a manually edited number can never be duplicated).

import { financialYear } from './dates.ts';
import type { NumberSeries } from './types.ts';

export function formatNumber(series: NumberSeries, fyKey: string, seq: number): string {
	const parts: string[] = [];
	if (series.prefix.trim()) parts.push(series.prefix.trim());
	if (series.useFy) parts.push(fyKey);
	parts.push(String(seq).padStart(Math.max(1, series.padding), '0'));
	return parts.join('/');
}

/**
 * The next free number for a date. `used` is the set of numbers already taken
 * (across both series) so duplicates are impossible even after manual edits.
 */
export function nextNumber(series: NumberSeries, date: string, fyStartMonth: number, used: Iterable<string> = []): { number: string; seq: number; fyKey: string } {
	const fyKey = financialYear(date, fyStartMonth).key;
	const taken = new Set([...used].map((n) => n.trim().toLowerCase()));
	let seq = Math.max(1, series.next[fyKey] ?? 1);
	let number = formatNumber(series, fyKey, seq);
	// Bounded loop: never spin forever even on a corrupt series.
	for (let guard = 0; guard < 100000 && taken.has(number.toLowerCase()); guard++) {
		seq += 1;
		number = formatNumber(series, fyKey, seq);
	}
	return { number, seq, fyKey };
}

/** Advances the stored counter after a number has been used. Returns a new series. */
export function consumeNumber(series: NumberSeries, fyKey: string, seq: number): NumberSeries {
	const current = series.next[fyKey] ?? 1;
	return { ...series, next: { ...series.next, [fyKey]: Math.max(current, seq + 1) } };
}

/** Safe file-name part for a PDF: INV-2026-27-0001_AuroraLabs.pdf */
export function fileSafe(value: string): string {
	return (value ?? '')
		.normalize('NFKD')
		// Separators inside a document number (INV/2026-27/0001) become dashes so the
		// file name still reads as the number; everything else unsafe is dropped.
		.replace(/[/\\|:]+/g, '-')
		.replace(/[^\w\s.-]/g, '')
		.trim()
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^[-.]+|[-.]+$/g, '')
		.slice(0, 60) || 'document';
}

export function pdfFileName(docNumber: string, clientName: string): string {
	const left = fileSafe(docNumber);
	const right = fileSafe(clientName).replace(/-/g, '');
	return `${left}${right ? `_${right}` : ''}.pdf`;
}
