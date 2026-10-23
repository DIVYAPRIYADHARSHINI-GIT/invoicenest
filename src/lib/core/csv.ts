// CSV builders. Amounts use paiseToDecimal so a spreadsheet sees exact numbers
// (no currency symbol, no digit grouping) that always match the PDF.

import { formatDate } from './dates.ts';
import { paiseToDecimal, pctToString, qtyToString } from './money.ts';
import type { GstReport } from './select.ts';
import type { DocView } from './select.ts';
import { STATUS_LABEL } from './status.ts';
import { stateName } from './states.ts';
import type { AppData, Payment } from './types.ts';

/** RFC 4180 quoting; a leading =,+,-,@ is prefixed so spreadsheets cannot run it as a formula. */
export function csvCell(value: unknown): string {
	let s = value === null || value === undefined ? '' : String(value);
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
	return s;
}

export function toCsv(rows: unknown[][]): string {
	// BOM so Excel opens UTF-8 (and the rupee sign) correctly.
	return '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function documentsCsv(views: DocView[], dateFormat: string): string {
	const rows: unknown[][] = [
		[
			'Type', 'Number', 'Date', 'Due / valid until', 'Client', 'Client GSTIN', 'Place of supply',
			'Reference', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Round off', 'Total', 'Paid', 'Balance', 'Status'
		]
	];
	for (const v of views) {
		rows.push([
			v.doc.type === 'invoice' ? 'Invoice' : 'Quotation',
			v.doc.number,
			formatDate(v.doc.date, dateFormat),
			formatDate(v.doc.dueDate, dateFormat),
			v.client ? v.client.company || v.client.name : '',
			v.client?.gstin ?? '',
			`${v.doc.placeOfSupply} ${stateName(v.doc.placeOfSupply)}`.trim(),
			v.doc.reference,
			paiseToDecimal(v.totals.taxableTotal),
			paiseToDecimal(v.totals.cgstTotal),
			paiseToDecimal(v.totals.sgstTotal),
			paiseToDecimal(v.totals.igstTotal),
			paiseToDecimal(v.totals.roundOff),
			paiseToDecimal(v.totals.grandTotal),
			paiseToDecimal(v.paid),
			paiseToDecimal(v.balance),
			STATUS_LABEL[v.status]
		]);
	}
	return toCsv(rows);
}

/** One row per line item, for anyone who needs HSN-level detail. */
export function lineItemsCsv(views: DocView[], dateFormat: string): string {
	const rows: unknown[][] = [
		['Number', 'Date', 'Client', 'Description', 'HSN/SAC', 'Qty', 'Unit', 'Rate', 'Discount', 'Taxable value', 'Tax %', 'CGST', 'SGST', 'IGST', 'Line total']
	];
	for (const v of views) {
		v.doc.lines.forEach((l, i) => {
			const r = v.totals.lines[i];
			if (!r) return;
			rows.push([
				v.doc.number,
				formatDate(v.doc.date, dateFormat),
				v.client ? v.client.company || v.client.name : '',
				l.description,
				l.hsn,
				qtyToString(l.qty),
				l.unit,
				paiseToDecimal(l.rate),
				l.discountKind === 'percent' ? `${pctToString(l.discountValue)}%` : paiseToDecimal(l.discountValue),
				paiseToDecimal(r.taxable),
				pctToString(l.taxBp),
				paiseToDecimal(r.cgst),
				paiseToDecimal(r.sgst),
				paiseToDecimal(r.igst),
				paiseToDecimal(r.total)
			]);
		});
	}
	return toCsv(rows);
}

export function paymentsCsv(payments: Payment[], data: AppData, dateFormat: string): string {
	const rows: unknown[][] = [['Date', 'Invoice', 'Client', 'Amount', 'Mode', 'Reference']];
	const MODE: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', card: 'Card', cheque: 'Cheque', other: 'Other' };
	for (const p of payments) {
		const doc = data.docs.find((d) => d.id === p.invoiceId);
		const client = data.clients.find((c) => c.id === doc?.clientId);
		rows.push([
			formatDate(p.date, dateFormat),
			doc?.number ?? '',
			client ? client.company || client.name : '',
			paiseToDecimal(p.amount),
			MODE[p.mode] ?? p.mode,
			p.reference
		]);
	}
	return toCsv(rows);
}

export function clientsCsv(data: AppData): string {
	const rows: unknown[][] = [['Name', 'Company', 'Email', 'Phone', 'Billing address', 'State', 'GSTIN', 'Notes']];
	for (const c of data.clients) {
		rows.push([c.name, c.company, c.email, c.phone, c.address.replace(/\n/g, ', '), `${c.state} ${stateName(c.state)}`.trim(), c.gstin, c.notes]);
	}
	return toCsv(rows);
}

export function gstSummaryCsv(report: GstReport, dateFormat: string): string {
	const rows: unknown[][] = [
		['GST summary (reference only, not a filing)'],
		['Period', `${formatDate(report.from, dateFormat)} to ${formatDate(report.to, dateFormat)}`],
		['Invoices included', report.docCount],
		[],
		['Tax rate', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total']
	];
	for (const r of report.rows) {
		rows.push([`${pctToString(r.taxBp)}%`, paiseToDecimal(r.taxable), paiseToDecimal(r.cgst), paiseToDecimal(r.sgst), paiseToDecimal(r.igst), paiseToDecimal(r.total)]);
	}
	rows.push(['Total', paiseToDecimal(report.taxable), paiseToDecimal(report.cgst), paiseToDecimal(report.sgst), paiseToDecimal(report.igst), paiseToDecimal(report.total)]);
	return toCsv(rows);
}
