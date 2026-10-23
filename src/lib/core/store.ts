// The ONE InvoiceStore implementation: browser localStorage.
//
// Storage rules for this project (deliberate, see README):
//   - no database, no KV, no Blob, no external service, no API key
//   - every read and write is wrapped in try/catch
//   - a size check runs before each save so a quota error is reported, not thrown
//   - when localStorage is unavailable (private mode, blocked cookies) the app
//     falls back to an in-memory store for the session and says so in the UI
//
// Swapping in a database later means writing another InvoiceStore - nothing else.

import { DATA_VERSION, defaultSettings, emptyData, emptyProfile } from './defaults.ts';
import type { AppData, InvoiceStore } from './types.ts';

export const STORAGE_KEY = 'invoicenest.v1';
/** Warn above ~4 MB; browsers typically allow 5 MB per origin. */
export const SIZE_WARN_BYTES = 4_000_000;
export const SIZE_MAX_BYTES = 4_800_000;

export type StoreStatus = 'ready' | 'memory' | 'error';

/** Fills in anything missing so an older or hand-edited backup still loads. */
export function normalise(raw: unknown): AppData {
	const base = emptyData();
	if (!raw || typeof raw !== 'object') return base;
	const d = raw as Partial<AppData>;
	const settings = { ...base.settings, ...(d.settings ?? {}) };
	// Nested objects need their own merge so a partial backup cannot blank them.
	settings.invoiceSeries = { ...base.settings.invoiceSeries, ...(d.settings?.invoiceSeries ?? {}) };
	settings.quotationSeries = { ...base.settings.quotationSeries, ...(d.settings?.quotationSeries ?? {}) };
	if (!Array.isArray(settings.taxRates) || settings.taxRates.length === 0) settings.taxRates = defaultSettings().taxRates;
	const profile = { ...emptyProfile(), ...(d.profile ?? {}) };
	profile.bank = { ...emptyProfile().bank, ...(d.profile?.bank ?? {}) };
	return {
		version: DATA_VERSION,
		profile,
		settings,
		clients: Array.isArray(d.clients) ? d.clients : [],
		items: Array.isArray(d.items) ? d.items : [],
		docs: Array.isArray(d.docs) ? d.docs : [],
		payments: Array.isArray(d.payments) ? d.payments : [],
		recurring: Array.isArray(d.recurring) ? d.recurring : [],
		lastBackupAt: typeof d.lastBackupAt === 'string' ? d.lastBackupAt : '',
		sampleLoaded: Boolean(d.sampleLoaded)
	};
}

/**
 * Deep clone of reactive state into a plain object.
 *
 * `$state.snapshot` is only available inside `.svelte` / `.svelte.ts` modules, so
 * plain `.ts` helpers (CSV builders, PDF payloads, backups) use this instead.
 * Passing a Svelte proxy into JSON.stringify works, but structuredClone does not,
 * hence the JSON round-trip.
 */
export function plain<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/** Approximate UTF-16 byte size of the serialised payload. */
export function byteSize(json: string): number {
	// Fast and dependency free: most content is ASCII, data URLs are base64 (ASCII).
	return new Blob([json]).size;
}

function memoryStore(seed: AppData): InvoiceStore {
	let data = seed;
	return {
		available: () => false,
		hasSaved: () => true,
		load: () => data,
		save: (next) => {
			data = next;
			return { ok: true };
		},
		clear: () => {
			data = emptyData();
		}
	};
}

export interface LocalStore extends InvoiceStore {
	status: StoreStatus;
	lastError: string;
	/** Current serialised size in bytes (0 when unknown). */
	usedBytes(): number;
}

export function createLocalStore(): LocalStore {
	let status: StoreStatus = 'ready';
	let lastError = '';
	let fallback: InvoiceStore | null = null;

	const ls = (): Storage | null => {
		try {
			if (typeof localStorage === 'undefined') return null;
			const probe = '__invoicenest_probe__';
			localStorage.setItem(probe, '1');
			localStorage.removeItem(probe);
			return localStorage;
		} catch {
			return null;
		}
	};

	const store: LocalStore = {
		get status() {
			return status;
		},
		get lastError() {
			return lastError;
		},
		available() {
			return ls() !== null;
		},
		hasSaved() {
			try {
				return ls()?.getItem(STORAGE_KEY) !== null && ls()?.getItem(STORAGE_KEY) !== undefined;
			} catch {
				return false;
			}
		},
		usedBytes() {
			try {
				return byteSize(ls()?.getItem(STORAGE_KEY) ?? '');
			} catch {
				return 0;
			}
		},
		load() {
			const s = ls();
			if (!s) {
				status = 'memory';
				lastError = 'This browser is blocking local storage, so your data will only last for this session.';
				fallback = fallback ?? memoryStore(emptyData());
				return fallback.load();
			}
			try {
				const raw = s.getItem(STORAGE_KEY);
				if (!raw) return emptyData();
				return normalise(JSON.parse(raw));
			} catch (err) {
				status = 'error';
				lastError = `Saved data could not be read (${(err as Error).message}). Starting from an empty workspace.`;
				return emptyData();
			}
		},
		save(data) {
			const s = ls();
			if (!s) {
				status = 'memory';
				fallback = fallback ?? memoryStore(data);
				fallback.save(data);
				return { ok: false, error: 'Local storage is unavailable, so this change is only kept for the current session.' };
			}
			let json: string;
			try {
				json = JSON.stringify(data);
			} catch (err) {
				return { ok: false, error: `Could not prepare the data for saving: ${(err as Error).message}` };
			}
			const size = byteSize(json);
			if (size > SIZE_MAX_BYTES) {
				return {
					ok: false,
					error: `Your data is ${(size / 1_000_000).toFixed(1)} MB, which is too large for browser storage. Export a JSON backup, then remove old documents or a large logo.`
				};
			}
			try {
				s.setItem(STORAGE_KEY, json);
				status = 'ready';
				lastError = '';
				return { ok: true };
			} catch (err) {
				const msg = (err as Error).name === 'QuotaExceededError' || /quota/i.test(String(err))
					? 'Browser storage is full. Export a JSON backup, then delete old documents or use a smaller logo.'
					: `Could not save to this browser: ${(err as Error).message}`;
				status = 'error';
				lastError = msg;
				return { ok: false, error: msg };
			}
		},
		clear() {
			try {
				ls()?.removeItem(STORAGE_KEY);
			} catch {
				/* ignore - nothing we can do, the UI already warns */
			}
		}
	};
	return store;
}
