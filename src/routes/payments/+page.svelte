<script lang="ts">
	// All payments across every invoice, with filters and CSV export.
	import { app } from '$lib/app.svelte.ts';
	import { downloadCsv } from '$lib/actions.ts';
	import Money from '$lib/components/Money.svelte';
	import { paymentsCsv } from '$lib/core/csv.ts';
	import { formatDate, inRange } from '$lib/core/dates.ts';
	import { PAYMENT_MODES } from '$lib/core/defaults.ts';

	let search = $state('');
	let mode = $state('all');
	let from = $state('');
	let to = $state('');

	let rows = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return app.data.payments
			.map((p) => {
				const doc = app.data.docs.find((d) => d.id === p.invoiceId);
				const client = app.data.clients.find((c) => c.id === doc?.clientId);
				return { p, doc, client };
			})
			.filter(({ p, doc, client }) => {
				if (mode !== 'all' && p.mode !== mode) return false;
				if (from && to && !inRange(p.date, from, to)) return false;
				if (from && !to && p.date < from) return false;
				if (to && !from && p.date > to) return false;
				if (!q) return true;
				return `${doc?.number ?? ''} ${client?.company ?? ''} ${client?.name ?? ''} ${p.reference}`.toLowerCase().includes(q);
			})
			.sort((a, b) => b.p.date.localeCompare(a.p.date));
	});

	let total = $derived(rows.reduce((s, r) => s + r.p.amount, 0));
</script>

<div class="page-head">
	<div>
		<h1>Payments</h1>
		<p>Record payments from any invoice. Partial payments update the invoice status automatically.</p>
	</div>
	<button
		class="btn btn-sm"
		onclick={() => downloadCsv(paymentsCsv(rows.map((r) => r.p), $state.snapshot(app.data), app.data.settings.dateFormat), 'invoicenest-payments.csv')}
		disabled={rows.length === 0}
	>
		Export CSV
	</button>
</div>

<div class="toolbar">
	<input type="search" placeholder="Search invoice, client or reference" bind:value={search} aria-label="Search payments" />
	<select bind:value={mode} aria-label="Filter by mode">
		<option value="all">All modes</option>
		{#each PAYMENT_MODES as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
	</select>
	<label class="inline-field"><span class="label">From</span><input type="date" bind:value={from} aria-label="From date" /></label>
	<label class="inline-field"><span class="label">To</span><input type="date" bind:value={to} aria-label="To date" /></label>
	<span class="hint" style="margin-left:auto">{rows.length} payments &middot; <Money paise={total} /></span>
</div>

{#if !app.loaded}
	<div class="card card-pad"><div class="skeleton" style="height:140px"></div></div>
{:else if app.data.payments.length === 0}
	<div class="card empty">
		<h3>No payments recorded</h3>
		<p>Open an invoice and use the Payments section to record what you have received. Partial payments are supported.</p>
		<a class="btn btn-primary" href="/invoices">Go to invoices</a>
	</div>
{:else if rows.length === 0}
	<div class="card empty">
		<h3>No matches</h3>
		<p>No payments match those filters.</p>
		<button
			class="btn"
			onclick={() => {
				search = '';
				mode = 'all';
				from = '';
				to = '';
			}}>Clear filters</button
		>
	</div>
{:else}
	<div class="card table-as-cards">
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th scope="col">Date</th>
						<th scope="col">Invoice</th>
						<th scope="col">Client</th>
						<th scope="col">Mode</th>
						<th scope="col">Reference</th>
						<th scope="col" class="num">Amount</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.p.id)}
						<tr>
							<td>{formatDate(r.p.date, app.data.settings.dateFormat)}</td>
							<td>{#if r.doc}<a href="/documents/{r.doc.id}">{r.doc.number}</a>{:else}-{/if}</td>
							<td>{r.client ? r.client.company || r.client.name : '-'}</td>
							<td>{PAYMENT_MODES.find((m) => m.id === r.p.mode)?.label ?? r.p.mode}</td>
							<td>{r.p.reference || '-'}</td>
							<td class="num"><Money paise={r.p.amount} /></td>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr><td colspan="5">Total</td><td class="num"><Money paise={total} /></td></tr>
				</tfoot>
			</table>
		</div>

		<div class="cards-list card-pad">
			{#each rows as r (r.p.id)}
				<div class="pay-card">
					<div style="display:flex;justify-content:space-between;gap:.5rem">
						<strong>{r.doc?.number ?? 'Deleted invoice'}</strong>
						<strong class="mono-num"><Money paise={r.p.amount} /></strong>
					</div>
					<div class="hint">{r.client ? r.client.company || r.client.name : '-'}</div>
					<div class="hint">
						{formatDate(r.p.date, app.data.settings.dateFormat)} &middot; {PAYMENT_MODES.find((m) => m.id === r.p.mode)?.label}
						{r.p.reference ? `· ${r.p.reference}` : ''}
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.inline-field {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.inline-field input {
		width: auto;
	}

	.pay-card {
		display: grid;
		gap: 0.25rem;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
</style>
