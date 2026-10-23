// Status rules, overdue calculation, payments and balances.
//
// Overdue and Expired are NEVER stored. They are derived from the due date at read
// time, so simply opening the app on a later day shows the right state.

import { daysBetween, today } from './dates.ts';
import type { DerivedStatus, InvoiceDoc, Payment } from './types.ts';

export const STATUS_LABEL: Record<DerivedStatus, string> = {
	draft: 'Draft',
	sent: 'Sent',
	partial: 'Partially paid',
	paid: 'Paid',
	overdue: 'Overdue',
	cancelled: 'Cancelled',
	accepted: 'Accepted',
	declined: 'Declined',
	expired: 'Expired'
};

/** Semantic tone used for the status pill colour (never the only signal - text too). */
export const STATUS_TONE: Record<DerivedStatus, 'neutral' | 'warn' | 'good' | 'bad'> = {
	draft: 'neutral',
	sent: 'warn',
	partial: 'warn',
	paid: 'good',
	overdue: 'bad',
	cancelled: 'bad',
	accepted: 'good',
	declined: 'bad',
	expired: 'bad'
};

export const paymentsFor = (payments: Payment[], invoiceId: string): Payment[] => payments.filter((p) => p.invoiceId === invoiceId);

export const paidAmount = (payments: Payment[], invoiceId: string): number => paymentsFor(payments, invoiceId).reduce((s, p) => s + p.amount, 0);

/** Balance due, floored at zero (an advance does not create a negative balance). */
export function balanceDue(total: number, paid: number): number {
	return Math.max(0, total - paid);
}

/**
 * The status to display. `paid` is the total received and `total` the grand total.
 * - cancelled / declined / accepted are terminal stored states and pass through
 * - full payment wins over everything else
 * - part payment shows "Partially paid"
 * - an unpaid invoice past its due date shows "Overdue"
 * - an open quotation past its valid-until date shows "Expired"
 */
export function derivedStatus(doc: InvoiceDoc, total: number, paid: number, now: string = today()): DerivedStatus {
	if (doc.status === 'cancelled') return 'cancelled';
	if (doc.type === 'quotation') {
		if (doc.status === 'accepted') return 'accepted';
		if (doc.status === 'declined') return 'declined';
		if (doc.dueDate && daysBetween(doc.dueDate, now) > 0) return 'expired';
		return doc.status as DerivedStatus;
	}
	if (paid > 0 && paid >= total && total > 0) return 'paid';
	if (doc.status === 'paid' && total === 0) return 'paid';
	if (paid > 0) {
		// A part-paid invoice that is also late still reads as Overdue (the more urgent fact).
		if (doc.dueDate && daysBetween(doc.dueDate, now) > 0) return 'overdue';
		return 'partial';
	}
	if (doc.status === 'draft') return 'draft';
	if (doc.dueDate && daysBetween(doc.dueDate, now) > 0) return 'overdue';
	return doc.status as DerivedStatus;
}

/** Days late (0 when not overdue). */
export function overdueDays(dueDate: string, now: string = today()): number {
	if (!dueDate) return 0;
	return Math.max(0, daysBetween(dueDate, now));
}

/** A saved invoice with any payment recorded may not be edited - only cancelled. */
export function canEdit(doc: InvoiceDoc, paid: number): boolean {
	if (doc.status === 'cancelled') return false;
	if (doc.type === 'invoice' && paid > 0) return false;
	return true;
}

export function canDelete(doc: InvoiceDoc, paid: number): boolean {
	return paid === 0;
}

export function canRecordPayment(doc: InvoiceDoc): boolean {
	return doc.type === 'invoice' && doc.status !== 'cancelled';
}

/** Statuses a user may switch to manually (derived states are not selectable). */
export function allowedTransitions(doc: InvoiceDoc, paid: number): string[] {
	if (doc.status === 'cancelled') return [];
	if (doc.type === 'quotation') {
		const base = ['draft', 'sent', 'accepted', 'declined', 'cancelled'];
		return base.filter((s) => s !== doc.status);
	}
	if (paid > 0) return ['cancelled'];
	return ['draft', 'sent', 'cancelled'].filter((s) => s !== doc.status);
}

export interface PaymentCheck {
	ok: boolean;
	/** True when the amount exceeds the balance and needs an explicit advance confirmation. */
	needsAdvanceConfirm: boolean;
	error?: string;
}

/** Validates a payment amount against the remaining balance. */
export function checkPayment(amount: number, balance: number, confirmedAdvance = false): PaymentCheck {
	if (amount <= 0) return { ok: false, needsAdvanceConfirm: false, error: 'Enter an amount greater than zero.' };
	if (amount > balance) {
		if (!confirmedAdvance) {
			return { ok: false, needsAdvanceConfirm: true, error: 'This is more than the balance due. Confirm it as an advance to continue.' };
		}
		return { ok: true, needsAdvanceConfirm: true };
	}
	return { ok: true, needsAdvanceConfirm: false };
}
