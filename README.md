# InvoiceNest

**Bill right. Get paid.**

A free GST invoice and quotation generator for freelancers and small businesses in India.
Save your business profile and clients, create invoices and quotations with correct GST
calculation, download clean PDFs, track payments, and see a simple dashboard.

**Your data is stored only in your browser.** There is no account, no sign-in and no
database. Nothing is uploaded.

- Live demo: _see [Live demo](#live-demo) below_
- Repository: _see [Live demo](#live-demo) below_

---

## Purpose

Most small Indian businesses only need a handful of things from an invoicing tool: a
correct GST invoice, a professional PDF, and an honest view of who still owes money.
Cloud invoicing apps ask for an account, a subscription and custody of your financial
records to deliver that.

InvoiceNest does the same job with none of it. It runs entirely in your browser, stores
everything locally, and costs nothing to host. The trade-off is explicit and is stated
everywhere in the app: **if you clear your browser data without a backup, the records are
gone.**

## Features

### Business profile and settings
- Name, logo, address, state, phone, email, website, GSTIN, PAN, bank details, UPI ID
- Logo and signature upload, resized and compressed to **under 150 KB** as a data URL
- Validation with inline messages: GSTIN (15 characters, valid pattern, real state code
  that must match the selected state), IFSC, PAN, email, phone, UPI ID, account number
- Currency (₹ default, plus USD, EUR, GBP), date format, financial-year start (April
  default), default due days, default terms and notes
- Numbering series per document type: prefix, optional financial-year part, padding, and
  an automatic reset each financial year
- Editable tax rate list (starts at 0%, 5%, 18%; any rate can be added, including 0.5%)
- Default template, accent colour, and tax-inclusive or tax-exclusive pricing default
- Light, dark, or system theme

### Clients and items
- Clients with name, company, email, phone, billing address, state, GSTIN and notes
- Search, add, edit, delete; deleting a client that has documents is **blocked** with a
  clear message instead of orphaning records
- Items catalogue with description, HSN/SAC, unit, default rate and default tax rate, so a
  line item can be filled in one pick

### Invoices and quotations
- Document editor with the form on the left and a **live preview on the right** that is
  built from the same model as the PDF (stacked with a Preview toggle on mobile)
- Auto-generated number, editable only before a payment is recorded, never duplicated
- Line items with description, HSN/SAC, quantity, unit, rate, discount (percentage or
  fixed), tax rate and automatic line total; add, remove, duplicate, reorder, or pick from
  the catalogue
- Extra charges (shipping or other) and an optional round-off line
- Tax summary grouped by rate (taxable value, CGST, SGST, IGST)
- Grand total in words, Indian style: "Rupees One Lakh Twenty Three Thousand Four Hundred
  Fifty Six and Seventy Eight Paise Only"
- Indian digit grouping for INR (1,23,456.78) with tabular, right-aligned money columns
- Statuses — invoices: Draft, Sent, Partially paid, Paid, Overdue, Cancelled; quotations:
  Draft, Sent, Accepted, Declined, Expired. **Overdue and Expired are calculated from the
  due date, never stored**, so they are always current
- Convert an accepted quotation into an invoice in one click, with both documents linked
- Duplicate any document
- A saved invoice with a recorded payment cannot be edited, only cancelled, with a clear
  explanation
- **UPI payment QR** generated in the browser from your UPI ID and the balance due

### Payments
- Record amount, date, mode (cash, UPI, bank transfer, card, cheque, other) and a reference
- Partial payments, running balance, automatic status updates
- A payment larger than the balance due is blocked until it is explicitly confirmed as an
  advance
- Payments page with search, mode and date filters, and CSV export

### PDF and sharing
- One-click PDF through a SvelteKit server route, in three templates: **Classic** (bordered
  table, formal header), **Modern** (accent band, filled header row), **Minimal**
  (hairlines, lots of white)
- Table rows are never split across a page and the table header repeats on each new page
- File names like `INV-2026-27-0001_AuroraLabs.pdf`
- Print-friendly view of any document
- "Copy summary" button for WhatsApp or email with the number, amount, due date and bank or
  UPI details
- **No email sending** — there is no mail server. Download the PDF or copy the summary and
  send it yourself

### Dashboard and reports
- Total invoiced this financial year, received, pending, overdue amount and overdue count
- Revenue by month (hand-written SVG bar chart), invoice status breakdown (SVG donut), top
  clients by revenue, recent activity
- GST summary for a month, quarter, financial year or custom range, with CSV export
- CSV export for documents, line items (HSN detail), payments, clients and the GST summary

### Recurring invoices
- Templates with client, items, frequency (weekly, monthly, quarterly, yearly) and next date
- Because there is no server and no cron, due recurring invoices are generated as **Drafts
  when the app is opened**, with a notice listing exactly what was created. This limitation
  is explained on the Recurring page itself

### Sample data
- A clearly fictional workspace: **Bluebird Design Co.**, 8 clients across different states,
  12 catalogue items, 27 documents in every status (including overdue, partially paid,
  cancelled and a converted quotation), 15 payments and 2 recurring templates
- Sample GSTIN `33AABCB1234C1Z5`, sample account `000011112222` at "Sample Bank of India",
  and `.example` email addresses. No real company, GSTIN, bank account or person is used
- "Load sample data" and "Start fresh" in Settings, each behind a confirmation dialog

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | SvelteKit 2.70.3 + Svelte 5.57.2 (runes) |
| Language | TypeScript 5.9.3 (strict) |
| Build | Vite 7.3.7 |
| Hosting | Vercel free Hobby plan, `@sveltejs/adapter-vercel` 6.3.4 (`nodejs22.x`) |
| Storage | Browser `localStorage` only, behind an `InvoiceStore` interface |
| Charts | Hand-written SVG — no chart library |
| PDF | Dependency-free A4 writer (Helvetica AFM widths, JPEG `DCTDecode` images) |
| QR codes | Dependency-free QR encoder (byte mode, ECC level M) |
| Fonts | `@fontsource/inter` 5.2.5 |
| Tests | `node --test` for unit tests, headless Chrome over CDP for e2e |

Every dependency is a pinned exact version, is free, and is well maintained. There are no
runtime dependencies at all — the four packages above are dev/build dependencies.

## How GST is calculated

All arithmetic runs on **integer paise**. No floating-point number ever touches a money
value, so the editor, the preview, the PDF and the CSV always agree to the last paise.
Quantities are thousandths of a unit and percentages are basis points (18% is stored as
`1800`), so they too are exact integers.

### Order of operations

```
gross    = quantity x rate
discount = percentage of gross, or a fixed amount
taxable  = gross - discount          <- the discount is always applied BEFORE tax
tax      = taxable x tax rate
total    = taxable + tax
```

### Tax-exclusive versus tax-inclusive

- **Exclusive** (default): the rate is the pre-tax price, and tax is added on top.
- **Inclusive**: the rate already contains the tax, so the base is calculated backwards:

```
taxable = inclusiveAmount x 10000 / (10000 + taxBasisPoints)
tax     = inclusiveAmount - taxable
```

The customer therefore pays exactly the printed rate. Entering ₹1,000 exclusive at 18% and
₹1,180 inclusive at 18% produce an identical grand total.

### CGST/SGST versus IGST

The split is decided by comparing **your business state** with the **place of supply**:

- **Same state** → intra-state supply → the tax is split into **CGST and SGST**, each half
- **Different states** → inter-state supply → the whole tax is charged as **IGST**

The two halves are split so that `CGST + SGST === tax` exactly; any odd paise goes to CGST,
so the tax summary can never be short by a paise. The place of supply defaults to the
client's state and can be overridden per document.

### Rounding

Rounding is "half away from zero" at every step. The optional round-off line nudges the
grand total to the nearest whole rupee and is shown explicitly on the document, so the
printed figures always add up.

> **Tax rates and rules change.** The rates in this app are whatever you configure, and the
> GST summary is a convenience summary built only from the invoices in your browser. It is
> **not a GST filing** and is not tax advice. Always verify rates, HSN/SAC codes and
> treatment against the official GST portal (<https://www.gst.gov.in>) and your accountant.

## Storage and backup limits

All data lives in this browser's `localStorage`, behind a single `InvoiceStore` interface
(`src/lib/core/types.ts`) with exactly one implementation (`src/lib/core/store.ts`). A
database could implement the same interface later; **no database is implemented now, by
design.**

What that means in practice:

- **This browser only.** Another browser, device or profile shows an empty workspace.
- **Clearing site data deletes everything.** So do some privacy cleaners and "reset browser".
- **Private windows forget.** Data stored in incognito disappears when the window closes.
- **Roughly 5 MB per site.** That is why logos and signatures are compressed to under 150 KB.
  Saves are size-checked first and a quota error is reported as a clear message, never an
  unhandled crash.
- **Blocked storage degrades gracefully.** If `localStorage` is unavailable the app falls
  back to in-memory storage for the session and says so in a banner.

Mitigations built in:

- A persistent "Data is stored only in this browser" badge in the top bar
- A Privacy and backup page explaining all of the above, with live storage statistics
- A "Last backup" date and a reminder banner when there has been no backup for 14 days
- JSON backup **export** and **import** (import replaces the current workspace)

The two server routes (`/api/pdf` and `/api/csv`) receive a document only at the moment you
press the button, turn it into a file and discard it. Nothing is logged or stored
server-side. `/api/health` returns static facts about the app and reads no data.

> Vercel's free **Hobby plan is for non-commercial use only**. If you use InvoiceNest to bill
> real clients from your own deployment, run it on a plan that permits commercial use, or
> host the static build elsewhere.

## Setup

Requires Node.js 22.12 or newer.

```bash
git clone https://github.com/DIVYAPRIYADHARSHINI-GIT/invoicenest.git
cd invoicenest
npm install
npm run dev          # http://localhost:5173
```

Open Settings and either fill in your own business profile or press **Load sample data** to
explore the fictional Bluebird Design Co. workspace.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (Vercel adapter) |
| `npm run preview` | Serve the production build locally |
| `npm run check` | `svelte-check` type and template diagnostics |
| `npm test` | 64 unit tests for money, GST, words, dates, numbering, status, recurring |
| `npm run e2e` | 60-check headless-Chrome end-to-end suite |

Running the e2e suite against a local build:

```bash
npm run build
npx vite preview --port 4323 --strictPort &
caffeinate -dims env BASE_URL=http://localhost:4323 node tests/e2e/smoke.mjs
```

### Testing

Business rules live in small, separately tested modules under `src/lib/core/`:

| Module | Responsibility |
| --- | --- |
| `money.ts` | Integer-paise arithmetic, rounding, parsing, Indian/western grouping |
| `gst.ts` | Discount-then-tax order, inclusive/exclusive, CGST/SGST/IGST split, tax summary |
| `words.ts` | Amount in words with lakh and crore, paise-only and zero-paise cases |
| `dates.ts` | Local calendar dates, financial years, day arithmetic that never shifts a day |
| `numbering.ts` | Numbering series with financial-year reset and duplicate protection |
| `status.ts` | Status transitions, overdue calculation, partial payments, balances |
| `recurring.ts` | Recurring generation, including catching up on missed occurrences |
| `validate.ts` | GSTIN, IFSC, PAN, email, phone, UPI validation |
| `store.ts` | The single `InvoiceStore` implementation (localStorage) |

**64 unit tests** cover these rules, including awkward values: zero tax, 0.5% rates, paise
rounding (`1.005` → 101 paise), crore-scale amounts, float traps (`0.1 + 0.2`), fixed
discounts larger than the line, half-month date clamping and leap years.

**60 end-to-end checks** run the full flow in headless Chrome: profile setup with validation
→ clients → items → intra-state invoice (CGST+SGST) → inter-state invoice (IGST) →
tax-inclusive pricing → discounts → amount in words → partial then full payment → overdue →
quotation converted to an invoice → PDFs in all three templates (byte structure, page count
and repeated table headers checked) → CSV exports → GST summary → JSON backup and import →
recurring generation → sample-data integrity → desktop, mobile (390px and 360px) and dark
mode → accessibility checks → and a 1,000-document performance test with a freeze heartbeat.

## Project structure

```
src/
  app.css                  Design system (warm white, ink navy, indigo, status colours)
  lib/
    app.svelte.ts          Reactive app state on top of the store
    actions.ts             PDF download, CSV download, clipboard, backup/restore
    core/                  Unit-tested business rules (see table above)
    components/            StatusPill, Money, DocPreview, DocList, ConfirmDialog, Toasts
    doc/
      model.ts             The one render model shared by the preview and the PDF
      pdf.ts               Dependency-free A4 PDF writer with three templates
  routes/
    +layout.svelte         Sidebar, mobile tab bar, storage badge, backup reminder
    +page.svelte           Dashboard
    documents/[id]/        The document editor (and its print view)
    invoices|quotations|clients|items|payments|reports|recurring|settings|privacy
    api/pdf|csv|health     The only server-side code
tests/
  unit/                    node --test suites
  e2e/                     Headless-Chrome CDP driver and smoke suite
```

## Accessibility and design

- WCAG AA contrast in both themes, 44px minimum tap targets, visible focus rings
- Status is conveyed by **text plus colour**, never colour alone
- Every form control has a label or `aria-label`; tables use scoped column headers
- Keyboard navigable throughout; `prefers-reduced-motion` is respected
- Responsive from 360px to wide desktop: tables become cards on small screens, and the
  sidebar becomes a bottom tab bar with a central "New" button
- Inter throughout, with tabular right-aligned numerals in every money column
- Skeleton loaders, helpful empty states, toasts and confirmation dialogs for destructive
  actions
- A simple nest-shaped SVG logo mark. No emoji and no cartoon illustrations

## Live demo

- **Live app:** https://invoicenest-sandy.vercel.app
- **GitHub:** https://github.com/DIVYAPRIYADHARSHINI-GIT/invoicenest

The live site opens with the fictional sample data only. Any records you create there stay
in your own browser.

## License

MIT
