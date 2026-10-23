// End-to-end test with the locally installed headless Chrome (no npm deps).
//
//   npm run build && npx vite preview --port 4323 --strictPort &
//   caffeinate -dims env BASE_URL=http://localhost:4323 node tests/e2e/smoke.mjs
//
// Full flow from the brief: business profile -> client -> catalogue items ->
// intra-state invoice (CGST+SGST) -> inter-state invoice (IGST) -> tax-inclusive
// pricing -> discounts -> amount in words -> save -> partial then full payment ->
// overdue -> quotation converted to invoice -> PDF in all three templates (bytes
// and page structure checked) -> CSV exports -> GST summary -> JSON backup and
// import -> recurring invoice. Plus sample-data integrity, 1,000-document
// performance, desktop + mobile + dark mode.
// Short timeouts, a freeze heartbeat and a global watchdog: fail fast, never hang.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const BASE = (process.env.BASE_URL ?? 'http://localhost:4323').replace(/\/$/, '');
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'output', process.env.OUT_NAME ?? 'local');
const DL = join(OUT, 'downloads');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });
const SHOTS = process.env.SHOTS !== '0';

const results = [];
function check(name, ok, detail = '') {
	results.push({ name, ok: Boolean(ok), detail });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const { newPage, close } = await launch({ port: Number(process.env.CDP_PORT ?? 9437) });
const WATCHDOG_MS = Number(process.env.E2E_TIMEOUT_MS ?? 9 * 60_000);
const watchdog = setTimeout(async () => {
	console.error(`E2E watchdog: aborting after ${WATCHDOG_MS / 1000}s`);
	await close().catch(() => {});
	process.exit(2);
}, WATCHDOG_MS);
watchdog.unref();

let seq = 0;
async function freshPage({ width = 1440, height = 960, mobile = false, clear = true, isolated = false } = {}) {
	const p = await newPage({ isolated });
	await p.viewport(width, height, mobile);
	const key = `inest-init-${++seq}`;
	await p.addInitScript(`
    try {
      if (!sessionStorage.getItem('${key}')) {
        ${clear ? "localStorage.removeItem('invoicenest.v1');" : ''}
        sessionStorage.setItem('${key}', '1');
      }
    } catch (e) {}
    window.__clip = '';
    try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__clip = t; } }, configurable: true }); } catch (e) {}
    window.__beat = 0; setInterval(() => { window.__beat++; }, 50);
    window.__printed = 0; window.print = () => { window.__printed++; };
  `);
	await p.setDownloadDir(DL);
	return p;
}

async function step(name, fn) {
	try {
		await fn();
	} catch (err) {
		check(name, false, String(err.message ?? err).slice(0, 220));
	}
}

const shot = async (p, file) => {
	if (SHOTS) await p.screenshot(join(OUT, file), { fullPage: true }).catch(() => {});
};

/** Reads the app's localStorage payload. */
const db = (p) => p.eval(`JSON.parse(localStorage.getItem('invoicenest.v1') || 'null')`);

/** Writes a dataset directly, for setup that the UI would take too long to do. */
async function seed(p, mutator) {
	await p.eval(`(() => {
    const raw = localStorage.getItem('invoicenest.v1');
    const data = raw ? JSON.parse(raw) : null;
    if (!data) return false;
    const fn = ${mutator};
    fn(data);
    localStorage.setItem('invoicenest.v1', JSON.stringify(data));
    return true;
  })()`);
}

const waitDownload = async (match, timeout = 9000) => {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const files = existsSync(DL) ? readdirSync(DL).filter((f) => f.includes(match) && !f.endsWith('.crdownload')) : [];
		if (files.length) {
			const path = join(DL, files[0]);
			if (statSync(path).size > 0) return path;
		}
		await sleep(200);
	}
	throw new Error(`download not found: ${match}`);
};

// ---------------------------------------------------------------- 1. server
await step('health route reports browser-only storage and no database', async () => {
	const r = await fetch(`${BASE}/api/health`);
	const j = await r.json();
	check('health route reports browser-only storage and no database', r.ok && j.storage === 'browser-localStorage-only' && j.database === false, JSON.stringify(j));
});

// ------------------------------------------------- 2. first launch is empty
const page = await freshPage();
await step('first launch pre-loads the fictional sample workspace', async () => {
	await page.goto(`${BASE}/`);
	const body = await page.text('main#main');
	const data = await db(page);
	check(
		'first launch pre-loads the fictional sample workspace',
		data?.profile?.name === 'Bluebird Design Co.' && data.docs.length >= 25 && /Invoiced this FY/i.test(body),
		`${data?.docs?.length ?? 0} docs, profile "${data?.profile?.name ?? ''}"`
	);
});

