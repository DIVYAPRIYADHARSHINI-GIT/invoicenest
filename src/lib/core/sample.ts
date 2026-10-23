// Clearly fictional sample data.
//
// Nothing here is real: "Bluebird Design Co." is invented, the GSTIN is an obvious
// sample (33AABCB1234C1Z5), the bank account is 000011112222 at "Sample Bank" and
// every client is fictional. Dates are generated relative to today so the
// dashboard, overdue list and charts always look alive.

import { addDays, financialYear, today } from './dates.ts';
import { defaultSettings, emptyProfile } from './defaults.ts';
import type { AppData, CatalogueItem, Client, InvoiceDoc, LineItem, Payment, RecurringTemplate } from './types.ts';

const BUSINESS_STATE = '33'; // Tamil Nadu

/** Deterministic PRNG so the sample set is identical every time it is loaded. */
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

const CLIENTS: Array<Omit<Client, 'id' | 'createdAt'>> = [
	{
		name: 'Meera Krishnan',
		company: 'Aurora Labs',
		email: 'accounts@auroralabs.example',
		phone: '9884012345',
		address: '12 Gandhi Road, T Nagar\nChennai 600017',
		state: '33',
		gstin: '33AACCA1234D1Z7',
		notes: 'Sample client. Prefers monthly consolidated invoices.'
	},
	{
		name: 'Rohan Desai',
		company: 'Sitara Interiors',
		email: 'rohan@sitara.example',
		phone: '9820011223',
		address: '44 Linking Road, Bandra West\nMumbai 400050',
		state: '27',
		gstin: '27AADCS5678E1Z3',
		notes: 'Sample client. Interstate supply, IGST applies.'
	},
	{
		name: 'Priya Nair',
		company: 'Kochi Coffee House',
		email: 'priya@kochicoffee.example',
		phone: '9847066778',
		address: '7 Marine Drive\nKochi 682031',
		state: '32',
		gstin: '32AAFCK9012F1Z9',
		notes: 'Sample client.'
	},
	{
		name: 'Arjun Mehta',
		company: 'Northstar Logistics',
		email: 'billing@northstar.example',
		phone: '9810045678',
		address: '221 Sector 18\nNoida 201301',
		state: '09',
		gstin: '09AAGCN3456G1Z1',
		notes: 'Sample client. Always asks for a PO reference.'
	},
	{
		name: 'Fatima Sheikh',
		company: 'Verdant Farms',
		email: 'fatima@verdantfarms.example',
		phone: '9900112233',
		address: '18 MG Road\nBengaluru 560001',
		state: '29',
		gstin: '29AAHCV7890H1Z4',
		notes: 'Sample client.'
	},
	{
		name: 'Vikram Rao',
		company: 'Deccan Studio',
		email: 'vikram@deccanstudio.example',
		phone: '9701122334',
		address: '5 Banjara Hills Road 12\nHyderabad 500034',
		state: '36',
		gstin: '36AAJCD2345J1Z6',
		notes: 'Sample client.'
	},
	{
		name: 'Ananya Bose',
		company: 'Tidal Publishing',
		email: 'ananya@tidalpub.example',
		phone: '9830099887',
		address: '9 Park Street\nKolkata 700016',
		state: '19',
		gstin: '',
		notes: 'Sample client. Unregistered, no GSTIN on file.'
	},
	{
		name: 'Imran Qureshi',
		company: 'Pink City Textiles',
		email: 'imran@pinkcitytextiles.example',
		phone: '9414055667',
		address: '3 Johari Bazaar\nJaipur 302003',
		state: '08',
		gstin: '08AAKCP6789K1Z2',
		notes: 'Sample client.'
	}
];

