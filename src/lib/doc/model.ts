// The single rendering model shared by the on-screen preview and the server PDF.
//
// Both surfaces build this exact structure from the same AppData, so the preview
// "looks like the PDF" by construction and the numbers cannot drift apart.

import { formatDate } from '../core/dates.ts';
import { formatAmount, paiseToDecimal, pctToString, qtyToString } from '../core/money.ts';
import { pdfFileName } from '../core/numbering.ts';
import type { DocView } from '../core/select.ts';
import { STATUS_LABEL } from '../core/status.ts';
import { stateName } from '../core/states.ts';
import type { AppData, TemplateId } from '../core/types.ts';
import { upiLink } from '../core/upi.ts';
import { amountInWords } from '../core/words.ts';

export interface RenderRow {
	sn: string;
	description: string;
	hsn: string;
	qty: string;
	unit: string;
	rate: string;
	discount: string;
	taxRate: string;
	amount: string;
}

export interface RenderTotalLine {
	label: string;
	value: string;
	strong?: boolean;
}

export interface RenderTaxRow {
	rate: string;
	taxable: string;
	cgst: string;
	sgst: string;
	igst: string;
}

export interface RenderDoc {
	title: string;
	number: string;
	fileName: string;
	template: TemplateId;
	accent: string;
	currency: string;
	statusLabel: string;
	isQuotation: boolean;
	business: {
		name: string;
		addressLines: string[];
		contactLines: string[];
		gstin: string;
		pan: string;
		logo: string;
		state: string;
	};
	client: {
		name: string;
		company: string;
		addressLines: string[];
		contactLines: string[];
		gstin: string;
		state: string;
	};
	meta: Array<{ label: string; value: string }>;
	rows: RenderRow[];
	hasDiscountColumn: boolean;
	hasHsnColumn: boolean;
	totals: RenderTotalLine[];
	taxRows: RenderTaxRow[];
	interState: boolean;
	amountWords: string;
	grandTotal: string;
	balanceLine: string;
	notes: string;
	terms: string;
	bank: Array<{ label: string; value: string }>;
	upi: { id: string; link: string } | null;
	signature: string;
	footerNote: string;
}

