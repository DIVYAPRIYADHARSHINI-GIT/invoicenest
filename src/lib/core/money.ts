// Integer-paise money arithmetic.
//
// RULE for the whole app: every amount is an integer number of paise (1/100 of a
// rupee). No float ever touches a money value, so the editor, preview, PDF and CSV
// always agree to the last paise.
//
// Quantities and percentages are the only fractional inputs; they are scaled to
// integers (milli-units / basis points) before being multiplied into paise.

/** Quantity is held as thousandths of a unit (3 decimal places). */
export const QTY_SCALE = 1000;
/** Percentages are held as basis points (2 decimal places): 18% -> 1800. */
export const PCT_SCALE = 100;

/** Rounds a rational n/d to the nearest integer, half away from zero (accounting rounding). */
export function divRound(n: number, d: number): number {
	if (d === 0) return 0;
	const neg = n < 0 !== d < 0;
	const a = Math.abs(n);
	const b = Math.abs(d);
	const q = Math.floor(a / b);
	const r = a - q * b;
	const up = r * 2 >= b ? 1 : 0;
	const mag = q + up;
	return neg ? -mag : mag;
}

/** paise x (scaled factor) / scale, rounded half away from zero. */
export function scaleBy(paise: number, scaled: number, scale: number): number {
	return divRound(paise * scaled, scale);
}

/** Applies a percentage given in basis points: pct(10000, 1800) === 1800 (18% of 100.00). */
export function pctOf(paise: number, bp: number): number {
	return divRound(paise * bp, 100 * PCT_SCALE);
}

/** Parses user text ("1,234.5", "₹1234", "-12.345") into integer paise. Invalid -> 0. */
export function toPaise(input: string | number | null | undefined): number {
	if (input === null || input === undefined || input === '') return 0;
	if (typeof input === 'number') {
		if (!Number.isFinite(input)) return 0;
		return divRound(Math.round(input * 1e6), 1e4);
	}
	const cleaned = input.replace(/[^0-9.\-]/g, '');
	if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return 0;
	const neg = cleaned.startsWith('-');
	const [whole = '0', frac = ''] = cleaned.replace(/-/g, '').split('.');
	const rupees = Number.parseInt(whole === '' ? '0' : whole, 10);
	if (!Number.isFinite(rupees)) return 0;
	// Round at the 3rd decimal so "1.005" -> 101 paise rather than 100.
	const fracDigits = (frac + '000').slice(0, 3);
	const paiseFrac = divRound(Number.parseInt(fracDigits, 10), 10);
	const total = rupees * 100 + paiseFrac;
	return neg ? -total : total;
}

/** Parses a quantity into thousandths of a unit. */
export function toQty(input: string | number | null | undefined): number {
	if (input === null || input === undefined || input === '') return 0;
	const n = typeof input === 'number' ? input : Number.parseFloat(String(input).replace(/[^0-9.\-]/g, ''));
	if (!Number.isFinite(n)) return 0;
	return Math.round(n * QTY_SCALE);
}

/** Parses a percentage into basis points. */
export function toPct(input: string | number | null | undefined): number {
	if (input === null || input === undefined || input === '') return 0;
	const n = typeof input === 'number' ? input : Number.parseFloat(String(input).replace(/[^0-9.\-]/g, ''));
	if (!Number.isFinite(n)) return 0;
	return Math.round(n * PCT_SCALE);
}

/** Plain decimal string of a paise value: 123456 -> "1234.56". Used by CSV. */
export function paiseToDecimal(paise: number): string {
	const neg = paise < 0;
	const a = Math.abs(Math.trunc(paise));
	const s = `${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
	return neg ? `-${s}` : s;
}

/** Quantity (thousandths) as a tidy string: 2500 -> "2.5", 2000 -> "2". */
export function qtyToString(qty: number): string {
	const neg = qty < 0;
	const a = Math.abs(Math.trunc(qty));
	const frac = String(a % QTY_SCALE).padStart(3, '0').replace(/0+$/, '');
	const s = frac ? `${Math.floor(a / QTY_SCALE)}.${frac}` : String(Math.floor(a / QTY_SCALE));
	return neg ? `-${s}` : s;
}

/** Basis points as a tidy percentage string: 1800 -> "18", 50 -> "0.5". */
export function pctToString(bp: number): string {
	const neg = bp < 0;
	const a = Math.abs(Math.trunc(bp));
	const frac = String(a % PCT_SCALE).padStart(2, '0').replace(/0+$/, '');
	const s = frac ? `${Math.floor(a / PCT_SCALE)}.${frac}` : String(Math.floor(a / PCT_SCALE));
	return neg ? `-${s}` : s;
}

/** Indian digit grouping on the integer part: 123456789 -> "12,34,56,789". */
export function groupIndian(digits: string): string {
	if (digits.length <= 3) return digits;
	const head = digits.slice(0, -3);
	const tail = digits.slice(-3);
	return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}`;
}

/** Western grouping for non-INR currencies: 1234567 -> "1,234,567". */
export function groupWestern(digits: string): string {
	return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const CURRENCY_SYMBOL: Record<string, string> = {
	INR: '\u20B9',
	USD: '$',
	EUR: '\u20AC',
	GBP: '\u00A3'
};

/** Formats paise for display. INR uses Indian grouping (1,23,456.78). */
export function formatAmount(paise: number, currency = 'INR', withSymbol = true): string {
	const neg = paise < 0;
	const a = Math.abs(Math.trunc(paise));
	const whole = String(Math.floor(a / 100));
	const frac = String(a % 100).padStart(2, '0');
	const grouped = currency === 'INR' ? groupIndian(whole) : groupWestern(whole);
	const sym = withSymbol ? (CURRENCY_SYMBOL[currency] ?? '') : '';
	return `${neg ? '-' : ''}${sym}${grouped}.${frac}`;
}

/** Rounds paise to the nearest whole rupee; returns the delta to add (the round-off line). */
export function roundOffDelta(paise: number): number {
	const rounded = divRound(paise, 100) * 100;
	return rounded - paise;
}

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