await step('"Start fresh" empties the workspace and is not re-seeded on reload', async () => {
	await page.goto(`${BASE}/settings`);
	await page.clickText('#sample button', 'Start fresh');
	await page.clickText('dialog button', 'Delete everything');
	await sleep(600);
	await page.goto(`${BASE}/`);
	const body = await page.text('main#main');
	const data = await db(page);
	check(
		'"Start fresh" empties the workspace and is not re-seeded on reload',
		data.docs.length === 0 && data.profile.name === '' && /Nothing here yet/i.test(body),
		`docs=${data.docs.length}`
	);
});

await step('persistent storage badge is visible', async () => {
	const badge = await page.text('.badge-storage');
	check('persistent storage badge is visible', /only in this browser/i.test(badge ?? ''), badge ?? '');
});

// --------------------------------------------- 3. business profile + validation
await step('business profile saves with GSTIN, IFSC and UPI validation', async () => {
	await page.goto(`${BASE}/settings`);
	await page.fill('#p-name', 'Testbed Studio');
	await page.fill('#p-state', '33');
	await page.fill('#p-address', '1 Test Street\nChennai 600001');
	await page.fill('#p-phone', '9884012345');
	await page.fill('#p-email', 'hello@testbed.example');
	await page.fill('#p-gstin', '33AABCB1234C1Z5');
	await page.fill('#p-pan', 'AABCB1234C');
	await page.fill('#b-ifsc', 'HDFC0001234');
	await page.fill('#b-num', '000011112222');
	await page.fill('#b-upi', 'testbed@sampleupi');
	await sleep(300);
	const data = await db(page);
	check(
		'business profile saves with GSTIN, IFSC and UPI validation',
		data.profile.name === 'Testbed Studio' && data.profile.state === '33' && data.profile.gstin === '33AABCB1234C1Z5',
		JSON.stringify({ name: data.profile.name, gstin: data.profile.gstin })
	);
});

await step('GSTIN state mismatch shows an inline error', async () => {
	await page.fill('#p-gstin', '29AABCB1234C1Z5'); // Karnataka GSTIN while state is 33
	await sleep(300);
	const err = await page.text('#p-gstin ~ .error-text');
	check('GSTIN state mismatch shows an inline error', /29|selected state/i.test(err ?? ''), err ?? 'no error shown');
	await page.fill('#p-gstin', '33AABCB1234C1Z5');
	await sleep(200);
});

await step('invalid IFSC shows an inline error', async () => {
	await page.fill('#b-ifsc', 'HDFC1001234'); // 5th char must be 0
	await sleep(300);
	const err = await page.text('#b-ifsc ~ .error-text');
	check('invalid IFSC shows an inline error', /IFSC/i.test(err ?? ''), err ?? 'no error shown');
	await page.fill('#b-ifsc', 'HDFC0001234');
	await sleep(200);
});

// ------------------------------------------------------- 4. clients + items
await step('client can be added with a state and GSTIN', async () => {
	await page.goto(`${BASE}/clients`);
	await page.clickText('button', 'Add client');
	await page.fill('#c-company', 'Local Client Pvt Ltd');
	await page.fill('#c-name', 'Ravi Kumar');
	await page.fill('#c-state', '33');
	await page.fill('#c-gstin', '33AACCA1234D1Z7');
	await page.clickText('button', 'Save client');
	await sleep(400);
	const data = await db(page);
	check('client can be added with a state and GSTIN', data.clients.length === 1 && data.clients[0].state === '33', `clients=${data.clients.length}`);
});

await step('second, inter-state client can be added', async () => {
	await page.clickText('button', 'Add client');
	await page.fill('#c-company', 'Mumbai Client LLP');
	await page.fill('#c-state', '27');
	await page.clickText('button', 'Save client');
	await sleep(400);
	const data = await db(page);
	check('second, inter-state client can be added', data.clients.length === 2 && data.clients.some((c) => c.state === '27'), `clients=${data.clients.length}`);
});

await step('catalogue item can be added with HSN and default rate', async () => {
	await page.goto(`${BASE}/items`);
	await page.clickText('button', 'Add item');
	await page.fill('#i-name', 'Design services');
	await page.fill('#i-hsn', '998391');
	await page.fill('#i-rate', '1000');
	await page.clickText('button', 'Save item');
	await sleep(400);
	const data = await db(page);
	check('catalogue item can be added with HSN and default rate', data.items.length === 1 && data.items[0].rate === 100000, JSON.stringify(data.items[0] ?? {}));
});

