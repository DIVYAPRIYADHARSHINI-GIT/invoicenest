<script lang="ts">
	// GST summary for a chosen period plus the CSV exports.
	// Explicitly a reference summary, not a filing.
	import { app } from '$lib/app.svelte.ts';
	import { downloadCsv } from '$lib/actions.ts';
	import Money from '$lib/components/Money.svelte';
	import { clientsCsv, documentsCsv, gstSummaryCsv, lineItemsCsv, paymentsCsv } from '$lib/core/csv.ts';
	import { financialYear, formatDate, today } from '$lib/core/dates.ts';
	import { pctToString } from '$lib/core/money.ts';
	import { gstReport } from '$lib/core/select.ts';

	type PeriodKind = 'month' | 'quarter' | 'fy' | 'custom';

	let kind = $state<PeriodKind>('fy');
	let monthValue = $state(today().slice(0, 7));
	let quarter = $state(1);
	let customFrom = $state('');
	let customTo = $state('');

	let fy = $derived(financialYear(today(), app.data.settings.fyStartMonth));

	const pad = (n: number) => String(n).padStart(2, '0');
	const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

	let range = $derived.by(() => {
		if (kind === 'month') {
			const [y, m] = monthValue.split('-').map(Number);
			if (!y || !m) return { from: fy.start, to: fy.end };
			return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
		}
		if (kind === 'quarter') {
			// Quarters of the configured financial year (Q1 = Apr-Jun with an April start).
			const startMonthIndex = app.data.settings.fyStartMonth - 1 + (quarter - 1) * 3;
			const sY = fy.startYear + Math.floor(startMonthIndex / 12);
			const sM = (startMonthIndex % 12) + 1;
			const endIndex = startMonthIndex + 2;
			const eY = fy.startYear + Math.floor(endIndex / 12);
			const eM = (endIndex % 12) + 1;
			return { from: `${sY}-${pad(sM)}-01`, to: `${eY}-${pad(eM)}-${pad(lastDay(eY, eM))}` };
		}
		if (kind === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo };
		return { from: fy.start, to: fy.end };
	});

	let report = $derived(gstReport($state.snapshot(app.data), range.from, range.to));
	let df = $derived(app.data.settings.dateFormat);
	let allViews = $derived(app.views);
</script>

<div class="page-head">
	<div>
		<h1>Reports</h1>
		<p>GST summary and CSV exports for your records.</p>
	</div>
</div>

<div class="banner banner-info">
	<div>
		<strong>This is a summary for your own reference, not a GST filing.</strong>
		Figures come only from the invoices stored in this browser. Tax rates and rules change - always check against the official GST portal and your accountant before filing.
	</div>
</div>

<section class="card" style="margin-bottom:1rem">
	<div class="card-head"><h2>GST summary</h2><span class="hint">Excludes drafts, cancelled invoices and all quotations</span></div>
	<div class="card-pad">
		<div class="toolbar" style="margin-bottom:.75rem">
			<select bind:value={kind} aria-label="Period type">
				<option value="fy">Financial year {fy.key}</option>
				<option value="quarter">Quarter</option>
				<option value="month">Month</option>
				<option value="custom">Custom range</option>
			</select>
			{#if kind === 'month'}
				<input type="month" bind:value={monthValue} aria-label="Month" style="width:auto" />
			{:else if kind === 'quarter'}
				<select bind:value={quarter} aria-label="Quarter" style="width:auto">
					<option value={1}>Q1</option>
					<option value={2}>Q2</option>
					<option value={3}>Q3</option>
					<option value={4}>Q4</option>
				</select>
			{:else if kind === 'custom'}
				<input type="date" bind:value={customFrom} aria-label="From date" style="width:auto" />
				<input type="date" bind:value={customTo} aria-label="To date" style="width:auto" />
			{/if}
			<span class="hint" style="margin-left:auto">
				{formatDate(range.from, df)} to {formatDate(range.to, df)} &middot; {report.docCount} invoices
			</span>
			<button class="btn btn-sm" onclick={() => downloadCsv(gstSummaryCsv(report, df), `invoicenest-gst-${range.from}-to-${range.to}.csv`)} disabled={report.rows.length === 0}>
				Export CSV
			</button>
		</div>

		{#if report.rows.length === 0}
			<p class="hint">No invoices in this period.</p>
		{:else}
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th scope="col">Tax rate</th>
							<th scope="col" class="num">Taxable value</th>
							<th scope="col" class="num">CGST</th>
							<th scope="col" class="num">SGST</th>
							<th scope="col" class="num">IGST</th>
							<th scope="col" class="num">Total</th>
						</tr>
					</thead>
					<tbody>
						{#each report.rows as r (r.taxBp)}
							<tr>
								<td>{pctToString(r.taxBp)}%</td>
								<td class="num"><Money paise={r.taxable} /></td>
								<td class="num"><Money paise={r.cgst} /></td>
								<td class="num"><Money paise={r.sgst} /></td>
								<td class="num"><Money paise={r.igst} /></td>
								<td class="num"><Money paise={r.total} /></td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr>
							<td>Total</td>
							<td class="num"><Money paise={report.taxable} /></td>
							<td class="num"><Money paise={report.cgst} /></td>
							<td class="num"><Money paise={report.sgst} /></td>
							<td class="num"><Money paise={report.igst} /></td>
							<td class="num"><Money paise={report.total} /></td>
						</tr>
					</tfoot>
				</table>
			</div>
		{/if}
	</div>
</section>

<section class="card">
	<div class="card-head"><h2>CSV exports</h2><span class="hint">Amounts are exact decimals, matching the PDFs</span></div>
	<div class="card-pad btn-row">
		<button class="btn" onclick={() => downloadCsv(documentsCsv(allViews, df), 'invoicenest-all-documents.csv')} disabled={!allViews.length}>All documents</button>
		<button class="btn" onclick={() => downloadCsv(documentsCsv(allViews.filter((v) => v.doc.type === 'invoice'), df), 'invoicenest-invoices.csv')} disabled={!allViews.length}>
			Invoices
		</button>
		<button class="btn" onclick={() => downloadCsv(lineItemsCsv(allViews, df), 'invoicenest-line-items.csv')} disabled={!allViews.length}>Line items (HSN detail)</button>
		<button class="btn" onclick={() => downloadCsv(paymentsCsv($state.snapshot(app.data).payments, $state.snapshot(app.data), df), 'invoicenest-payments.csv')} disabled={!app.data.payments.length}>
			Payments
		</button>
		<button class="btn" onclick={() => downloadCsv(clientsCsv($state.snapshot(app.data)), 'invoicenest-clients.csv')} disabled={!app.data.clients.length}>Clients</button>
	</div>
</section>
