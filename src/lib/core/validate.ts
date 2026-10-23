// Field validation: GSTIN, IFSC, PAN, email, phone, UPI, hex colour.
// Every function returns null when valid, or a short human message.

import { isStateCode, stateName } from './states.ts';

/**
 * GSTIN: 15 characters - 2 digit state code, 10 character PAN, 1 entity digit/letter,
 * the literal 'Z' (normally), then 1 check character.
 * Also verifies the state code exists and matches the selected state.
 */
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validateGstin(value: string, expectedState?: string): string | null {
	const v = (value ?? '').trim().toUpperCase();
	if (!v) return null; // optional
	if (v.length !== 15) return 'GSTIN must be exactly 15 characters.';
	if (!GSTIN_RE.test(v)) return 'GSTIN format looks wrong. Expected 22AAAAA0000A1Z5.';
	const code = v.slice(0, 2);
	if (!isStateCode(code)) return `"${code}" is not a valid GST state code.`;
	if (expectedState && code !== expectedState) {
		return `GSTIN starts with ${code} (${stateName(code)}) but the selected state is ${expectedState} (${stateName(expectedState)}).`;
	}
	return null;
}

/** IFSC: 4 letters (bank), '0', then 6 alphanumerics (branch). */
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function validateIfsc(value: string): string | null {
	const v = (value ?? '').trim().toUpperCase();
	if (!v) return null;
	if (v.length !== 11) return 'IFSC must be exactly 11 characters.';
	if (!IFSC_RE.test(v)) return 'IFSC format looks wrong. Expected HDFC0001234 (5th character is zero).';
	return null;
}

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function validatePan(value: string): string | null {
	const v = (value ?? '').trim().toUpperCase();
	if (!v) return null;
	if (!PAN_RE.test(v)) return 'PAN format looks wrong. Expected AAAAA0000A.';
	return null;
}

export function validateEmail(value: string, required = false): string | null {
	const v = (value ?? '').trim();
	if (!v) return required ? 'Email is required.' : null;
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email address.';
	return null;
}

/** Accepts 10-digit Indian mobiles and +country forms; ignores spaces, dashes, brackets. */
export function validatePhone(value: string, required = false): string | null {
	const raw = (value ?? '').trim();
	if (!raw) return required ? 'Phone is required.' : null;
	const digits = raw.replace(/[\s\-()]/g, '');
	if (!/^\+?[0-9]{7,15}$/.test(digits)) return 'Enter a valid phone number (7 to 15 digits).';
	if (/^[0-9]{10}$/.test(digits) && !/^[6-9]/.test(digits)) return 'An Indian 10-digit mobile number starts with 6, 7, 8 or 9.';
	return null;
}

export function validateUpi(value: string): string | null {
	const v = (value ?? '').trim();
	if (!v) return null;
	if (!/^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9.\-]{1,30}$/.test(v)) return 'UPI ID looks wrong. Expected name@bank.';
	return null;
}

export function validateRequired(value: string, label: string): string | null {
	return (value ?? '').trim() ? null : `${label} is required.`;
}

export function validateAccent(value: string): string | null {
	return /^#[0-9a-fA-F]{6}$/.test((value ?? '').trim()) ? null : 'Use a hex colour like #4F46E5.';
}

/** Account number: digits only, 6-20 long (Indian banks vary). */
export function validateAccountNumber(value: string): string | null {
	const v = (value ?? '').trim();
	if (!v) return null;
	if (!/^[0-9]{6,20}$/.test(v)) return 'Account number should be 6 to 20 digits.';
	return null;
}

export type Errors = Record<string, string>;

/** Drops null entries so a caller can test `Object.keys(errors).length`. */
export function collect(entries: Record<string, string | null>): Errors {
	const out: Errors = {};
	for (const [k, v] of Object.entries(entries)) if (v) out[k] = v;
	return out;
}