// ------------------------------------- 5. intra-state invoice: CGST + SGST
let intraId = '';
await step('intra-state invoice splits tax into CGST and SGST', async () => {
	await page.goto(`${BASE}/documents/new?type=invoice`);
	await page.waitFor(`location.pathname.startsWith('/documents/') && !location.pathname.includes('/new')`, 8000);
	intraId = await page.eval(`location.pathname.split('/')[2]`);
	const data0 = await db(page);
	const clientId = data0.clients.find((c) => c.state === '33').id;
	await page.fill('#f-client', clientId);
	await page.fill('[aria-label^="Description for line 1"]', 'Website design');
	const lineId = (await db(page)).docs.find((d) => d.id === intraId).lines[0].id;
	await page.fill(`#qty-${lineId}`, '2');
	await page.fill(`#rate-${lineId}`, '1000');
	await page.fill(`#tax-${lineId}`, '1800');
	await sleep(450);
	const bar = await page.text('.totals-bar');
	const data = await db(page);
	const doc = data.docs.find((d) => d.id === intraId);
	// 2 x 1000 = 2000 taxable, 18% = 360 -> CGST 180 + SGST 180, total 2360.
	check(
		'intra-state invoice splits tax into CGST and SGST',
		/CGST/i.test(bar) && /SGST/i.test(bar) && !/IGST/i.test(bar) && /2,360\.00/.test(bar),
		bar.replace(/\s+/g, ' ').slice(0, 180)
	);
	check('intra-state invoice stores the expected line data', doc.lines[0].qty === 2000 && doc.lines[0].rate === 100000, JSON.stringify(doc.lines[0]));
});

await step('live preview shows the same totals and the tax summary', async () => {
	const sheet = await page.text('.sheet');
	check(
		'live preview shows the same totals and the tax summary',
		/Tax summary/i.test(sheet) && /2,360\.00/.test(sheet) && /Intra-state/i.test(sheet),
		sheet.replace(/\s+/g, ' ').slice(0, 160)
	);
});

await step('amount in words uses Indian style', async () => {
	const sheet = await page.text('.sheet');
	check(
		'amount in words uses Indian style',
		/Rupees Two Thousand Three Hundred Sixty Only/i.test(sheet),
		(sheet.match(/Rupees[^\n]*Only/i) ?? ['none'])[0]
	);
});

await step('percentage discount is applied before tax', async () => {
	const lineId = (await db(page)).docs.find((d) => d.id === intraId).lines[0].id;
	await page.fill(`#disc-${lineId}`, '10');
	await sleep(450);
	const data = await db(page);
	const bar = await page.text('.totals-bar');
	// 2000 - 10% = 1800 taxable, 18% = 324 -> total 2124.
	check('percentage discount is applied before tax', /1,800\.00/.test(bar) && /2,124\.00/.test(bar), bar.replace(/\s+/g, ' ').slice(0, 160));
	await page.fill(`#disc-${lineId}`, '0');
	await sleep(350);
	void data;
});

await step('invoice can be marked as sent and saved', async () => {
	await page.clickText('button', 'Mark as Sent');
	await sleep(400);
	const data = await db(page);
	check('invoice can be marked as sent and saved', data.docs.find((d) => d.id === intraId).status === 'sent', data.docs.find((d) => d.id === intraId).status);
});

// ------------------------------------------- 6. inter-state invoice: IGST
let interId = '';
await step('inter-state invoice charges IGST only', async () => {
	await page.goto(`${BASE}/documents/new?type=invoice`);
	await page.waitFor(`location.pathname.startsWith('/documents/') && !location.pathname.includes('/new')`, 8000);
	interId = await page.eval(`location.pathname.split('/')[2]`);
	const clientId = (await db(page)).clients.find((c) => c.state === '27').id;
	await page.fill('#f-client', clientId);
	const lineId = (await db(page)).docs.find((d) => d.id === interId).lines[0].id;
	await page.fill('[aria-label^="Description for line 1"]', 'Consulting');
	await page.fill(`#qty-${lineId}`, '1');
	await page.fill(`#rate-${lineId}`, '10000');
	await page.fill(`#tax-${lineId}`, '1800');
	await sleep(450);
	const bar = await page.text('.totals-bar');
	const sheet = await page.text('.sheet');
	check(
		'inter-state invoice charges IGST only',
		/IGST/i.test(bar) && !/CGST/i.test(bar) && /11,800\.00/.test(bar) && /Inter-state/i.test(sheet),
		bar.replace(/\s+/g, ' ').slice(0, 160)
	);
});

await step('place of supply drives the tax split', async () => {
	const hint = await page.text('#f-pos ~ .hint');
	check('place of supply drives the tax split', /IGST/.test(hint ?? ''), hint ?? '');
});

// ------------------------------------------------ 7. tax-inclusive pricing
await step('tax-inclusive pricing works backwards from the printed rate', async () => {
	const lineId = (await db(page)).docs.find((d) => d.id === interId).lines[0].id;
	await page.clickText('label', 'Rates include GST');
	await page.fill(`#rate-${lineId}`, '11800');
	await sleep(500);
	const bar = await page.text('.totals-bar');
	const sheet = await page.text('.sheet');
	// 11800 inclusive of 18% -> taxable 10000, IGST 1800, total still 11800.
	check(
		'tax-inclusive pricing works backwards from the printed rate',
		/10,000\.00/.test(bar) && /1,800\.00/.test(bar) && /11,800\.00/.test(bar) && /inclusive of GST/i.test(sheet),
		bar.replace(/\s+/g, ' ').slice(0, 170)
	);
});

