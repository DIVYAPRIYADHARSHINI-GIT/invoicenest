// Recurring invoice generation.
//
// There is no server and no cron (free Hobby plan, browser-only storage), so due
// recurring templates are materialised as DRAFT invoices when the app is opened.
// If the app is not opened for a while, every missed occurrence is still generated
// (bounded) and the next date is rolled forward past today.

import { addDays, addMonths, daysBetween, today } from './dates.ts';
import type { Frequency, RecurringTemplate } from './types.ts';

export const FREQUENCY_LABEL: Record<Frequency, string> = {
	weekly: 'Weekly',
	monthly: 'Monthly',
	quarterly: 'Quarterly',
	yearly: 'Yearly'
};

/** The date one period after `date`. */
export function advance(date: string, frequency: Frequency): string {
	switch (frequency) {
		case 'weekly':
			return addDays(date, 7);
		case 'monthly':
			return addMonths(date, 1);
		case 'quarterly':
			return addMonths(date, 3);
		case 'yearly':
			return addMonths(date, 12);
	}
}

export interface DueOccurrence {
	templateId: string;
	date: string;
}

export interface RecurringRun {
	occurrences: DueOccurrence[];
	/** Templates with their nextDate rolled forward. */
	templates: RecurringTemplate[];
}

/**
 * Finds every occurrence due on or before `now` and rolls nextDate forward.
 * `maxPerTemplate` keeps a long-dormant template from flooding the list.
 */
export function collectDue(templates: RecurringTemplate[], now: string = today(), maxPerTemplate = 12): RecurringRun {
	const occurrences: DueOccurrence[] = [];
	const updated = templates.map((t) => {
		if (!t.active || !t.nextDate) return t;
		let cursor = t.nextDate;
		let made = 0;
		while (daysBetween(cursor, now) >= 0 && made < maxPerTemplate) {
			occurrences.push({ templateId: t.id, date: cursor });
			cursor = advance(cursor, t.frequency);
			made += 1;
		}
		// Even if capped, never leave nextDate in the past.
		while (daysBetween(cursor, now) >= 0) cursor = advance(cursor, t.frequency);
		if (made === 0) return t;
		return { ...t, nextDate: cursor, lastRunAt: new Date().toISOString() };
	});
	return { occurrences, templates: updated };
}
