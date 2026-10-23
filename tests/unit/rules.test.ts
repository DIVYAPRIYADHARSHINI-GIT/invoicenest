// Dates and financial years, numbering with FY reset, validation, status
// transitions, overdue, partial payments and recurring generation.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { addDays, addMonths, daysBetween, financialYear, formatDate, inRange, parseISO, today } from '../../src/lib/core/dates.ts';
import { consumeNumber, fileSafe, formatNumber, nextNumber, pdfFileName } from '../../src/lib/core/numbering.ts';
import { advance, collectDue } from '../../src/lib/core/recurring.ts';
import { balanceDue, canEdit, checkPayment, derivedStatus, overdueDays, paidAmount } from '../../src/lib/core/status.ts';
import { validateAccountNumber, validateEmail, validateGstin, validateIfsc, validatePan, validatePhone, validateUpi } from '../../src/lib/core/validate.ts';
import type { InvoiceDoc, NumberSeries, Payment, RecurringTemplate } from '../../src/lib/core/types.ts';

// ---------- dates ----------

test('parseISO reads a local calendar day and never shifts it', () => {
	const d = parseISO('2026-04-01');
	assert.ok(d);
	assert.equal(d.getFullYear(), 2026);
	assert.equal(d.getMonth(), 3);
	assert.equal(d.getDate(), 1, 'must stay the 1st, not slip to 31 March in IST');
	assert.equal(parseISO('2026-02-30'), null);
	assert.equal(parseISO('nonsense'), null);
	assert.equal(parseISO(''), null);
});

test('today returns the local calendar date', () => {
	const now = new Date(2026, 3, 1, 0, 30); // 00:30 local on 1 April
	assert.equal(today(now), '2026-04-01');
});

test('addDays and addMonths respect month lengths', () => {
	assert.equal(addDays('2026-04-01', 15), '2026-04-16');
	assert.equal(addDays('2026-02-28', 1), '2026-03-01');
	assert.equal(addMonths('2026-01-31', 1), '2026-02-28', 'clamps to the end of a short month');
	assert.equal(addMonths('2024-01-31', 1), '2024-02-29', 'leap year');
	assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
});

test('daysBetween counts whole calendar days across a DST-free local calendar', () => {
	assert.equal(daysBetween('2026-04-01', '2026-04-16'), 15);
	assert.equal(daysBetween('2026-04-16', '2026-04-01'), -15);
	assert.equal(daysBetween('2026-04-01', '2026-04-01'), 0);
});

test('financialYear uses an April start by default', () => {
	assert.equal(financialYear('2026-04-01').key, '2026-27');
	assert.equal(financialYear('2027-03-31').key, '2026-27');
	assert.equal(financialYear('2026-03-31').key, '2025-26');
	const fy = financialYear('2026-06-10');
	assert.equal(fy.start, '2026-04-01');
	assert.equal(fy.end, '2027-03-31');
});

test('financialYear supports a January start', () => {
	const fy = financialYear('2026-06-10', 1);
	assert.equal(fy.start, '2026-01-01');
	assert.equal(fy.end, '2026-12-31');
});

test('formatDate renders every supported format', () => {
	assert.equal(formatDate('2026-04-09', 'dd-mm-yyyy'), '09-04-2026');
	assert.equal(formatDate('2026-04-09', 'dd/mm/yyyy'), '09/04/2026');
	assert.equal(formatDate('2026-04-09', 'yyyy-mm-dd'), '2026-04-09');
	assert.equal(formatDate('2026-04-09', 'd-mmm-yyyy'), '9-Apr-2026');
});

test('inRange is inclusive on both ends', () => {
	assert.equal(inRange('2026-04-01', '2026-04-01', '2027-03-31'), true);
	assert.equal(inRange('2027-03-31', '2026-04-01', '2027-03-31'), true);
	assert.equal(inRange('2027-04-01', '2026-04-01', '2027-03-31'), false);
});

// ---------- numbering ----------

const series = (over: Partial<NumberSeries> = {}): NumberSeries => ({ prefix: 'INV', useFy: true, padding: 4, next: {}, ...over });

test('formatNumber builds the configured pattern', () => {
	assert.equal(formatNumber(series(), '2026-27', 1), 'INV/2026-27/0001');
	assert.equal(formatNumber(series({ padding: 5 }), '2026-27', 42), 'INV/2026-27/00042');
	assert.equal(formatNumber(series({ useFy: false }), '2026-27', 7), 'INV/0007');
	assert.equal(formatNumber(series({ prefix: '' }), '2026-27', 7), '2026-27/0007');
});

test('numbering restarts at 1 in a new financial year', () => {
	const s = series({ next: { '2025-26': 58 } });
	assert.equal(nextNumber(s, '2026-03-20', 4).number, 'INV/2025-26/0058');
	assert.equal(nextNumber(s, '2026-04-02', 4).number, 'INV/2026-27/0001', 'counter resets on 1 April');
});

test('nextNumber never returns a number that is already used', () => {
	const s = series({ next: { '2026-27': 1 } });
	const res = nextNumber(s, '2026-05-01', 4, ['INV/2026-27/0001', 'INV/2026-27/0002']);
	assert.equal(res.number, 'INV/2026-27/0003');
	assert.equal(res.seq, 3);
});