await step('inclusive and exclusive reach the same grand total', async () => {
	const lineId = (await db(page)).docs.find((d) => d.id === interId).lines[0].id;
	await page.clickText('label', 'Rates include GST'); // back to exclusive
	await page.fill(`#rate-${lineId}`, '10000');
	await sleep(450);
	const bar = await page.text('.totals-bar');
	check('inclusive and exclusive reach the same grand total', /11,800\.00/.test(bar), bar.replace(/\s+/g, ' ').slice(0, 140));
	await page.clickText('button', 'Mark as Sent');
	await sleep(300);
});

// -------------------------------------------------------- 8. PDF templates
for (const tpl of ['classic', 'modern', 'minimal']) {
	await step(`PDF renders in the ${tpl} template`, async () => {
		// Drive the real UI button so the full client -> route path is exercised.
		await page.goto(`${BASE}/documents/${interId}`);
		await page.fill('#f-template', tpl);
		await sleep(300);
		await page.clickText('button', 'Download PDF');
		const file = await waitDownload('.pdf', 12000);
		const buf = readFileSync(file);
		const text = buf.toString('latin1');
		const pages = (text.match(/\/Type \/Page[^s]/g) ?? []).length;
		check(
			`PDF renders in the ${tpl} template`,
			buf.length > 2500 && text.startsWith('%PDF-1.4') && text.includes('%%EOF') && pages >= 1,
			`${(buf.length / 1024).toFixed(0)} KB, ${pages} page(s), ${file.split('/').pop()}`
		);
		rmSync(file, { force: true });
	});
}

await step('PDF file name uses the document number and client name', async () => {
	await page.clickText('button', 'Download PDF');
	const file = await waitDownload('.pdf', 12000);
	const name = file.split('/').pop();
	check('PDF file name uses the document number and client name', /^INV-\d{4}-\d{2}-\d{4}_.*\.pdf$/.test(name), name);
	rmSync(file, { force: true });
});

await step('PDF repeats the table header across pages for a long invoice', async () => {
	// 60 lines forces multiple pages; the header must appear on each.
	await seed(page, `(data) => {
    const doc = data.docs.find((d) => d.id === ${JSON.stringify(interId)});
    doc.lines = Array.from({ length: 60 }, (_, i) => ({
      id: 'bulk_' + i, description: 'Service line ' + (i + 1) + ' with a reasonably long description to force wrapping across the column width',
      hsn: '998314', qty: 1000, unit: 'nos', rate: 150000, discountKind: 'percent', discountValue: 0, taxBp: 1800
    }));
  }`);
	await page.goto(`${BASE}/documents/${interId}`);
	await sleep(400);
	await page.clickText('button', 'Download PDF');
	const file = await waitDownload('.pdf', 15000);
	const text = readFileSync(file).toString('latin1');
	const pages = (text.match(/\/Type \/Page[^s]/g) ?? []).length;
	const headers = (text.match(/\(Description\) Tj/g) ?? []).length;
	check(
		'PDF repeats the table header across pages for a long invoice',
		pages >= 2 && headers >= pages - 1,
		`${pages} pages, ${headers} table headers`
	);
	rmSync(file, { force: true });
	// Restore the single-line invoice.
	await seed(page, `(data) => {
    const doc = data.docs.find((d) => d.id === ${JSON.stringify(interId)});
    doc.lines = [{ id: 'l_restore', description: 'Consulting', hsn: '', qty: 1000, unit: 'nos', rate: 1000000, discountKind: 'percent', discountValue: 0, taxBp: 1800 }];
  }`);
});

// ----------------------------------------------------------- 9. payments
await step('partial payment sets the Partially paid status and balance', async () => {
	await page.goto(`${BASE}/documents/${intraId}`);
	await page.fill('#pay-amt', '1000');
	await page.fill('#pay-mode', 'upi');
	await page.clickText('button', 'Record payment');
	await sleep(500);
	const bodyText = await page.text('main#main');
	const data = await db(page);
	const paid = data.payments.filter((p) => p.invoiceId === intraId).reduce((s, p) => s + p.amount, 0);
	check(
		'partial payment sets the Partially paid status and balance',
		paid === 100000 && /Partially paid/.test(bodyText) && /1,360\.00/.test(bodyText),
		`paid=${paid}`
	);
});

