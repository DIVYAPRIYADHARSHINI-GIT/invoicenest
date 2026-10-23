// GST engine: discount-before-tax, inclusive/exclusive, CGST+SGST vs IGST,
// tax summary grouping and round-off.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { baseFromInclusive, computeLine, computeTotals, isInterState, splitTax, taxSummary } from '../../src/lib/core/gst.ts';
import type { LineItem } from '../../src/lib/core/types.ts';

const line = (over: Partial<LineItem> = {}): LineItem => ({
	id: over.id ?? 'l1',
	description: 'Service',
	hsn: '998314',
	qty: 1000,
	unit: 'nos',
	rate: 100000, // 1000.00
	discountKind: 'percent',
	discountValue: 0,
	taxBp: 1800,
	...over
});

test('isInterState compares the business state with the place of supply', () => {
	assert.equal(isInterState('33', '33'), false);
	assert.equal(isInterState('33', '29'), true);
	assert.equal(isInterState('', '29'), false); // unknown state -> intra-state fallback
	assert.equal(isInterState('33', ''), false);
});

test('splitTax halves CGST/SGST with no lost paise', () => {
	assert.deepEqual(splitTax(1800, false), { cgst: 900, sgst: 900, igst: 0 });
	assert.deepEqual(splitTax(1801, false), { cgst: 901, sgst: 900, igst: 0 });
	assert.deepEqual(splitTax(1800, true), { cgst: 0, sgst: 0, igst: 1800 });
	assert.deepEqual(splitTax(0, false), { cgst: 0, sgst: 0, igst: 0 });
	const odd = splitTax(777, false);
	assert.equal(odd.cgst + odd.sgst, 777);
});

test('intra-state line splits into CGST and SGST', () => {
	const r = computeLine(line(), false, false);
	assert.equal(r.taxable, 100000);
	assert.equal(r.tax, 18000);
	assert.equal(r.cgst, 9000);
	assert.equal(r.sgst, 9000);
	assert.equal(r.igst, 0);
	assert.equal(r.total, 118000);
});

test('inter-state line charges IGST only', () => {
	const r = computeLine(line(), false, true);
	assert.equal(r.igst, 18000);
	assert.equal(r.cgst, 0);
	assert.equal(r.sgst, 0);
	assert.equal(r.total, 118000);
});

test('quantity multiplies into the line total exactly', () => {
	const r = computeLine(line({ qty: 2500, rate: 33333 }), false, false); // 2.5 x 333.33
	assert.equal(r.gross, 83333); // 833.325 -> 833.33
	assert.equal(r.taxable, 83333);
	assert.equal(r.tax, 15000); // 18% of 833.33 = 149.9994 -> 150.00
});

test('percentage discount is applied before tax', () => {
	const r = computeLine(line({ discountKind: 'percent', discountValue: 1000 }), false, false); // 10%
	assert.equal(r.gross, 100000);
	assert.equal(r.discount, 10000);
	assert.equal(r.taxable, 90000);
	assert.equal(r.tax, 16200); // 18% of 900, not of 1000
	assert.equal(r.total, 106200);
});

test('fixed discount is applied before tax and cannot exceed the line', () => {
	const r = computeLine(line({ discountKind: 'amount', discountValue: 25000 }), false, false);
	assert.equal(r.taxable, 75000);
	assert.equal(r.tax, 13500);
	const capped = computeLine(line({ discountKind: 'amount', discountValue: 500000 }), false, false);
	assert.equal(capped.discount, 100000);
	assert.equal(capped.taxable, 0);
	assert.equal(capped.tax, 0);
});

test('baseFromInclusive reverses the tax out of a gross price', () => {
	assert.equal(baseFromInclusive(11800, 1800), 10000); // 118.00 incl 18% -> 100.00
	assert.equal(baseFromInclusive(10500, 500), 10000); // 105.00 incl 5%
	assert.equal(baseFromInclusive(10000, 0), 10000); // zero tax passes through
	assert.equal(baseFromInclusive(10050, 50), 10000); // 0.5%
});

test('tax-inclusive line keeps the printed total and derives the base', () => {
	const r = computeLine(line({ rate: 118000, taxBp: 1800 }), true, false);
	assert.equal(r.gross, 118000);
	assert.equal(r.taxable, 100000);
	assert.equal(r.tax, 18000);
	assert.equal(r.total, 118000, 'customer pays exactly the printed rate');
	assert.equal(r.taxable + r.tax, r.total);
});

test('tax-inclusive with a discount discounts the gross then reverses tax', () => {
	const r = computeLine(line({ rate: 118000, taxBp: 1800, discountKind: 'percent', discountValue: 1000 }), true, false);
	assert.equal(r.discount, 11800);
	assert.equal(r.total, 106200);
	assert.equal(r.taxable, 90000);
	assert.equal(r.tax, 16200);
});

