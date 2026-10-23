// Empty-state defaults and id generation.

import { today } from './dates.ts';
import type { AppData, BusinessProfile, LineItem, Settings } from './types.ts';

export const DATA_VERSION = 1;

/** Short, collision-safe id (no crypto dependency needed). */
export function newId(prefix = 'id'): string {
	const rand = Math.random().toString(36).slice(2, 8);
	return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export function emptyProfile(): BusinessProfile {
	return {
		name: '',
		logo: '',
		address: '',
		state: '',
		phone: '',
		email: '',
		website: '',
		gstin: '',
		pan: '',
		bank: { accountName: '', accountNumber: '', ifsc: '', bank: '', branch: '' },
		upiId: '',
		signature: ''
	};
}

export function defaultSettings(): Settings {
	return {
		currency: 'INR',
		dateFormat: 'dd-mm-yyyy',
		fyStartMonth: 4,
		invoiceSeries: { prefix: 'INV', useFy: true, padding: 4, next: {} },
		quotationSeries: { prefix: 'QTN', useFy: true, padding: 4, next: {} },
		defaultDueDays: 15,
		defaultValidDays: 30,
		defaultTerms: 'Payment due within the agreed period. Please quote the invoice number with your payment.',
		defaultNotes: 'Thank you for your business.',
		taxRates: [
			{ id: 'tax_0', bp: 0, label: '0%' },
			{ id: 'tax_5', bp: 500, label: '5%' },
			{ id: 'tax_18', bp: 1800, label: '18%' }
		],
		defaultTaxBp: 1800,
		template: 'classic',
		accent: '#4F46E5',
		taxInclusive: false,
		theme: 'system'
	};
}

export function emptyData(): AppData {
	return {
		version: DATA_VERSION,
		profile: emptyProfile(),
		settings: defaultSettings(),
		clients: [],
		items: [],
		docs: [],
		payments: [],
		recurring: [],
		lastBackupAt: '',
		sampleLoaded: false
	};
}

export function blankLine(taxBp: number, unit = 'nos'): LineItem {
	return {
		id: newId('line'),
		description: '',
		hsn: '',
		qty: 1000, // 1.000
		unit,
		rate: 0,
		discountKind: 'percent',
		discountValue: 0,
		taxBp
	};
}

export const UNITS = ['nos', 'hrs', 'days', 'pcs', 'kg', 'mtr', 'sqft', 'month', 'set', 'lot'];

export const PAYMENT_MODES = [
	{ id: 'cash', label: 'Cash' },
	{ id: 'upi', label: 'UPI' },
	{ id: 'bank', label: 'Bank transfer' },
	{ id: 'card', label: 'Card' },
	{ id: 'cheque', label: 'Cheque' },
	{ id: 'other', label: 'Other' }
] as const;

export const TEMPLATES = [
	{ id: 'classic', label: 'Classic', hint: 'Bordered table, formal header' },
	{ id: 'modern', label: 'Modern', hint: 'Accent band, airy spacing' },
	{ id: 'minimal', label: 'Minimal', hint: 'Hairlines only, lots of white' }
] as const;

/** Reminder threshold for the backup banner. */
export const BACKUP_REMINDER_DAYS = 14;

export const todayISO = today;