const lines = (text: string): string[] => (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

/** Builds the full render model for one document. */
export function buildRenderDoc(data: AppData, view: DocView): RenderDoc {
	const { doc, totals, client } = view;
	const df = data.settings.dateFormat;
	const cur = data.settings.currency;
	const money = (p: number) => formatAmount(p, cur, false);
	const isQuotation = doc.type === 'quotation';

	const rows: RenderRow[] = doc.lines.map((l, i) => {
		const r = totals.lines[i];
		return {
			sn: String(i + 1),
			description: l.description || '-',
			hsn: l.hsn,
			qty: qtyToString(l.qty),
			unit: l.unit,
			rate: money(l.rate),
			discount: l.discountValue ? (l.discountKind === 'percent' ? `${pctToString(l.discountValue)}%` : money(l.discountValue)) : '',
			taxRate: `${pctToString(l.taxBp)}%`,
			amount: money(r ? r.taxable + r.tax : 0)
		};
	});

	const totalLines: RenderTotalLine[] = [];
	totalLines.push({ label: 'Subtotal', value: money(totals.subtotal) });
	if (totals.discountTotal) totalLines.push({ label: 'Discount', value: `- ${money(totals.discountTotal)}` });
	totalLines.push({ label: 'Taxable value', value: money(totals.taxableTotal) });
	if (totals.interState) {
		if (totals.igstTotal) totalLines.push({ label: 'IGST', value: money(totals.igstTotal) });
	} else {
		if (totals.cgstTotal) totalLines.push({ label: 'CGST', value: money(totals.cgstTotal) });
		if (totals.sgstTotal) totalLines.push({ label: 'SGST', value: money(totals.sgstTotal) });
	}
	for (const c of doc.charges) {
		const idx = doc.charges.indexOf(c);
		const r = totals.charges[idx];
		if (r) totalLines.push({ label: c.label || 'Other charges', value: money(r.taxable) });
	}
	if (totals.roundOff) totalLines.push({ label: 'Round off', value: `${totals.roundOff > 0 ? '+ ' : '- '}${money(Math.abs(totals.roundOff))}` });
	totalLines.push({ label: isQuotation ? 'Quotation total' : 'Total', value: money(totals.grandTotal), strong: true });
	if (!isQuotation && view.paid > 0) {
		totalLines.push({ label: 'Amount received', value: `- ${money(view.paid)}` });
		totalLines.push({ label: 'Balance due', value: money(view.balance), strong: true });
	}

	const taxRows: RenderTaxRow[] = totals.summary.map((r) => ({
		rate: `${pctToString(r.taxBp)}%`,
		taxable: money(r.taxable),
		cgst: money(r.cgst),
		sgst: money(r.sgst),
		igst: money(r.igst)
	}));

	const meta: Array<{ label: string; value: string }> = [
		{ label: isQuotation ? 'Quotation no.' : 'Invoice no.', value: doc.number },
		{ label: 'Date', value: formatDate(doc.date, df) },
		{ label: isQuotation ? 'Valid until' : 'Due date', value: doc.dueDate ? formatDate(doc.dueDate, df) : '-' },
		{ label: 'Place of supply', value: doc.placeOfSupply ? `${stateName(doc.placeOfSupply)} (${doc.placeOfSupply})` : '-' }
	];
	if (doc.reference) meta.push({ label: 'Reference', value: doc.reference });

	const bank: Array<{ label: string; value: string }> = [];
	const b = data.profile.bank;
	if (b.accountName) bank.push({ label: 'Account name', value: b.accountName });
	if (b.accountNumber) bank.push({ label: 'Account no.', value: b.accountNumber });
	if (b.ifsc) bank.push({ label: 'IFSC', value: b.ifsc });
	if (b.bank) bank.push({ label: 'Bank', value: [b.bank, b.branch].filter(Boolean).join(', ') });

	const dueNow = isQuotation ? totals.grandTotal : view.balance;
	const upi = data.profile.upiId
		? {
				id: data.profile.upiId,
				link: upiLink({ upiId: data.profile.upiId, payeeName: data.profile.name, amountPaise: dueNow, note: doc.number })
			}
		: null;

	return {
		title: isQuotation ? 'QUOTATION' : 'TAX INVOICE',
		number: doc.number,
		fileName: pdfFileName(doc.number, client ? client.company || client.name : ''),
		template: doc.template,
		accent: data.settings.accent,
		currency: cur,
		statusLabel: STATUS_LABEL[view.status],
		isQuotation,
		business: {
			name: data.profile.name || 'Your business',
			addressLines: lines(data.profile.address),
			contactLines: [data.profile.phone, data.profile.email, data.profile.website].filter(Boolean),
			gstin: data.profile.gstin,
			pan: data.profile.pan,
			logo: data.profile.logo,
			state: data.profile.state ? `${stateName(data.profile.state)} (${data.profile.state})` : ''
		},
		client: {
			name: client?.name ?? '',
			company: client?.company ?? '',
			addressLines: lines(client?.address ?? ''),
			contactLines: [client?.phone, client?.email].filter(Boolean) as string[],
			gstin: client?.gstin ?? '',
			state: client?.state ? `${stateName(client.state)} (${client.state})` : ''
		},
		meta,
		rows,
		hasDiscountColumn: doc.lines.some((l) => l.discountValue !== 0),
		hasHsnColumn: doc.lines.some((l) => Boolean(l.hsn)),
		totals: totalLines,
		taxRows,
		interState: totals.interState,
		amountWords: amountInWords(totals.grandTotal, cur),
		grandTotal: money(totals.grandTotal),
		balanceLine: !isQuotation && view.paid > 0 ? `Balance due ${formatAmount(view.balance, cur)}` : '',
		notes: doc.notes,
		terms: doc.terms,
		bank,
		upi,
		signature: doc.signature || data.profile.signature,
		footerNote: doc.taxInclusive ? 'Rates shown are inclusive of GST.' : ''
	};
}

/** Plain-text summary for WhatsApp or email (the "Copy summary" button). */
export function copySummary(data: AppData, view: DocView): string {
	const df = data.settings.dateFormat;
	const cur = data.settings.currency;
	const parts: string[] = [];
	const who = data.profile.name || 'Our business';
	parts.push(`${view.doc.type === 'invoice' ? 'Invoice' : 'Quotation'} ${view.doc.number} from ${who}`);
	parts.push(`Amount: ${formatAmount(view.totals.grandTotal, cur)}`);
	if (view.doc.type === 'invoice' && view.paid > 0) parts.push(`Received: ${formatAmount(view.paid, cur)} | Balance: ${formatAmount(view.balance, cur)}`);
	if (view.doc.dueDate) parts.push(`${view.doc.type === 'invoice' ? 'Due date' : 'Valid until'}: ${formatDate(view.doc.dueDate, df)}`);
	const b = data.profile.bank;
	if (b.accountNumber && b.ifsc) parts.push(`Bank: ${b.bank || ''} ${b.accountNumber} (IFSC ${b.ifsc})`.trim());
	if (data.profile.upiId) parts.push(`UPI: ${data.profile.upiId}`);
	parts.push(`Amount in words: ${amountInWords(view.totals.grandTotal, cur)}`);
	return parts.join('\n');
}

/** Compact payload posted to the PDF route (no AppData leaves the browser beyond this). */
export function pdfPayload(data: AppData, view: DocView) {
	return {
		render: buildRenderDoc(data, view),
		debug: { grandTotalPaise: view.totals.grandTotal, grandTotalDecimal: paiseToDecimal(view.totals.grandTotal) }
	};
}