test('zero-rated line produces no tax at all', () => {
	const r = computeLine(line({ taxBp: 0 }), false, false);
	assert.equal(r.tax, 0);
	assert.equal(r.cgst, 0);
	assert.equal(r.total, 100000);
	const incl = computeLine(line({ taxBp: 0 }), true, false);
	assert.equal(incl.taxable, 100000);
	assert.equal(incl.tax, 0);
});

test('awkward paise rounding stays consistent between base and tax', () => {
	// 1 unit at 99.99 with 18%: tax 17.9982 -> 18.00
	const r = computeLine(line({ rate: 9999, taxBp: 1800 }), false, false);
	assert.equal(r.tax, 1800);
	assert.equal(r.total, 11799);
	assert.equal(r.cgst + r.sgst, r.tax);
});

test('very large amounts remain exact', () => {
	const r = computeLine(line({ qty: 1000, rate: 123456789 }), false, true); // 12,34,567.89
	assert.equal(r.taxable, 123456789);
	assert.equal(r.igst, 22222222); // 18% = 2,22,222.2202 -> 2,22,222.22
	assert.equal(r.total, 145679011);
});

test('document totals aggregate lines, charges and the tax summary', () => {
	const totals = computeTotals({
		lines: [line({ id: 'a', rate: 100000, taxBp: 1800 }), line({ id: 'b', rate: 50000, taxBp: 500 })],
		charges: [{ id: 'c1', label: 'Shipping', amount: 20000, taxBp: 1800 }],
		taxInclusive: false,
		businessState: '33',
		placeOfSupply: '33'
	});
	assert.equal(totals.interState, false);
	assert.equal(totals.taxableTotal, 170000);
	assert.equal(totals.cgstTotal + totals.sgstTotal, totals.taxTotal);
	assert.equal(totals.igstTotal, 0);
	assert.equal(totals.taxTotal, 18000 + 2500 + 3600);
	assert.equal(totals.grandTotal, 170000 + 24100);
	assert.equal(totals.chargesTotal, 20000);
});

test('tax summary groups by rate and sorts ascending', () => {
	const rows = taxSummary([
		computeLine(line({ id: 'a', taxBp: 1800 }), false, false),
		computeLine(line({ id: 'b', taxBp: 500 }), false, false),
		computeLine(line({ id: 'c', taxBp: 1800 }), false, false)
	]);
	assert.equal(rows.length, 2);
	assert.equal(rows[0].taxBp, 500);
	assert.equal(rows[1].taxBp, 1800);
	assert.equal(rows[1].taxable, 200000);
	assert.equal(rows[1].cgst, 18000);
});

test('round-off line makes the grand total a whole rupee', () => {
	const totals = computeTotals({
		lines: [line({ rate: 9999, taxBp: 1800 })],
		taxInclusive: false,
		businessState: '33',
		placeOfSupply: '29',
		roundOff: true
	});
	assert.equal(totals.roundOff, 1); // 117.99 -> 118.00
	assert.equal(totals.grandTotal, 11800);
	assert.equal(totals.grandTotal % 100, 0);
});

test('inter-state document puts the whole tax in IGST', () => {
	const totals = computeTotals({
		lines: [line({ rate: 100000, taxBp: 1800 })],
		taxInclusive: false,
		businessState: '33',
		placeOfSupply: '27'
	});
	assert.equal(totals.igstTotal, 18000);
	assert.equal(totals.cgstTotal, 0);
	assert.equal(totals.sgstTotal, 0);
	assert.equal(totals.summary[0].igst, 18000);
});

test('an empty document totals to zero without throwing', () => {
	const totals = computeTotals({ lines: [], taxInclusive: false, businessState: '33', placeOfSupply: '33', roundOff: true });
	assert.equal(totals.grandTotal, 0);
	assert.equal(totals.summary.length, 0);
	assert.equal(totals.roundOff, 0);
});

test('inclusive and exclusive agree when the rate is converted', () => {
	const excl = computeTotals({
		lines: [line({ rate: 100000, taxBp: 1800 })],
		taxInclusive: false,
		businessState: '33',
		placeOfSupply: '33'
	});
	const incl = computeTotals({
		lines: [line({ rate: 118000, taxBp: 1800 })],
		taxInclusive: true,
		businessState: '33',
		placeOfSupply: '33'
	});
	assert.equal(excl.grandTotal, incl.grandTotal);
	assert.equal(excl.taxableTotal, incl.taxableTotal);
	assert.equal(excl.taxTotal, incl.taxTotal);
});