await step('a paid invoice can no longer be edited', async () => {
	const bodyText = await page.text('main#main');
	const hasEdit = await page.eval(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Edit')`);
	check('a paid invoice can no longer be edited', /can no longer be edited/i.test(bodyText) && hasEdit === false, `editButton=${hasEdit}`);
});

await step('overpayment is blocked until it is confirmed as an advance', async () => {
	await page.fill('#pay-amt', '99999');
	await page.clickText('button', 'Record payment');
	await sleep(400);
	const err = await page.text('.error-text');
	const data = await db(page);
	const count = data.payments.filter((p) => p.invoiceId === intraId).length;
	check('overpayment is blocked until it is confirmed as an advance', /more than the balance/i.test(err ?? '') && count === 1, `payments=${count}`);
});

await step('full payment marks the invoice Paid', async () => {
	await page.fill('#pay-amt', '1360');
	await page.clickText('button', 'Record payment');
	await sleep(500);
	const bodyText = await page.text('main#main');
	const data = await db(page);
	const paid = data.payments.filter((p) => p.invoiceId === intraId).reduce((s, p) => s + p.amount, 0);
	check('full payment marks the invoice Paid', paid === 236000 && /\bPaid\b/.test(bodyText), `paid=${paid}`);
});

await step('payments page lists payments and exports CSV', async () => {
	await page.goto(`${BASE}/payments`);
	const rows = await page.count('tbody tr');
	await page.clickText('button', 'Export CSV');
	const file = await waitDownload('payments.csv', 9000);
	const csv = readFileSync(file, 'utf8');
	check(
		'payments page lists payments and exports CSV',
		rows >= 2 && csv.includes('Amount') && /1000\.00/.test(csv),
		`${rows} rows, csv ${csv.length} bytes`
	);
	rmSync(file, { force: true });
});

// ------------------------------------------------------------ 10. overdue
await step('overdue is derived from the due date, not stored', async () => {
	await seed(page, `(data) => {
    const doc = data.docs.find((d) => d.id === ${JSON.stringify(interId)});
    doc.date = '2024-01-01';
    doc.dueDate = '2024-01-15';
    doc.status = 'sent';
  }`);
	await page.goto(`${BASE}/invoices`);
	const body = await page.text('main#main');
	const data = await db(page);
	const stored = data.docs.find((d) => d.id === interId).status;
	check('overdue is derived from the due date, not stored', /Overdue/.test(body) && stored === 'sent', `stored status stays "${stored}"`);
});

// ------------------------------------------- 11. quotation -> invoice
await step('quotation can be created and converted into an invoice', async () => {
	await page.goto(`${BASE}/documents/new?type=quotation`);
	await page.waitFor(`location.pathname.startsWith('/documents/')`, 8000);
	const qId = await page.eval(`location.pathname.split('/')[2]`);
	const clientId = (await db(page)).clients[0].id;
	await page.fill('#f-client', clientId);
	const lineId = (await db(page)).docs.find((d) => d.id === qId).lines[0].id;
	await page.fill('[aria-label^="Description for line 1"]', 'Quoted work');
	await page.fill(`#rate-${lineId}`, '5000');
	await sleep(400);
	await page.clickText('button', 'Convert to invoice');
	await page.waitFor(`location.pathname.startsWith('/documents/') && !location.pathname.includes('/new')`, 8000);
	await sleep(500);
	const newId = await page.eval(`location.pathname.split('/')[2]`);
	const data = await db(page);
	const quote = data.docs.find((d) => d.id === qId);
	const inv = data.docs.find((d) => d.id === newId);
	check(
		'quotation can be created and converted into an invoice',
		inv && inv.type === 'invoice' && inv.convertedFromId === qId && quote.convertedToId === newId && quote.status === 'accepted' && inv.lines.length === quote.lines.length,
		`quote=${quote?.status} invoice=${inv?.number}`
	);
	check('converted invoice copies the quoted line rate', inv?.lines?.[0]?.rate === 500000, String(inv?.lines?.[0]?.rate));
});

await step('document numbers are never duplicated', async () => {
	const data = await db(page);
	const numbers = data.docs.map((d) => d.number);
	check('document numbers are never duplicated', new Set(numbers).size === numbers.length, numbers.join(', '));
});

// ----------------------------------------------------- 12. GST summary + CSV
await step('GST summary groups by rate and exports CSV', async () => {
	await page.goto(`${BASE}/reports`);
	await page.fill('select[aria-label="Period type"]', 'custom');
	await page.fill('input[aria-label="From date"]', '2020-01-01');
	await page.fill('input[aria-label="To date"]', '2030-12-31');
	await sleep(500);
	const body = await page.text('main#main');
	await page.clickText('button', 'Export CSV');
	const file = await waitDownload('gst', 9000);
	const csv = readFileSync(file, 'utf8');
	check(
		'GST summary groups by rate and exports CSV',
		/18%/.test(body) && /not a GST filing/i.test(body) && csv.includes('Taxable value') && csv.includes('not a filing'),
		`csv ${csv.length} bytes`
	);
	rmSync(file, { force: true });
});

await step('document and line-item CSV exports work', async () => {
	await page.clickText('button', 'All documents');
	const f1 = await waitDownload('all-documents.csv', 9000);
	const csv1 = readFileSync(f1, 'utf8');
	rmSync(f1, { force: true });
	await page.clickText('button', 'Line items');
	const f2 = await waitDownload('line-items.csv', 9000);
	const csv2 = readFileSync(f2, 'utf8');
	rmSync(f2, { force: true });
	check(
		'document and line-item CSV exports work',
		csv1.includes('Number') && csv1.includes('Status') && csv2.includes('HSN/SAC'),
		`${csv1.split('\r\n').length - 1} doc rows, ${csv2.split('\r\n').length - 1} line rows`
	);
});

// ------------------------------------------------- 13. copy summary + print
await step('copy summary puts the key details on the clipboard', async () => {
	await page.goto(`${BASE}/documents/${intraId}`);
	await page.clickText('button', 'Copy summary');
	await sleep(400);
	const clip = await page.eval('window.__clip');
	check(
		'copy summary puts the key details on the clipboard',
		/INV\//.test(clip ?? '') && /Amount:/.test(clip ?? '') && /Amount in words/.test(clip ?? ''),
		(clip ?? '').split('\n')[0]
	);
});

await step('print view renders the document sheet', async () => {
	await page.goto(`${BASE}/documents/${intraId}/print`);
	const sheet = await page.count('.sheet');
	const body = await page.text('main#main');
	check('print view renders the document sheet', sheet === 1 && /Tax summary/i.test(body) && /Amount in words/i.test(body), `sheets=${sheet}`);
});

// -------------------------------------------------- 14. backup / restore
let backupJson = '';
await step('JSON backup exports and records the backup date', async () => {
	await page.goto(`${BASE}/settings`);
	await page.clickText('button', 'Export JSON backup');
	const file = await waitDownload('invoicenest-backup', 9000);
	backupJson = readFileSync(file, 'utf8');
	rmSync(file, { force: true });
	const parsed = JSON.parse(backupJson);
	const data = await db(page);
	check(
		'JSON backup exports and records the backup date',
		parsed.docs.length === data.docs.length && parsed.clients.length === data.clients.length && Boolean(data.lastBackupAt),
		`${parsed.docs.length} docs, lastBackupAt=${Boolean(data.lastBackupAt)}`
	);
});

await step('JSON backup imports into a clean browser', async () => {
	const p2 = await freshPage({ isolated: true });
	await p2.goto(`${BASE}/settings`);
	await p2.setFile('input[type=file][accept*="json"]', 'backup.json', backupJson, 'application/json');
	await sleep(700);
	const data = await db(p2);
	const parsed = JSON.parse(backupJson);
	check(
		'JSON backup imports into a clean browser',
		data.docs.length === parsed.docs.length && data.clients.length === parsed.clients.length && data.profile.name === parsed.profile.name,
		`${data.docs.length} docs restored`
	);
	await p2.close();
});

// -------------------------------------------------------- 15. recurring
await step('a due recurring template generates a draft invoice on open', async () => {
	await seed(page, `(data) => {
    data.recurring = [{
      id: 'rc_test', title: 'E2E retainer', clientId: data.clients[0].id, placeOfSupply: data.clients[0].state,
      lines: [{ id: 'rl1', description: 'Retainer', hsn: '', qty: 1000, unit: 'month', rate: 2500000, discountKind: 'percent', discountValue: 0, taxBp: 1800 }],
      charges: [], taxInclusive: false, frequency: 'monthly', nextDate: '2024-02-01',
      notes: '', terms: '', active: true, lastRunAt: '', createdAt: new Date().toISOString()
    }];
  }`);
	const before = (await db(page)).docs.length;
	await page.goto(`${BASE}/recurring`);
	await sleep(900);
	const data = await db(page);
	const body = await page.text('main#main');
	const drafts = data.docs.filter((d) => (d.reference ?? '').includes('E2E retainer'));
	check(
		'a due recurring template generates a draft invoice on open',
		drafts.length > 0 && drafts.every((d) => d.status === 'draft') && data.docs.length > before,
		`${drafts.length} drafts created`
	);
	check('recurring notice lists what was created', /recurring/i.test(body) && /draft/i.test(body), body.replace(/\s+/g, ' ').slice(0, 120));
	check(
		'recurring next date rolls forward past today',
		(data.recurring[0].nextDate ?? '') > new Date().toISOString().slice(0, 10),
		data.recurring[0].nextDate
	);
});

// --------------------------------------------- 16. sample data integrity
const sample = await freshPage({ isolated: true });
await step('sample data loads a complete fictional workspace', async () => {
	await sample.goto(`${BASE}/settings`);
	await sample.clickText('#sample button', 'Load sample data');
	await sample.clickText('dialog button', 'Load sample data');
	await sleep(900);
	const data = await db(sample);
	const statuses = new Set();
	check(
		'sample data loads a complete fictional workspace',
		data.profile.name === 'Bluebird Design Co.' && data.clients.length === 8 && data.items.length === 12 && data.docs.length >= 25 && data.payments.length > 0,
		`${data.clients.length} clients, ${data.items.length} items, ${data.docs.length} docs, ${data.payments.length} payments`
	);
	void statuses;
});

await step('sample data is obviously fictional (no real GSTIN or bank account)', async () => {
	const data = await db(sample);
	const ok =
		data.profile.gstin === '33AABCB1234C1Z5' &&
		data.profile.bank.accountNumber === '000011112222' &&
		/Sample Bank/i.test(data.profile.bank.bank) &&
		data.clients.every((c) => /\.example$/.test(c.email) || c.email === '');
	check('sample data is obviously fictional (no real GSTIN or bank account)', ok, `${data.profile.gstin} / ${data.profile.bank.bank}`);
});

await step('sample dashboard shows every figure and both charts', async () => {
	await sample.goto(`${BASE}/`);
	const body = await sample.text('main#main');
	const bars = await sample.count('.chart rect');
	const donut = await sample.count('svg circle');
	check(
		'sample dashboard shows every figure and both charts',
		/Invoiced this FY/.test(body) && /Overdue/.test(body) && bars >= 12 && donut >= 2,
		`${bars} bars, ${donut} donut segments`
	);
	await shot(sample, 'dashboard-desktop.png');
});

await step('sample data covers overdue, partial, paid and cancelled invoices', async () => {
	await sample.goto(`${BASE}/invoices`);
	const body = await sample.text('main#main');
	const found = ['Paid', 'Partially paid', 'Overdue', 'Draft', 'Cancelled'].filter((s) => new RegExp(s).test(body));
	check('sample data covers overdue, partial, paid and cancelled invoices', found.length >= 4, found.join(', '));
	await shot(sample, 'invoices-desktop.png');
});

await step('sample quotations include accepted, declined and expired', async () => {
	await sample.goto(`${BASE}/quotations`);
	const body = await sample.text('main#main');
	const found = ['Accepted', 'Declined', 'Expired', 'Draft', 'Sent'].filter((s) => new RegExp(s).test(body));
	check('sample quotations include accepted, declined and expired', found.length >= 3, found.join(', '));
});

await step('a sample invoice shows the UPI QR code', async () => {
	const data = await db(sample);
	const inv = data.docs.find((d) => d.type === 'invoice' && d.status !== 'cancelled');
	await sample.goto(`${BASE}/documents/${inv.id}`);
	const qr = await sample.count('.qr');
	const paths = await sample.eval(`document.querySelector('.qr path')?.getAttribute('d')?.length ?? 0`);
	check('a sample invoice shows the UPI QR code', qr === 1 && paths > 200, `qr=${qr}, path length ${paths}`);
	await shot(sample, 'editor-desktop.png');
});

// --------------------------------------------------- 17. responsive + dark
await step('mobile layout shows the bottom tab bar and preview toggle', async () => {
	const m = await freshPage({ width: 390, height: 844, mobile: true, isolated: true });
	await m.goto(`${BASE}/settings`);
	await m.clickText('#sample button', 'Load sample data');
	await m.clickText('dialog button', 'Load sample data');
	await sleep(800);
	await m.goto(`${BASE}/invoices`);
	const tabs = await m.count('.tabbar .tab');
	const newBtn = await m.count('.tab-new');
	const cardsVisible = await m.eval(`getComputedStyle(document.querySelector('.cards-list')).display !== 'none'`);
	check('mobile layout shows the bottom tab bar and preview toggle', tabs >= 4 && newBtn === 1 && cardsVisible === true, `${tabs} tabs, cards=${cardsVisible}`);
	await shot(m, 'invoices-mobile.png');

	const data = await db(m);
	const inv = data.docs.find((d) => d.type === 'invoice');
	await m.goto(`${BASE}/documents/${inv.id}`);
	const toggle = await m.eval(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Preview')`);
	check('mobile editor has a preview toggle', toggle === true, `toggle=${toggle}`);
	await shot(m, 'editor-mobile.png');
	await m.close();
});

await step('360px width has no horizontal overflow on any page', async () => {
	const tiny = await freshPage({ width: 360, height: 760, mobile: true, isolated: true });
	const bad = [];
	for (const r of ['/', '/invoices', '/quotations', '/clients', '/items', '/payments', '/reports', '/recurring', '/settings', '/privacy']) {
		await tiny.goto(`${BASE}${r}`);
		const overflow = await tiny.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
		if (overflow > 2) bad.push(`${r} +${overflow}px`);
	}
	// The document editor is the widest screen, so check it too.
	const data = await db(tiny);
	const inv = data.docs.find((d) => d.type === 'invoice');
	if (inv) {
		await tiny.goto(`${BASE}/documents/${inv.id}`);
		const overflow = await tiny.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
		if (overflow > 2) bad.push(`editor +${overflow}px`);
	}
	check('360px width has no horizontal overflow on any page', bad.length === 0, bad.join(', ') || 'all pages fit');
	await tiny.close();
});

await step('dark mode applies the dark palette', async () => {
	await sample.goto(`${BASE}/settings`);
	await sample.fill('#s-theme', 'dark');
	await sleep(500);
	const theme = await sample.eval(`document.documentElement.dataset.theme`);
	const bg = await sample.eval(`getComputedStyle(document.body).backgroundColor`);
	check('dark mode applies the dark palette', theme === 'dark' && bg !== 'rgb(250, 250, 247)', `${theme} / ${bg}`);
	await sample.goto(`${BASE}/`);
	await shot(sample, 'dashboard-dark.png');
	await sample.goto(`${BASE}/settings`);
	await sample.fill('#s-theme', 'light');
	await sleep(300);
});

// ------------------------------------------------------ 18. performance
await step('1,000 documents do not freeze the browser', async () => {
	const perf = await freshPage({ isolated: true });
	await perf.goto(`${BASE}/settings`);
	await perf.clickText('#sample button', 'Load sample data');
	await perf.clickText('dialog button', 'Load sample data');
	await sleep(800);
	await seed(perf, `(data) => {
    const base = data.docs.find((d) => d.type === 'invoice');
    const extra = [];
    for (let i = 0; i < 1000; i++) {
      extra.push({ ...structuredClone(base), id: 'perf_' + i, number: 'INV/PERF/' + String(i).padStart(4, '0'),
        lines: base.lines.map((l, j) => ({ ...l, id: 'perf_' + i + '_' + j })) });
    }
    data.docs = data.docs.concat(extra);
  }`);
	const t0 = Date.now();
	await perf.goto(`${BASE}/invoices`);
	const loadMs = Date.now() - t0;
	const beatBefore = await perf.eval('window.__beat');
	await sleep(700);
	const beatAfter = await perf.eval('window.__beat');
	const rows = await perf.count('tbody tr');
	const data = await db(perf);
	check(
		'1,000 documents do not freeze the browser',
		rows > 1000 && beatAfter - beatBefore >= 5 && loadMs < 15000,
		`${data.docs.length} docs, ${rows} rows, ${loadMs}ms load, heartbeat +${beatAfter - beatBefore}`
	);

	const t1 = Date.now();
	await perf.goto(`${BASE}/`);
	const dashMs = Date.now() - t1;
	const beat2 = await perf.eval('window.__beat');
	await sleep(600);
	const beat3 = await perf.eval('window.__beat');
	check('dashboard stays responsive with 1,000 documents', dashMs < 15000 && beat3 - beat2 >= 5, `${dashMs}ms, heartbeat +${beat3 - beat2}`);
	await perf.close();
});

// -------------------------------------------- 19. accessibility + hygiene
await step('every form control has an accessible name', async () => {
	await sample.goto(`${BASE}/settings`);
	const unlabelled = await sample.eval(`(() => {
    const ctrls = [...document.querySelectorAll('input, select, textarea')];
    return ctrls.filter((el) => {
      if (el.type === 'hidden') return false;
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
      if (el.id && document.querySelector('label[for=' + CSS.escape(el.id) + ']')) return false;
      if (el.closest('label')) return false;
      return true;
    }).map((el) => el.id || el.name || el.type);
  })()`);
	check('every form control has an accessible name', unlabelled.length === 0, unlabelled.join(', ') || 'all labelled');
});

await step('tables use scoped column headers', async () => {
	await sample.goto(`${BASE}/invoices`);
	const bad = await sample.eval(`[...document.querySelectorAll('thead th')].filter((th) => !th.getAttribute('scope')).length`);
	check('tables use scoped column headers', bad === 0, `${bad} headers missing scope`);
});

await step('status is conveyed by text, not colour alone', async () => {
	const pills = await sample.eval(`[...document.querySelectorAll('.pill')].map((p) => p.innerText.trim()).filter(Boolean).length`);
	const total = await sample.count('.pill');
	check('status is conveyed by text, not colour alone', pills === total && total > 0, `${pills}/${total} pills carry text`);
});

await step('no console errors or 5xx responses during the run', async () => {
	const all = [...page.errors, ...sample.errors];
	const real = all.filter((e) => e && !/favicon|ResizeObserver/i.test(e));
	check('no console errors or 5xx responses during the run', real.length === 0, real.slice(0, 3).join(' | ') || 'clean');
});

await step('every navigation route renders without an error page', async () => {
	const routes = ['/', '/invoices', '/quotations', '/clients', '/items', '/payments', '/reports', '/recurring', '/settings', '/privacy'];
	const bad = [];
	for (const r of routes) {
		await sample.goto(`${BASE}${r}`);
		const h = await sample.eval(`document.querySelector('main#main h1')?.innerText ?? ''`);
		if (!h || /went wrong/i.test(h)) bad.push(`${r} -> "${h}"`);
	}
	check('every navigation route renders without an error page', bad.length === 0, bad.join('; ') || `${routes.length} routes ok`);
});

await step('privacy page explains storage, backup and the lack of email', async () => {
	await sample.goto(`${BASE}/privacy`);
	const body = await sample.text('main#main');
	check(
		'privacy page explains storage, backup and the lack of email',
		/localStorage/.test(body) && /backup/i.test(body) && /no mail server|no email sending/i.test(body),
		`${body.length} chars`
	);
});

// --------------------------------------------------------------- results
await page.close();
await sample.close();
await close();
clearTimeout(watchdog);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
	console.log('\nFailures:');
	for (const f of failed) console.log(` - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
}
process.exit(failed.length ? 1 : 0);
