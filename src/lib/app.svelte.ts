// Application state (Svelte 5 runes) on top of the InvoiceStore.
//
// One `$state` object holds the whole dataset. Mutations go through `commit`,
// which writes to localStorage and surfaces any storage error as a toast. Derived
// views are computed on demand (and memoised by a version counter) so a list of
// 1,000 documents never recomputes on every keystroke.

import { browser } from '$app/environment';
import { BACKUP_REMINDER_DAYS, emptyData, newId } from './core/defaults.ts';
import { addDays, daysBetween, today } from './core/dates.ts';
import { collectDue } from './core/recurring.ts';
import { buildSampleData } from './core/sample.ts';
import { dashboardStats, viewAll, type DashboardStats, type DocView } from './core/select.ts';
import { createLocalStore, normalise, type LocalStore } from './core/store.ts';
import type { AppData, InvoiceDoc } from './core/types.ts';

export interface Toast {
	id: string;
	message: string;
	tone: 'info' | 'success' | 'error';
}

const store: LocalStore = createLocalStore();

class AppState {
	data = $state<AppData>(emptyData());
	loaded = $state(false);
	toasts = $state<Toast[]>([]);
	storageNote = $state('');
	/** Bumped on every commit; used to invalidate memoised selectors. */
	version = $state(0);
	/** Set when recurring drafts were generated during this app open. */
	recurringNotice = $state<{ count: number; numbers: string[] }>({ count: 0, numbers: [] });

	load() {
		if (this.loaded || !browser) return;
		const hadStoredData = store.available() && store.hasSaved();
		this.data = store.load();
		this.loaded = true;
		if (store.status === 'memory' || store.status === 'error') this.storageNote = store.lastError;
		// First ever visit: pre-load the clearly fictional sample workspace so every
		// page and chart shows realistic content instead of empty states. "Start
		// fresh" writes an empty dataset, which counts as stored data, so it is
		// never overwritten by this.
		if (!hadStoredData) {
			this.data = buildSampleData();
			store.save($state.snapshot(this.data) as AppData);
			this.version += 1;
		}
		this.runRecurring();
	}

	commit(mutate: (d: AppData) => void, message?: string) {
		mutate(this.data);
		this.version += 1;
		const res = store.save($state.snapshot(this.data) as AppData);
		if (!res.ok && res.error) this.toast(res.error, 'error');
		else if (message) this.toast(message, 'success');
		return res.ok;
	}

	replace(data: AppData, message?: string) {
		this.data = normalise(data);
		this.version += 1;
		const res = store.save($state.snapshot(this.data) as AppData);
		if (!res.ok && res.error) this.toast(res.error, 'error');
		else if (message) this.toast(message, 'success');
		return res.ok;
	}

	toast(message: string, tone: Toast['tone'] = 'info') {
		const id = newId('toast');
		this.toasts = [...this.toasts, { id, message, tone }];
		if (browser) setTimeout(() => this.dismiss(id), tone === 'error' ? 7000 : 4000);
	}

	dismiss(id: string) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	// ---- derived ----

	get views(): DocView[] {
		return viewAll(this.data);
	}

	get stats(): DashboardStats {
		return dashboardStats(this.data);
	}

	get invoices(): DocView[] {
		return this.views.filter((v) => v.doc.type === 'invoice');
	}

	get quotations(): DocView[] {
		return this.views.filter((v) => v.doc.type === 'quotation');
	}

	clientName(id: string): string {
		const c = this.data.clients.find((x) => x.id === id);
		return c ? c.company || c.name : 'Unknown client';
	}

	/** Days since the last JSON backup, or null when there has never been one. */
	get backupAgeDays(): number | null {
		if (!this.data.lastBackupAt) return null;
		const d = this.data.lastBackupAt.slice(0, 10);
		return Math.max(0, daysBetween(d, today()));
	}

	get backupOverdue(): boolean {
		const age = this.backupAgeDays;
		if (age === null) return this.data.docs.length > 0;
		return age >= BACKUP_REMINDER_DAYS;
	}

	get storageStatus() {
		return { status: store.status, error: store.lastError, usedBytes: store.usedBytes() };
	}

	markBackedUp() {
		this.commit((d) => {
			d.lastBackupAt = new Date().toISOString();
		});
	}

	// ---- sample / reset ----

	loadSample() {
		this.replace(buildSampleData(), 'Sample data loaded.');
	}

	startFresh() {
		store.clear();
		this.replace(emptyData(), 'All data cleared. Starting fresh.');
	}

	// ---- recurring ----

	/** Generates drafts for any due recurring template; runs once per app open. */
	runRecurring() {
		const data = this.data;
		if (!data.recurring.some((r) => r.active)) return;
		const run = collectDue($state.snapshot(data).recurring, today());
		if (run.occurrences.length === 0) return;

		const created: string[] = [];
		this.commit((d) => {
			const used = new Set(d.docs.map((x) => x.number.toLowerCase()));
			for (const occ of run.occurrences) {
				const tpl = d.recurring.find((r) => r.id === occ.templateId);
				if (!tpl) continue;
				const number = this.reserveNumber(d, 'invoice', occ.date, used);
				used.add(number.toLowerCase());
				const doc: InvoiceDoc = {
					id: newId('in'),
					type: 'invoice',
					number,
					date: occ.date,
					dueDate: addDays(occ.date, d.settings.defaultDueDays),
					clientId: tpl.clientId,
					placeOfSupply: tpl.placeOfSupply,
					reference: `Recurring: ${tpl.title}`,
					lines: tpl.lines.map((l) => ({ ...l, id: newId('line') })),
					charges: tpl.charges.map((c) => ({ ...c, id: newId('ch') })),
					taxInclusive: tpl.taxInclusive,
					roundOff: true,
					notes: tpl.notes || d.settings.defaultNotes,
					terms: tpl.terms || d.settings.defaultTerms,
					signature: '',
					template: d.settings.template,
					status: 'draft',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				};
				d.docs.push(doc);
				created.push(number);
			}
			d.recurring = run.templates;
		});
		if (created.length) this.recurringNotice = { count: created.length, numbers: created };
	}

	/** Reserves the next free number inside an open commit and advances the series. */
	reserveNumber(d: AppData, type: 'invoice' | 'quotation', date: string, used: Set<string>): string {
		const series = type === 'invoice' ? d.settings.invoiceSeries : d.settings.quotationSeries;
		const fyStart = d.settings.fyStartMonth;
		const y = Number(date.slice(0, 4));
		const m = Number(date.slice(5, 7));
		const startYear = m >= fyStart ? y : y - 1;
		const fyKey = `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
		let seq = Math.max(1, series.next[fyKey] ?? 1);
		const make = (n: number) => {
			const parts: string[] = [];
			if (series.prefix.trim()) parts.push(series.prefix.trim());
			if (series.useFy) parts.push(fyKey);
			parts.push(String(n).padStart(Math.max(1, series.padding), '0'));
			return parts.join('/');
		};
		let number = make(seq);
		for (let guard = 0; guard < 100000 && used.has(number.toLowerCase()); guard++) {
			seq += 1;
			number = make(seq);
		}
		const nextMap = { ...series.next, [fyKey]: seq + 1 };
		if (type === 'invoice') d.settings.invoiceSeries = { ...series, next: nextMap };
		else d.settings.quotationSeries = { ...series, next: nextMap };
		return number;
	}
}

export const app = new AppState();
