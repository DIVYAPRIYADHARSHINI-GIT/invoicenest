// Plain calendar dates as 'YYYY-MM-DD' strings.
//
// Everything here works on the local calendar day and never calls Date.parse on a
// bare date string (which would be read as UTC and can shift the day backwards in
// IST). Construction is always new Date(y, m-1, d) in local time.

export type ISODate = string;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of a timestamp (defaults to now) as YYYY-MM-DD. */
export function today(now: Date = new Date()): ISODate {
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Parses YYYY-MM-DD into a local Date at midnight. Invalid input -> null. */
export function parseISO(d: ISODate | null | undefined): Date | null {
	if (!d) return null;
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
	if (!m) return null;
	const y = Number(m[1]);
	const mo = Number(m[2]);
	const da = Number(m[3]);
	if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
	const dt = new Date(y, mo - 1, da);
	if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== da) return null;
	return dt;
}

export const isValidDate = (d: string): boolean => parseISO(d) !== null;

export function toISO(dt: Date): ISODate {
	return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Adds whole days on the local calendar (DST safe because it re-normalises). */
export function addDays(d: ISODate, days: number): ISODate {
	const dt = parseISO(d);
	if (!dt) return d;
	dt.setDate(dt.getDate() + days);
	return toISO(dt);
}

/** Adds months, clamping to the end of a short month (31 Jan + 1 month -> 28/29 Feb). */
export function addMonths(d: ISODate, months: number): ISODate {
	const dt = parseISO(d);
	if (!dt) return d;
	const day = dt.getDate();
	dt.setDate(1);
	dt.setMonth(dt.getMonth() + months);
	const lastDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
	dt.setDate(Math.min(day, lastDay));
	return toISO(dt);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
	const da = parseISO(a);
	const db = parseISO(b);
	if (!da || !db) return 0;
	// Compare at UTC noon of each local calendar day so DST cannot round to 0.99 days.
	const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
	const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
	return Math.round((ub - ua) / 86400000);
}

export const isBefore = (a: ISODate, b: ISODate): boolean => daysBetween(a, b) > 0;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats a stored date for display in the user's chosen format. */
export function formatDate(d: ISODate, format = 'dd-mm-yyyy'): string {
	const dt = parseISO(d);
	if (!dt) return d ?? '';
	const dd = pad(dt.getDate());
	const mm = pad(dt.getMonth() + 1);
	const yyyy = String(dt.getFullYear());
	switch (format) {
		case 'dd/mm/yyyy':
			return `${dd}/${mm}/${yyyy}`;
		case 'yyyy-mm-dd':
			return `${yyyy}-${mm}-${dd}`;
		case 'd-mmm-yyyy':
			return `${dt.getDate()}-${MONTHS_SHORT[dt.getMonth()]}-${yyyy}`;
		default:
			return `${dd}-${mm}-${yyyy}`;
	}
}

export interface FinancialYear {
	/** e.g. '2026-27' */
	key: string;
	start: ISODate;
	end: ISODate;
	startYear: number;
}

/** The financial year containing a date, for a configurable start month (April = 4). */
export function financialYear(d: ISODate, startMonth = 4): FinancialYear {
	const dt = parseISO(d) ?? new Date();
	const month = dt.getMonth() + 1;
	const startYear = month >= startMonth ? dt.getFullYear() : dt.getFullYear() - 1;
	const endYear = startYear + 1;
	const start = `${startYear}-${pad(startMonth)}-01`;
	const endMonth = startMonth === 1 ? 12 : startMonth - 1;
	const endYearActual = startMonth === 1 ? startYear : endYear;
	const lastDay = new Date(endYearActual, endMonth, 0).getDate();
	return {
		key: `${startYear}-${String(endYear % 100).padStart(2, '0')}`,
		start,
		end: `${endYearActual}-${pad(endMonth)}-${pad(lastDay)}`,
		startYear
	};
}

/** Inclusive date-range check. */
export function inRange(d: ISODate, start: ISODate, end: ISODate): boolean {
	return daysBetween(start, d) >= 0 && daysBetween(d, end) >= 0;
}

/** 'YYYY-MM' bucket of a date, used by the revenue chart. */
export const monthKey = (d: ISODate): string => (d ?? '').slice(0, 7);

export function monthLabel(key: string): string {
	const [y, m] = key.split('-');
	const idx = Number(m) - 1;
	return `${MONTHS_SHORT[idx] ?? m} ${String(y).slice(2)}`;
}