const ITEMS: Array<Omit<CatalogueItem, 'id' | 'createdAt'>> = [
	{ name: 'Brand identity design', description: 'Logo, palette, type system and usage guide', hsn: '998391', unit: 'lot', rate: 8500000, taxBp: 1800 },
	{ name: 'Website design (per page)', description: 'Responsive page design with two revision rounds', hsn: '998314', unit: 'nos', rate: 1200000, taxBp: 1800 },
	{ name: 'UI/UX consulting', description: 'Hourly product design consulting', hsn: '998314', unit: 'hrs', rate: 250000, taxBp: 1800 },
	{ name: 'Frontend development', description: 'Component build and integration', hsn: '998314', unit: 'hrs', rate: 300000, taxBp: 1800 },
	{ name: 'Monthly design retainer', description: 'Up to 30 hours of design work per month', hsn: '998391', unit: 'month', rate: 6000000, taxBp: 1800 },
	{ name: 'Packaging artwork', description: 'Dieline artwork and print-ready files', hsn: '998391', unit: 'nos', rate: 1800000, taxBp: 1800 },
	{ name: 'Product photography', description: 'Studio session, 10 edited images', hsn: '998383', unit: 'days', rate: 2200000, taxBp: 1800 },
	{ name: 'Illustration set', description: 'Custom vector illustration, per piece', hsn: '998391', unit: 'nos', rate: 450000, taxBp: 1800 },
	{ name: 'Printed brochure', description: '8 page A5 brochure, 170 gsm art paper', hsn: '4911', unit: 'pcs', rate: 4500, taxBp: 500 },
	{ name: 'Printed book (educational)', description: 'Perfect-bound educational title', hsn: '4901', unit: 'pcs', rate: 28000, taxBp: 0 },
	{ name: 'Domain and hosting setup', description: 'One-time configuration and handover', hsn: '998315', unit: 'nos', rate: 350000, taxBp: 1800 },
	{ name: 'Site maintenance', description: 'Monthly updates, backups and monitoring', hsn: '998315', unit: 'month', rate: 750000, taxBp: 1800 }
];

const line = (id: string, item: Omit<CatalogueItem, 'id' | 'createdAt'>, qty: number, discountValue = 0): LineItem => ({
	id,
	description: item.name,
	hsn: item.hsn,
	qty,
	unit: item.unit,
	rate: item.rate,
	discountKind: 'percent',
	discountValue,
	taxBp: item.taxBp
});

/**
 * Builds the whole fictional workspace. `now` is injectable for tests.
 * Documents are spread across the current financial year with a realistic mix of
 * statuses: paid, partially paid, overdue, draft, sent, cancelled, plus
 * quotations in every state including one converted to an invoice.
 */
