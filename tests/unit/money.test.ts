// Integer-paise arithmetic, Indian formatting and amount in words.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
	divRound,
	formatAmount,
	groupIndian,
	paiseToDecimal,
	pctOf,
	pctToString,
	qtyToString,
	roundOffDelta,
	toPaise,
	toPct,
	toQty
} from '../../src/lib/core/money.ts';
import { amountInWords, numberToIndianWords } from '../../src/lib/core/words.ts';

test('divRound rounds half away from zero', () => {
	assert.equal(divRound(5, 2), 3);
	assert.equal(divRound(-5, 2), -3);
	assert.equal(divRound(4, 2), 2);
	assert.equal(divRound(1, 3), 0);
	assert.equal(divRound(2, 3), 1);
	assert.equal(divRound(0, 7), 0);
	assert.equal(divRound(7, 0), 0);
});

test('toPaise parses rupee text exactly', () => {
	assert.equal(toPaise('100'), 10000);
	assert.equal(toPaise('100.5'), 10050);
	assert.equal(toPaise('100.55'), 10055);
	assert.equal(toPaise('1,23,456.78'), 12345678);
	assert.equal(toPaise('\u20B9 2,500'), 250000);
	assert.equal(toPaise('-45.25'), -4525);
	assert.equal(toPaise(''), 0);
	assert.equal(toPaise('abc'), 0);
	assert.equal(toPaise(0.1), 10);
});

test('toPaise rounds the third decimal rather than truncating', () => {
	// 1.005 must become 101 paise, the classic float-rounding trap.
	assert.equal(toPaise('1.005'), 101);
	assert.equal(toPaise('1.004'), 100);
	assert.equal(toPaise('0.125'), 13);
});

test('toPaise from a float avoids binary error', () => {
	// 0.1 + 0.2 === 0.30000000000000004 in floats; as paise it must be exactly 30.
	assert.equal(toPaise(0.1) + toPaise(0.2), 30);
	assert.equal(toPaise(1.1 * 3), 330);
});

test('pctOf computes tax in whole paise', () => {
	assert.equal(pctOf(10000, 1800), 1800); // 18% of 100.00
	assert.equal(pctOf(10000, 500), 500); // 5%
	assert.equal(pctOf(10000, 0), 0); // zero tax
	assert.equal(pctOf(10000, 50), 50); // 0.5%
	assert.equal(pctOf(333, 1800), 60); // 59.94 -> 60 paise
	assert.equal(pctOf(1, 1800), 0); // sub-paise rounds to zero
});

test('quantity and percent scaling round-trip', () => {
	assert.equal(toQty('2.5'), 2500);
	assert.equal(qtyToString(toQty('2.5')), '2.5');
	assert.equal(qtyToString(1000), '1');
	assert.equal(qtyToString(1250), '1.25');
	assert.equal(toPct('0.5'), 50);
	assert.equal(pctToString(50), '0.5');
	assert.equal(pctToString(1800), '18');
});

test('Indian digit grouping', () => {
	assert.equal(groupIndian('1'), '1');
	assert.equal(groupIndian('999'), '999');
	assert.equal(groupIndian('1234'), '1,234');
	assert.equal(groupIndian('123456'), '1,23,456');
	assert.equal(groupIndian('12345678'), '1,23,45,678');
	assert.equal(groupIndian('1234567890'), '1,23,45,67,890');
});

test('formatAmount uses Indian grouping for INR and western for others', () => {
	assert.equal(formatAmount(12345678, 'INR'), '\u20B91,23,456.78');
	assert.equal(formatAmount(12345678, 'USD'), '$123,456.78');
	assert.equal(formatAmount(0, 'INR'), '\u20B90.00');
	assert.equal(formatAmount(-5000, 'INR'), '-\u20B950.00');
	assert.equal(formatAmount(12345678, 'INR', false), '1,23,456.78');
});

test('paiseToDecimal is exact for CSV', () => {
	assert.equal(paiseToDecimal(12345678), '123456.78');
	assert.equal(paiseToDecimal(123456), '1234.56');
	assert.equal(paiseToDecimal(5), '0.05');
	assert.equal(paiseToDecimal(0), '0.00');
	assert.equal(paiseToDecimal(-150), '-1.50');
});

test('roundOffDelta nudges to the nearest rupee', () => {
	assert.equal(roundOffDelta(10049), -49); // 100.49 -> 100.00
	assert.equal(roundOffDelta(10050), 50); // 100.50 -> 101.00
	assert.equal(roundOffDelta(10000), 0);
	assert.equal(roundOffDelta(11871), 29); // 118.71 -> 119.00
});

test('numberToIndianWords covers lakh and crore', () => {
	assert.equal(numberToIndianWords(0), 'Zero');
	assert.equal(numberToIndianWords(7), 'Seven');
	assert.equal(numberToIndianWords(15), 'Fifteen');
	assert.equal(numberToIndianWords(90), 'Ninety');
	assert.equal(numberToIndianWords(100), 'One Hundred');
	assert.equal(numberToIndianWords(999), 'Nine Hundred Ninety Nine');
	assert.equal(numberToIndianWords(1000), 'One Thousand');
	assert.equal(numberToIndianWords(100000), 'One Lakh');
	assert.equal(numberToIndianWords(123456), 'One Lakh Twenty Three Thousand Four Hundred Fifty Six');
	assert.equal(numberToIndianWords(10000000), 'One Crore');
	assert.equal(numberToIndianWords(99999999), 'Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine');
});

test('numberToIndianWords handles very large values as thousand crore', () => {
	assert.equal(numberToIndianWords(10000000000), 'One Thousand Crore');
	assert.equal(numberToIndianWords(12300000000), 'One Thousand Two Hundred Thirty Crore');
});

test('amountInWords builds the full rupees-and-paise sentence', () => {
	assert.equal(
		amountInWords(12345678),
		'Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only'
	);
	assert.equal(amountInWords(10000), 'Rupees One Hundred Only');
	assert.equal(amountInWords(0), 'Rupees Zero Only');
});

test('amountInWords handles paise-only and zero-paise amounts', () => {
	assert.equal(amountInWords(50), 'Fifty Paise Only');
	assert.equal(amountInWords(1), 'One Paise Only');
	assert.equal(amountInWords(100), 'Rupees One Only');
	assert.equal(amountInWords(-25050), 'Minus Rupees Two Hundred Fifty and Fifty Paise Only');
});

test('amountInWords uses the right unit names per currency', () => {
	assert.equal(amountInWords(12550, 'USD'), 'Dollars One Hundred Twenty Five and Fifty Cents Only');
	assert.equal(amountInWords(12550, 'GBP'), 'Pounds One Hundred Twenty Five and Fifty Pence Only');
});
