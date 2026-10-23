// Data model for InvoiceNest.
//
// Every money field is an integer number of paise (see core/money.ts).
// Quantities are thousandths of a unit; tax/discount percentages are basis points.
// Dates are plain local calendar dates stored as 'YYYY-MM-DD' so a timezone can
// never shift a document by a day (see core/dates.ts).

export type DocType = 'invoice' | 'quotation';

export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'cancelled';
export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'declined';
/** Stored status, plus the two values that are derived at read time, never stored. */
export type DerivedStatus = InvoiceStatus | QuotationStatus | 'overdue' | 'expired';

export type DiscountKind = 'percent' | 'amount';
export type PaymentMode = 'cash' | 'upi' | 'bank' | 'card' | 'cheque' | 'other';
export type TemplateId = 'classic' | 'modern' | 'minimal';
export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';
export type DateFormat = 'dd-mm-yyyy' | 'dd/mm/yyyy' | 'yyyy-mm-dd' | 'd-mmm-yyyy';

export interface BankDetails {
	accountName: string;
	accountNumber: string;
	ifsc: string;
	bank: string;
	branch: string;
}

export interface BusinessProfile {
	name: string;
	logo: string; // data URL, compressed to < 150 KB
	address: string;
	state: string; // GST state code, e.g. '33'
	phone: string;
	email: string;
	website: string;
	gstin: string; // optional
	pan: string; // optional
	bank: BankDetails;
	upiId: string; // optional
	signature: string; // optional data URL
}

export interface TaxRateOption {
	id: string;
	/** Basis points: 18% -> 1800. */
	bp: number;
	label: string;
}

export interface NumberSeries {
	prefix: string;
	/** Include the financial-year part, e.g. 2026-27. */
	useFy: boolean;
	padding: number;
	/** Next sequence number per financial year key, e.g. { '2026-27': 42 }. */
	next: Record<string, number>;
}

export interface Settings {
	currency: CurrencyCode;
	dateFormat: DateFormat;
	/** 1-12; April (4) by default. */
	fyStartMonth: number;
	invoiceSeries: NumberSeries;
	quotationSeries: NumberSeries;
	defaultDueDays: number;
	defaultValidDays: number;
	defaultTerms: string;
	defaultNotes: string;
	taxRates: TaxRateOption[];
	defaultTaxBp: number;
	template: TemplateId;
	accent: string;
	taxInclusive: boolean;
	theme: 'light' | 'dark' | 'system';
}

export interface Client {
	id: string;
	name: string;
	company: string;
	email: string;
	phone: string;
	address: string;
	state: string;
	gstin: string;
	notes: string;
	createdAt: string;
}

export interface CatalogueItem {
	id: string;
	name: string;
	description: string;
	hsn: string;
	unit: string;
	/** Default rate in paise. */
	rate: number;
	taxBp: number;
	createdAt: string;
}

export interface LineItem {
	id: string;
	description: string;
	hsn: string;
	/** Thousandths of a unit. */
	qty: number;
	unit: string;
	/** Rate in paise (tax-inclusive when the document is inclusive). */
	rate: number;
	discountKind: DiscountKind;
	/** Basis points when percent, paise when amount. */
	discountValue: number;
	taxBp: number;
}

export interface ExtraCharge {
	id: string;
	label: string;
	amount: number; // paise
	taxBp: number;
}

export interface Payment {
	id: string;
	invoiceId: string;
	amount: number; // paise
	date: string; // YYYY-MM-DD
	mode: PaymentMode;
	reference: string;
	createdAt: string;
}

export interface InvoiceDoc {
	id: string;
	type: DocType;
	number: string;
	date: string; // YYYY-MM-DD
	/** Due date for invoices, valid-until for quotations. */
	dueDate: string;
	clientId: string;
	placeOfSupply: string; // GST state code
	reference: string;
	lines: LineItem[];
	charges: ExtraCharge[];
	taxInclusive: boolean;
	roundOff: boolean;
	notes: string;
	terms: string;
	signature: string;
	template: TemplateId;
	status: InvoiceStatus | QuotationStatus;
	/** Set when this invoice was created from a quotation, and vice versa. */
	convertedFromId?: string;
	convertedToId?: string;
	createdAt: string;
	updatedAt: string;
}

export interface RecurringTemplate {
	id: string;
	title: string;
	clientId: string;
	placeOfSupply: string;
	lines: LineItem[];
	charges: ExtraCharge[];
	taxInclusive: boolean;
	frequency: Frequency;
	nextDate: string; // YYYY-MM-DD
	notes: string;
	terms: string;
	active: boolean;
	lastRunAt: string;
	createdAt: string;
}

export interface AppData {
	version: number;
	profile: BusinessProfile;
	settings: Settings;
	clients: Client[];
	items: CatalogueItem[];
	docs: InvoiceDoc[];
	payments: Payment[];
	recurring: RecurringTemplate[];
	lastBackupAt: string;
	sampleLoaded: boolean;
}

/**
 * The single data-access seam for the whole app. Exactly one implementation
 * exists today (localStorage). A database could implement this later without the
 * UI changing; no database is implemented now, by design.
 */
export interface InvoiceStore {
	available(): boolean;
	/** True when this browser already holds a saved workspace (even an empty one). */
	hasSaved(): boolean;
	load(): AppData;
	save(data: AppData): { ok: boolean; error?: string };
	clear(): void;
}