test('consumeNumber advances the stored counter monotonically', () => {
	const s = consumeNumber(series(), '2026-27', 5);
	assert.equal(s.next['2026-27'], 6);
	assert.equal(consumeNumber(s, '2026-27', 2).next['2026-27'], 6, 'never goes backwards');
});

test('pdfFileName is filesystem safe', () => {
	assert.equal(pdfFileName('INV/2026-27/0001', 'Aurora Labs Pvt Ltd'), 'INV-2026-27-0001_AuroraLabsPvtLtd.pdf');
	assert.equal(fileSafe('a/b\\c:d*e?'), 'a-b-c-de', 'separators become dashes, other unsafe characters are dropped');
	assert.equal(pdfFileName('QTN/2026-27/0007', 'Nilgiri Tea & Co.'), 'QTN-2026-27-0007_NilgiriTeaCo.pdf');
	assert.equal(fileSafe(''), 'document');
});

// ---------- validation ----------

test('validateGstin accepts a well-formed GSTIN and checks the state', () => {
	assert.equal(validateGstin('33AABCB1234C1Z5'), null);
	assert.equal(validateGstin('33AABCB1234C1Z5', '33'), null);
	assert.ok(validateGstin('33AABCB1234C1Z5', '29'), 'state mismatch must be reported');
	assert.equal(validateGstin(''), null, 'GSTIN is optional');
});

test('validateGstin rejects bad length, pattern and state code', () => {
	assert.ok(validateGstin('33AABCB1234C1Z'), 'too short');
	assert.ok(validateGstin('33AABCB1234C1Z55'), 'too long');
	assert.ok(validateGstin('XX1234567890123'), 'bad pattern');
	assert.ok(validateGstin('28AABCB1234C1Z5'), 'code 28 is not an issued state code');
	assert.ok(validateGstin('33AABCB1234C1A5'), 'the 14th character must be Z');
});

test('validateIfsc enforces the 11 character bank/branch pattern', () => {
	assert.equal(validateIfsc('HDFC0001234'), null);
	assert.equal(validateIfsc('ICIC0ABCD12'), null);
	assert.ok(validateIfsc('HDFC1001234'), '5th character must be zero');
	assert.ok(validateIfsc('HDFC000123'), 'too short');
	assert.equal(validateIfsc(''), null);
});

test('PAN, email, phone, UPI and account number validation', () => {
	assert.equal(validatePan('AABCB1234C'), null);
	assert.ok(validatePan('AABCB1234'), 'PAN too short');
	assert.equal(validateEmail('hello@bluebird.example'), null);
	assert.ok(validateEmail('hello@@bad'), 'bad email');
	assert.ok(validateEmail('', true), 'required email');
	assert.equal(validatePhone('+91 98840 12345'), null);
	assert.equal(validatePhone('9884012345'), null);
	assert.ok(validatePhone('1234567890'), 'Indian mobiles do not start with 1');
	assert.equal(validateUpi('bluebird@okaxis'), null);
	assert.ok(validateUpi('bluebird-okaxis'), 'missing @');
	assert.equal(validateAccountNumber('123456789012'), null);
	assert.ok(validateAccountNumber('12ab'), 'digits only');
});

// ---------- status, payments ----------

const doc = (over: Partial<InvoiceDoc> = {}): InvoiceDoc => ({
	id: 'd1',
	type: 'invoice',
	number: 'INV/2026-27/0001',
	date: '2026-04-01',
	dueDate: '2026-04-16',
	clientId: 'c1',
	placeOfSupply: '33',
	reference: '',
	lines: [],
	charges: [],
	taxInclusive: false,
	roundOff: false,
	notes: '',
	terms: '',
	signature: '',
	template: 'classic',
	status: 'sent',
	createdAt: '2026-04-01T00:00:00.000Z',
	updatedAt: '2026-04-01T00:00:00.000Z',
	...over
});

test('balanceDue never goes negative even with an advance', () => {
	assert.equal(balanceDue(118000, 0), 118000);
	assert.equal(balanceDue(118000, 50000), 68000);
	assert.equal(balanceDue(118000, 118000), 0);
	assert.equal(balanceDue(118000, 200000), 0);
});

test('paidAmount sums only this invoice', () => {
	const payments: Payment[] = [
		{ id: 'p1', invoiceId: 'd1', amount: 50000, date: '2026-04-05', mode: 'upi', reference: '', createdAt: '' },
		{ id: 'p2', invoiceId: 'd1', amount: 20000, date: '2026-04-06', mode: 'cash', reference: '', createdAt: '' },
		{ id: 'p3', invoiceId: 'd2', amount: 90000, date: '2026-04-07', mode: 'bank', reference: '', createdAt: '' }
	];
	assert.equal(paidAmount(payments, 'd1'), 70000);
	assert.equal(paidAmount(payments, 'd3'), 0);
});

