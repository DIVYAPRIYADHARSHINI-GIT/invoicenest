// Read-side helpers: document totals with payments, dashboard figures, GST report
// rows and top clients. Pure functions over AppData so they are easy to test and
// cheap to call (they are memoised per data version in app.svelte.ts).

import { financialYear, inRange, monthKey, today } from './dates.ts';
import { computeTotals, taxSummary, type DocTotals, type TaxSummaryRow } from './gst.ts';
import { balanceDue, derivedStatus, paidAmount } from './status.ts';
import type { AppData, Client, DerivedStatus, InvoiceDoc } from './types.ts';

export interface DocView {
	doc: InvoiceDoc;
	client: Client | null;
	totals: DocTotals;
	paid: number;
	balance: number;
	status: DerivedStatus;
}

export function viewDoc(data: AppData, doc: InvoiceDoc, now = today()): DocView {
	const totals = computeTotals({
		lines: doc.lines,
		charges: doc.charges,
		taxInclusive: doc.taxInclusive,
		businessState: data.profile.state,
		placeOfSupply: doc.placeOfSupply,
		roundOff: doc.roundOff
	});
	const paid = paidAmount(data.payments, doc.id);
	return {
		doc,
		client: data.clients.find((c) => c.id === doc.clientId) ?? null,
		totals,
		paid,
		balance: balanceDue(totals.grandTotal, paid),
		status: derivedStatus(doc, totals.grandTotal, paid, now)
	};
}

export function viewAll(data: AppData, now = today()): DocView[] {
	return data.docs.map((d) => viewDoc(data, d, now));
}

export interface DashboardStats {
	fyKey: string;
	fyStart: string;
	fyEnd: string;
	invoiced: number;
	received: number;
	pending: number;
	overdue: number;
	overdueCount: number;
	draftCount: number;
	byMonth: Array<{ key: string; label: string; amount: number }>;
	statusBreakdown: Array<{ status: DerivedStatus; count: number; amount: number }>;
	topClients: Array<{ client: Client | null; amount: number; count: number }>;
}

/** Cancelled documents are excluded from every money figure. */
export function dashboardStats(data: AppData, now = today()): DashboardStats {
	const fy = financialYear(now, data.settings.fyStartMonth);
	const views = viewAll(data, now).filter((v) => v.doc.type === 'invoice' && v.status !== 'cancelled');
	const inFy = views.filter((v) => inRange(v.doc.date, fy.start, fy.end));

	let invoiced = 0;
	let received = 0;
	let overdue = 0;
	let overdueCount = 0;
	let draftCount = 0;
	const monthMap = new Map<string, number>();
	const statusMap = new Map<DerivedStatus, { count: number; amount: number }>();
	const clientMap = new Map<string, { amount: number; count: number }>();

	for (const v of inFy) {
		invoiced += v.totals.grandTotal;
		received += v.paid;
		if (v.status === 'overdue') {
			overdue += v.balance;
			overdueCount += 1;
		}
		if (v.status === 'draft') draftCount += 1;
		const mk = monthKey(v.doc.date);
		monthMap.set(mk, (monthMap.get(mk) ?? 0) + v.totals.grandTotal);
		const st = statusMap.get(v.status) ?? { count: 0, amount: 0 };
		st.count += 1;
		st.amount += v.totals.grandTotal;
		statusMap.set(v.status, st);
		const cl = clientMap.get(v.doc.clientId) ?? { amount: 0, count: 0 };
		cl.amount += v.totals.grandTotal;
		cl.count += 1;
		clientMap.set(v.doc.clientId, cl);
	}

	// Always show all 12 months of the financial year so the chart has a stable axis.
	const byMonth: DashboardStats['byMonth'] = [];
	const startY = fy.startYear;
	for (let i = 0; i < 12; i++) {
		const m = ((data.settings.fyStartMonth - 1 + i) % 12) + 1;
		const y = startY + Math.floor((data.settings.fyStartMonth - 1 + i) / 12);
		const key = `${y}-${String(m).padStart(2, '0')}`;
		const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		byMonth.push({ key, label: MONTHS[m - 1], amount: monthMap.get(key) ?? 0 });
	}

	return {
		fyKey: fy.key,
		fyStart: fy.start,
		fyEnd: fy.end,
		invoiced,
		received,
		pending: Math.max(0, invoiced - received),
		overdue,
		overdueCount,
		draftCount,
		byMonth,
		statusBreakdown: [...statusMap.entries()]
			.map(([status, v]) => ({ status, ...v }))
			.sort((a, b) => b.count - a.count),
		topClients: [...clientMap.entries()]
			.map(([id, v]) => ({ client: data.clients.find((c) => c.id === id) ?? null, ...v }))
			.sort((a, b) => b.amount - a.amount)
			.slice(0, 5)
	};
}

export interface GstReport {
	from: string;
	to: string;
	rows: TaxSummaryRow[];
	taxable: number;
	cgst: number;
	sgst: number;
	igst: number;
	total: number;
	docCount: number;
}

/**
 * GST summary for a period. Only invoices count (quotations are not supplies) and
 * cancelled invoices are excluded. This is a reference summary, not a filing.
 */
export function gstReport(data: AppData, from: string, to: string, now = today()): GstReport {
	const views = viewAll(data, now).filter(
		(v) => v.doc.type === 'invoice' && v.status !== 'cancelled' && v.doc.status !== 'draft' && inRange(v.doc.date, from, to)
	);
	const all = views.flatMap((v) => [...v.totals.lines, ...v.totals.charges]);
	const rows = taxSummary(all);
	return {
		from,
		to,
		rows,
		taxable: rows.reduce((s, r) => s + r.taxable, 0),
		cgst: rows.reduce((s, r) => s + r.cgst, 0),
		sgst: rows.reduce((s, r) => s + r.sgst, 0),
		igst: rows.reduce((s, r) => s + r.igst, 0),
		total: rows.reduce((s, r) => s + r.total, 0),
		docCount: views.length
	};
}

/** Blocks deleting a client that is referenced by any document or recurring template. */
export function clientUsage(data: AppData, clientId: string): { docs: number; recurring: number } {
	return {
		docs: data.docs.filter((d) => d.clientId === clientId).length,
		recurring: data.recurring.filter((r) => r.clientId === clientId).length
	};
}

/** Every number currently in use, for duplicate-proof numbering. */
export function usedNumbers(data: AppData, exceptId = ''): string[] {
	return data.docs.filter((d) => d.id !== exceptId).map((d) => d.number);
}
