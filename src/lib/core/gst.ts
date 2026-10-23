// GST calculation engine. All arithmetic is in integer paise.
//
// Order of operations (matches Indian invoicing practice):
//   1. gross      = qty x rate
//   2. discount   = percent of gross, or a fixed amount
//   3. taxable    = gross - discount           <- discount applied BEFORE tax
//   4. tax        = taxable x rate
//
// Tax-inclusive pricing works backwards from the line total:
//   taxable = inclusiveTotal x 10000 / (10000 + bp)
// so the printed rate is what the customer pays and the base is derived.
//
// Place of supply decides the split:
//   business state == place of supply -> CGST + SGST, each half of the tax
//   business state != place of supply -> IGST, the whole tax
// The CGST/SGST halves are split so that cgst + sgst === tax exactly (any odd
// paise goes to CGST), never leaving a 1-paise hole in the summary.

import { divRound, pctOf, QTY_SCALE, PCT_SCALE, roundOffDelta } from './money.ts';
import type { ExtraCharge, LineItem } from './types.ts';

export interface LineResult {
	id: string;
	/** qty x rate, before discount (inclusive of tax when taxInclusive). */
	gross: number;
	discount: number;
	/** Net of discount and net of tax - the GST "taxable value". */
	taxable: number;
	tax: number;
	cgst: number;
	sgst: number;
	igst: number;
	/** What the customer pays for this line: taxable + tax. */
	total: number;
	taxBp: number;
}

export interface TaxSummaryRow {
	taxBp: number;
	taxable: number;
	cgst: number;
	sgst: number;
	igst: number;
	total: number;
}

export interface DocTotals {
	lines: LineResult[];
	charges: LineResult[];
	subtotal: number; // sum of gross, tax-exclusive terms
	discountTotal: number;
	taxableTotal: number;
	cgstTotal: number;
	sgstTotal: number;
	igstTotal: number;
	taxTotal: number;
	chargesTotal: number; // taxable value of extra charges
	roundOff: number;
	grandTotal: number;
	interState: boolean;
	summary: TaxSummaryRow[];
}

export interface TotalsInput {
	lines: LineItem[];
	charges?: ExtraCharge[];
	taxInclusive: boolean;
	/** GST state code of the business. */
	businessState: string;
	/** GST state code of the place of supply. */
	placeOfSupply: string;
	roundOff?: boolean;
}

/** True when the tax must be charged as IGST. Empty/unknown states fall back to intra-state. */
export function isInterState(businessState: string, placeOfSupply: string): boolean {
	if (!businessState || !placeOfSupply) return false;
	return businessState !== placeOfSupply;
}

/** Splits a tax amount into CGST/SGST/IGST with no lost paise. */
export function splitTax(tax: number, interState: boolean): { cgst: number; sgst: number; igst: number } {
	if (interState) return { cgst: 0, sgst: 0, igst: tax };
	// Half each; the odd paise lands on CGST so the two halves re-add exactly.
	const sgst = Math.trunc(tax / 2);
	const cgst = tax - sgst;
	return { cgst, sgst, igst: 0 };
}

/** Taxable base of a tax-inclusive amount: base = amount x 10000 / (10000 + bp). */
export function baseFromInclusive(amount: number, taxBp: number): number {
	if (taxBp <= 0) return amount;
	return divRound(amount * 100 * PCT_SCALE, 100 * PCT_SCALE + taxBp);
}

/** Computes one line. `taxInclusive` means the rate already contains the tax. */
export function computeLine(line: LineItem, taxInclusive: boolean, interState: boolean): LineResult {
	const gross = divRound(line.qty * line.rate, QTY_SCALE);
	const discount =
		line.discountKind === 'percent' ? pctOf(gross, line.discountValue) : Math.min(Math.abs(line.discountValue), Math.abs(gross)) * Math.sign(gross || 1);
	const net = gross - discount;
	const taxable = taxInclusive ? baseFromInclusive(net, line.taxBp) : net;
	const tax = taxInclusive ? net - taxable : pctOf(taxable, line.taxBp);
	const split = splitTax(tax, interState);
	return {
		id: line.id,
		gross,
		discount,
		taxable,
		tax,
		...split,
		total: taxable + tax,
		taxBp: line.taxBp
	};
}

/** Extra charges (shipping etc) are always treated as tax-exclusive amounts. */
function computeCharge(charge: ExtraCharge, interState: boolean): LineResult {
	const taxable = charge.amount;
	const tax = pctOf(taxable, charge.taxBp);
	const split = splitTax(tax, interState);
	return {
		id: charge.id,
		gross: taxable,
		discount: 0,
		taxable,
		tax,
		...split,
		total: taxable + tax,
		taxBp: charge.taxBp
	};
}

/** Groups taxable value and tax by rate, for the tax summary table and GST report. */
export function taxSummary(results: LineResult[]): TaxSummaryRow[] {
	const map = new Map<number, TaxSummaryRow>();
	for (const r of results) {
		const row = map.get(r.taxBp) ?? { taxBp: r.taxBp, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
		row.taxable += r.taxable;
		row.cgst += r.cgst;
		row.sgst += r.sgst;
		row.igst += r.igst;
		row.total += r.total;
		map.set(r.taxBp, row);
	}
	return [...map.values()].sort((a, b) => a.taxBp - b.taxBp);
}

/** Full document totals, including the tax summary and optional round-off. */
export function computeTotals(input: TotalsInput): DocTotals {
	const interState = isInterState(input.businessState, input.placeOfSupply);
	const lines = input.lines.map((l) => computeLine(l, input.taxInclusive, interState));
	const charges = (input.charges ?? []).map((c) => computeCharge(c, interState));
	const all = [...lines, ...charges];

	const add = (key: keyof LineResult) => all.reduce((s, r) => s + (r[key] as number), 0);
	const taxableTotal = add('taxable');
	const cgstTotal = add('cgst');
	const sgstTotal = add('sgst');
	const igstTotal = add('igst');
	const taxTotal = cgstTotal + sgstTotal + igstTotal;
	const beforeRound = taxableTotal + taxTotal;
	const roundOff = input.roundOff ? roundOffDelta(beforeRound) : 0;

	return {
		lines,
		charges,
		subtotal: lines.reduce((s, r) => s + r.gross, 0),
		discountTotal: lines.reduce((s, r) => s + r.discount, 0),
		taxableTotal,
		cgstTotal,
		sgstTotal,
		igstTotal,
		taxTotal,
		chargesTotal: charges.reduce((s, r) => s + r.taxable, 0),
		roundOff,
		grandTotal: beforeRound + roundOff,
		interState,
		summary: taxSummary(all)
	};
}