test('derivedStatus marks an unpaid invoice overdue after the due date', () => {
	assert.equal(derivedStatus(doc(), 118000, 0, '2026-04-10'), 'sent');
	assert.equal(derivedStatus(doc(), 118000, 0, '2026-04-16'), 'sent', 'due today is not yet overdue');
	assert.equal(derivedStatus(doc(), 118000, 0, '2026-04-17'), 'overdue');
});

test('derivedStatus reflects partial and full payment', () => {
	assert.equal(derivedStatus(doc(), 118000, 50000, '2026-04-10'), 'partial');
	assert.equal(derivedStatus(doc(), 118000, 118000, '2026-04-20'), 'paid', 'paid wins over overdue');
	assert.equal(derivedStatus(doc(), 118000, 130000, '2026-04-20'), 'paid', 'advance still reads as paid');
	assert.equal(derivedStatus(doc(), 118000, 50000, '2026-04-20'), 'overdue', 'late part payment reads as overdue');
});

test('derivedStatus keeps drafts and cancelled documents out of overdue', () => {
	assert.equal(derivedStatus(doc({ status: 'draft' }), 118000, 0, '2026-05-30'), 'draft');
	assert.equal(derivedStatus(doc({ status: 'cancelled' }), 118000, 0, '2026-05-30'), 'cancelled');
});

test('quotations expire instead of going overdue', () => {
	const q = doc({ type: 'quotation', status: 'sent', dueDate: '2026-04-30' });
	assert.equal(derivedStatus(q, 118000, 0, '2026-04-20'), 'sent');
	assert.equal(derivedStatus(q, 118000, 0, '2026-05-01'), 'expired');
	assert.equal(derivedStatus(doc({ type: 'quotation', status: 'accepted', dueDate: '2026-04-30' }), 118000, 0, '2026-05-01'), 'accepted');
});

test('overdueDays counts only days past the due date', () => {
	assert.equal(overdueDays('2026-04-16', '2026-04-20'), 4);
	assert.equal(overdueDays('2026-04-16', '2026-04-16'), 0);
	assert.equal(overdueDays('2026-04-16', '2026-04-10'), 0);
	assert.equal(overdueDays('', '2026-04-10'), 0);
});

test('a paid invoice cannot be edited, only cancelled', () => {
	assert.equal(canEdit(doc(), 0), true);
	assert.equal(canEdit(doc(), 1), false, 'any payment locks the invoice');
	assert.equal(canEdit(doc({ status: 'cancelled' }), 0), false);
	assert.equal(canEdit(doc({ type: 'quotation', status: 'sent' }), 0), true);
});

test('checkPayment blocks overpayment until an advance is confirmed', () => {
	assert.deepEqual(checkPayment(50000, 118000), { ok: true, needsAdvanceConfirm: false });
	const over = checkPayment(150000, 118000);
	assert.equal(over.ok, false);
	assert.equal(over.needsAdvanceConfirm, true);
	assert.equal(checkPayment(150000, 118000, true).ok, true);
	assert.equal(checkPayment(0, 118000).ok, false);
	assert.equal(checkPayment(-100, 118000).ok, false);
});

// ---------- recurring ----------

const tpl = (over: Partial<RecurringTemplate> = {}): RecurringTemplate => ({
	id: 'r1',
	title: 'Monthly retainer',
	clientId: 'c1',
	placeOfSupply: '33',
	lines: [],
	charges: [],
	taxInclusive: false,
	frequency: 'monthly',
	nextDate: '2026-04-01',
	notes: '',
	terms: '',
	active: true,
	lastRunAt: '',
	createdAt: '',
	...over
});

test('advance steps by the right period', () => {
	assert.equal(advance('2026-04-01', 'weekly'), '2026-04-08');
	assert.equal(advance('2026-04-01', 'monthly'), '2026-05-01');
	assert.equal(advance('2026-04-01', 'quarterly'), '2026-07-01');
	assert.equal(advance('2026-04-01', 'yearly'), '2027-04-01');
});

test('collectDue generates every missed occurrence and rolls the next date past today', () => {
	const run = collectDue([tpl()], '2026-06-15');
	assert.equal(run.occurrences.length, 3, 'April, May and June are due');
	assert.deepEqual(run.occurrences.map((o) => o.date), ['2026-04-01', '2026-05-01', '2026-06-01']);
	assert.equal(run.templates[0].nextDate, '2026-07-01');
});

test('collectDue generates nothing before the next date and skips inactive templates', () => {
	assert.equal(collectDue([tpl()], '2026-03-20').occurrences.length, 0);
	assert.equal(collectDue([tpl({ active: false })], '2026-12-31').occurrences.length, 0);
	assert.equal(collectDue([tpl({ active: false })], '2026-12-31').templates[0].nextDate, '2026-04-01', 'inactive template is untouched');
});

test('collectDue caps a long-dormant template but still clears the backlog date', () => {
	const run = collectDue([tpl({ frequency: 'weekly', nextDate: '2020-01-01' })], '2026-06-15');
	assert.equal(run.occurrences.length, 12, 'capped at maxPerTemplate');
	assert.ok(daysBetween(run.templates[0].nextDate, '2026-06-15') < 0, 'next date is in the future');
});
