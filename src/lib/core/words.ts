// Amount in words, Indian style (lakh / crore), from integer paise.
//
//   12345678 paise -> "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six
//                      and Seventy Eight Paise Only"
//
// Handles zero, paise-only amounts, zero paise, negatives and crore-scale values.

const ONES = [
	'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
	'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0-99 in words (empty string for 0). */
function under100(n: number): string {
	if (n === 0) return '';
	if (n < 20) return ONES[n];
	const t = TENS[Math.floor(n / 10)];
	const o = n % 10;
	return o ? `${t} ${ONES[o]}` : t;
}

/** 0-999 in words (empty string for 0). */
function under1000(n: number): string {
	if (n === 0) return '';
	const h = Math.floor(n / 100);
	const rest = n % 100;
	const parts: string[] = [];
	if (h) parts.push(`${ONES[h]} Hundred`);
	if (rest) parts.push(under100(rest));
	return parts.join(' ');
}

/** A non-negative integer in Indian words. 0 -> "Zero". */
export function numberToIndianWords(value: number): string {
	let n = Math.floor(Math.abs(value));
	if (n === 0) return 'Zero';
	const parts: string[] = [];
	// Beyond 99,99,99,999 keep stacking crores ("One Thousand Crore" etc).
	const crore = Math.floor(n / 10000000);
	n %= 10000000;
	const lakh = Math.floor(n / 100000);
	n %= 100000;
	const thousand = Math.floor(n / 1000);
	n %= 1000;
	if (crore) {
		// Recurse so very large values read as "... Thousand Crore".
		parts.push(`${crore < 1000 ? under1000(crore) : numberToIndianWords(crore)} Crore`);
	}
	if (lakh) parts.push(`${under100(lakh)} Lakh`);
	if (thousand) parts.push(`${under100(thousand)} Thousand`);
	if (n) parts.push(under1000(n));
	return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export interface WordsOptions {
	/** Major unit name, e.g. "Rupees". */
	major?: string;
	/** Minor unit name, e.g. "Paise". */
	minor?: string;
}

const UNIT_NAMES: Record<string, WordsOptions> = {
	INR: { major: 'Rupees', minor: 'Paise' },
	USD: { major: 'Dollars', minor: 'Cents' },
	EUR: { major: 'Euros', minor: 'Cents' },
	GBP: { major: 'Pounds', minor: 'Pence' }
};

/** Full "Rupees ... and ... Paise Only" sentence for a paise amount. */
export function amountInWords(paise: number, currency = 'INR'): string {
	const names = UNIT_NAMES[currency] ?? UNIT_NAMES.INR;
	const major = names.major ?? 'Rupees';
	const minor = names.minor ?? 'Paise';
	const neg = paise < 0;
	const abs = Math.abs(Math.trunc(paise));
	const rupees = Math.floor(abs / 100);
	const sub = abs % 100;

	let body: string;
	if (rupees === 0 && sub === 0) {
		body = `${major} Zero Only`;
	} else if (rupees === 0) {
		body = `${under100(sub)} ${minor} Only`;
	} else if (sub === 0) {
		body = `${major} ${numberToIndianWords(rupees)} Only`;
	} else {
		body = `${major} ${numberToIndianWords(rupees)} and ${under100(sub)} ${minor} Only`;
	}
	return neg ? `Minus ${body}` : body;
}