export function buildSampleData(now: string = today()): AppData {
	const rand = rng(20260401);
	const fy = financialYear(now, 4);

	const clients: Client[] = CLIENTS.map((c, i) => ({
		...c,
		id: `cl_sample_${i + 1}`,
		createdAt: new Date().toISOString()
	}));
	const items: CatalogueItem[] = ITEMS.map((it, i) => ({
		...it,
		id: `it_sample_${i + 1}`,
		createdAt: new Date().toISOString()
	}));

	const docs: InvoiceDoc[] = [];
	const payments: Payment[] = [];
	let invSeq = 0;
	let qtnSeq = 0;

	const makeDoc = (over: Partial<InvoiceDoc> & { clientIdx: number; dayOffset: number; lines: LineItem[] }): InvoiceDoc => {
		const client = clients[over.clientIdx];
		const isQuote = over.type === 'quotation';
		const seq = isQuote ? ++qtnSeq : ++invSeq;
		const date = addDays(now, over.dayOffset);
		const id = `${isQuote ? 'qt' : 'in'}_sample_${seq}`;
		return {
			id,
			type: isQuote ? 'quotation' : 'invoice',
			number: `${isQuote ? 'QTN' : 'INV'}/${fy.key}/${String(seq).padStart(4, '0')}`,
			date,
			dueDate: addDays(date, isQuote ? 30 : 15),
			clientId: client.id,
			placeOfSupply: client.state,
			reference: over.reference ?? '',
			lines: over.lines,
			charges: over.charges ?? [],
			taxInclusive: over.taxInclusive ?? false,
			roundOff: over.roundOff ?? true,
			notes: 'Thank you for your business.',
			terms: 'Payment due within the agreed period. Please quote the invoice number with your payment.',
			signature: '',
			template: over.template ?? 'classic',
			status: over.status ?? 'sent',
			convertedFromId: over.convertedFromId,
			convertedToId: over.convertedToId,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};
	};

	// --- Invoices across the year: paid, part paid, overdue, draft, cancelled ---
	const plan: Array<{ clientIdx: number; dayOffset: number; lines: LineItem[]; status?: InvoiceDoc['status']; pay?: 'full' | 'part' | 'none'; taxInclusive?: boolean; template?: InvoiceDoc['template']; reference?: string; charges?: InvoiceDoc['charges'] }> = [
		{ clientIdx: 0, dayOffset: -172, lines: [line('l1', ITEMS[0], 1000), line('l2', ITEMS[10], 1000)], pay: 'full' },
		{ clientIdx: 1, dayOffset: -165, lines: [line('l1', ITEMS[1], 6000, 1000)], pay: 'full', template: 'modern' },
		{ clientIdx: 2, dayOffset: -151, lines: [line('l1', ITEMS[2], 24000)], pay: 'full' },
		{ clientIdx: 3, dayOffset: -140, lines: [line('l1', ITEMS[4], 1000)], pay: 'full', reference: 'PO-NSL-4471' },
		{ clientIdx: 4, dayOffset: -128, lines: [line('l1', ITEMS[6], 2000), line('l2', ITEMS[7], 6000)], pay: 'full', template: 'minimal' },
		{ clientIdx: 5, dayOffset: -117, lines: [line('l1', ITEMS[3], 40000)], pay: 'full' },
		{ clientIdx: 6, dayOffset: -103, lines: [line('l1', ITEMS[9], 500000)], pay: 'full' },
		{ clientIdx: 7, dayOffset: -95, lines: [line('l1', ITEMS[8], 200000), line('l2', ITEMS[5], 1000)], pay: 'full', charges: [{ id: 'ch1', label: 'Courier charges', amount: 120000, taxBp: 1800 }] },
		{ clientIdx: 0, dayOffset: -82, lines: [line('l1', ITEMS[4], 1000)], pay: 'full' },
		{ clientIdx: 2, dayOffset: -70, lines: [line('l1', ITEMS[11], 3000)], pay: 'full', taxInclusive: true },
		{ clientIdx: 1, dayOffset: -58, lines: [line('l1', ITEMS[1], 4000)], pay: 'part' },
		{ clientIdx: 3, dayOffset: -47, lines: [line('l1', ITEMS[4], 1000)], pay: 'full', reference: 'PO-NSL-4502' },
		{ clientIdx: 4, dayOffset: -41, lines: [line('l1', ITEMS[2], 16000, 500)], pay: 'none' },
		{ clientIdx: 5, dayOffset: -34, lines: [line('l1', ITEMS[0], 1000)], pay: 'part', template: 'modern' },
		{ clientIdx: 6, dayOffset: -28, lines: [line('l1', ITEMS[7], 4000)], pay: 'none' },
		{ clientIdx: 7, dayOffset: -22, lines: [line('l1', ITEMS[5], 2000)], pay: 'none', status: 'cancelled' },
		{ clientIdx: 0, dayOffset: -16, lines: [line('l1', ITEMS[3], 22000)], pay: 'part' },
		{ clientIdx: 2, dayOffset: -11, lines: [line('l1', ITEMS[11], 1000), line('l2', ITEMS[10], 1000)], pay: 'none' },
		{ clientIdx: 1, dayOffset: -5, lines: [line('l1', ITEMS[6], 1000)], pay: 'none', taxInclusive: true, template: 'minimal' },
		{ clientIdx: 4, dayOffset: -2, lines: [line('l1', ITEMS[2], 8000)], pay: 'none', status: 'draft' },
		{ clientIdx: 5, dayOffset: 0, lines: [line('l1', ITEMS[4], 1000)], pay: 'none', status: 'draft' }
	];

	for (const p of plan) {
		const doc = makeDoc({
			clientIdx: p.clientIdx,
			dayOffset: p.dayOffset,
			lines: p.lines,
			status: p.status,
			taxInclusive: p.taxInclusive,
			template: p.template,
			reference: p.reference,
			charges: p.charges
		});
		docs.push(doc);
		if (p.pay === 'none' || doc.status === 'cancelled' || doc.status === 'draft') continue;
		// Compute the payable total the same way the app does, so sample payments
		// never exceed the balance.
		const gross = p.lines.reduce((s, l) => {
			const base = Math.round((l.qty * l.rate) / 1000);
			const disc = Math.round((base * l.discountValue) / 10000);
			const net = base - disc;
			const taxable = p.taxInclusive ? Math.round((net * 10000) / (10000 + l.taxBp)) : net;
			const tax = p.taxInclusive ? net - taxable : Math.round((taxable * l.taxBp) / 10000);
			return s + taxable + tax;
		}, 0);
		const extras = (p.charges ?? []).reduce((s, c) => s + c.amount + Math.round((c.amount * c.taxBp) / 10000), 0);
		const total = Math.round((gross + extras) / 100) * 100;
		const modes: Payment['mode'][] = ['upi', 'bank', 'cash', 'cheque', 'card'];
		if (p.pay === 'full') {
			payments.push({
				id: `pm_sample_${payments.length + 1}`,
				invoiceId: doc.id,
				amount: total,
				date: addDays(doc.date, 3 + Math.floor(rand() * 10)),
				mode: modes[Math.floor(rand() * modes.length)],
				reference: 'Sample payment',
				createdAt: new Date().toISOString()
			});
		} else if (p.pay === 'part') {
			payments.push({
				id: `pm_sample_${payments.length + 1}`,
				invoiceId: doc.id,
				amount: Math.round(total * 0.4 / 100) * 100,
				date: addDays(doc.date, 5),
				mode: 'upi',
				reference: 'Part payment (sample)',
				createdAt: new Date().toISOString()
			});
		}
	}

	// --- Quotations in every state, including one converted into an invoice ---
	const qAccepted = makeDoc({ clientIdx: 3, dayOffset: -26, lines: [line('l1', ITEMS[0], 1000), line('l2', ITEMS[1], 3000)], type: 'quotation', status: 'accepted' });
	docs.push(qAccepted);
	const converted = makeDoc({ clientIdx: 3, dayOffset: -20, lines: qAccepted.lines.map((l) => ({ ...l, id: `${l.id}_c` })), convertedFromId: qAccepted.id, reference: `Against quotation ${qAccepted.number}` });
	docs.push(converted);
	qAccepted.convertedToId = converted.id;
	payments.push({
		id: `pm_sample_${payments.length + 1}`,
		invoiceId: converted.id,
		amount: 5000000,
		date: addDays(converted.date, 6),
		mode: 'bank',
		reference: 'Advance against converted quotation (sample)',
		createdAt: new Date().toISOString()
	});

	docs.push(makeDoc({ clientIdx: 6, dayOffset: -9, lines: [line('l1', ITEMS[2], 20000)], type: 'quotation', status: 'sent' }));
	docs.push(makeDoc({ clientIdx: 7, dayOffset: -60, lines: [line('l1', ITEMS[5], 3000)], type: 'quotation', status: 'declined' }));
	docs.push(makeDoc({ clientIdx: 4, dayOffset: -75, lines: [line('l1', ITEMS[6], 3000)], type: 'quotation', status: 'sent' })); // expired by date
	docs.push(makeDoc({ clientIdx: 1, dayOffset: -1, lines: [line('l1', ITEMS[4], 1000)], type: 'quotation', status: 'draft' }));

	const recurring: RecurringTemplate[] = [
		{
			id: 'rc_sample_1',
			title: 'Aurora Labs - monthly retainer',
			clientId: clients[0].id,
			placeOfSupply: clients[0].state,
			lines: [line('rl1', ITEMS[4], 1000)],
			charges: [],
			taxInclusive: false,
			frequency: 'monthly',
			nextDate: addDays(now, 6),
			notes: 'Monthly retainer, generated as a draft.',
			terms: 'Payment due within 15 days.',
			active: true,
			lastRunAt: '',
			createdAt: new Date().toISOString()
		},
		{
			id: 'rc_sample_2',
			title: 'Kochi Coffee House - site maintenance',
			clientId: clients[2].id,
			placeOfSupply: clients[2].state,
			lines: [line('rl1', ITEMS[11], 1000)],
			charges: [],
			taxInclusive: false,
			frequency: 'quarterly',
			nextDate: addDays(now, 24),
			notes: '',
			terms: '',
			active: true,
			lastRunAt: '',
			createdAt: new Date().toISOString()
		}
	];

	const settings = defaultSettings();
	settings.invoiceSeries = { ...settings.invoiceSeries, next: { [fy.key]: invSeq + 1 } };
	settings.quotationSeries = { ...settings.quotationSeries, next: { [fy.key]: qtnSeq + 1 } };

	return {
		version: 1,
		profile: {
			...emptyProfile(),
			name: 'Bluebird Design Co.',
			address: '2nd Floor, 14 Casuarina Street\nBesant Nagar\nChennai 600090',
			state: BUSINESS_STATE,
			phone: '9884000000',
			email: 'studio@bluebirddesign.example',
			website: 'www.bluebirddesign.example',
			gstin: '33AABCB1234C1Z5', // obvious sample GSTIN, not a real registration
			pan: 'AABCB1234C',
			bank: {
				accountName: 'Bluebird Design Co.',
				accountNumber: '000011112222', // sample account number
				ifsc: 'SAMP0000001',
				bank: 'Sample Bank of India',
				branch: 'Besant Nagar'
			},
			upiId: 'bluebirddesign@sampleupi'
		},
		settings,
		clients,
		items,
		docs,
		payments,
		recurring,
		lastBackupAt: '',
		sampleLoaded: true
	};
}
