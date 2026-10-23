<script lang="ts">
	// Shared list for invoices and quotations: table on desktop, cards on mobile,
	// with search, status filter, sorting and CSV export.
	import { app } from '$lib/app.svelte.ts';
	import { downloadCsv } from '$lib/actions.ts';
	import Money from '$lib/components/Money.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { documentsCsv } from '$lib/core/csv.ts';
	import { formatDate } from '$lib/core/dates.ts';
	import type { DocView } from '$lib/core/select.ts';
	import { STATUS_LABEL } from '$lib/core/status.ts';
	import type { DerivedStatus, DocType } from '$lib/core/types.ts';

	let { type }: { type: DocType } = $props();

	let search = $state('');
	let statusFilter = $state('all');
	let sortKey = $state<'date' | 'number' | 'amount' | 'client'>('date');
	let sortDir = $state<'asc' | 'desc'>('desc');

	const INVOICE_STATUSES: DerivedStatus[] = ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'];
	const QUOTE_STATUSES: DerivedStatus[] = ['draft', 'sent', 'accepted', 'declined', 'expired', 'cancelled'];
	let statuses = $derived(type === 'invoice' ? INVOICE_STATUSES : QUOTE_STATUSES);

	let base = $derived(app.views.filter((v) => v.doc.type === type));

	let filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		let out = base.filter((v) => {
			if (statusFilter !== 'all' && v.status !== statusFilter) return false;
			if (!q) return true;
			const clientName = v.client ? `${v.client.company} ${v.client.name}` : '';
			return `${v.doc.number} ${clientName} ${v.doc.reference}`.toLowerCase().includes(q);
		});
		const dir = sortDir === 'asc' ? 1 : -1;
		out = [...out].sort((a, b) => {
			switch (sortKey) {
				case 'number':
					return a.doc.number.localeCompare(b.doc.number, undefined, { numeric: true }) * dir;
				case 'amount':
					return (a.totals.grandTotal - b.totals.grandTotal) * dir;
				case 'client':
					return app.clientName(a.doc.clientId).localeCompare(app.clientName(b.doc.clientId)) * dir;
				default:
					return (a.doc.date.localeCompare(b.doc.date) || a.doc.number.localeCompare(b.doc.number)) * dir;
			}
		});
		return out;
	});

	function setSort(key: typeof sortKey) {
		if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortKey = key;
			sortDir = key === 'date' || key === 'amount' ? 'desc' : 'asc';
		}
	}

	const ariaSort = (key: typeof sortKey) => (sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');

	let totals = $derived({
		value: filtered.reduce((s, v) => s + (v.status === 'cancelled' ? 0 : v.totals.grandTotal), 0),
		balance: filtered.reduce((s, v) => s + (v.status === 'cancelled' ? 0 : v.balance), 0)
	});

	function exportCsv() {
		const label = type === 'invoice' ? 'invoices' : 'quotations';
		downloadCsv(documentsCsv(filtered as DocView[], app.data.settings.dateFormat), `invoicenest-${label}.csv`);
	}
</script>

<div class="toolbar no-print">
	<input type="search" placeholder="Search number, client or reference" bind:value={search} aria-label="Search {type === 'invoice' ? 'invoices' : 'quotations'}" />
	<select bind:value={statusFilter} aria-label="Filter by status">
		<option value="all">All statuses</option>
		{#each statuses as s (s)}<option value={s}>{STATUS_LABEL[s]}</option>{/each}
	</select>
	<span class="hint" style="margin-left:auto">
		{filtered.length} of {base.length} &middot; value <Money paise={totals.value} />
		{#if type === 'invoice'} &middot; balance <Money paise={totals.balance} />{/if}
	</span>
	<button class="btn btn-sm" onclick={exportCsv} disabled={filtered.length === 0}>Export CSV</button>
</div>

{#if !app.loaded}
	<div class="card card-pad"><div class="skeleton" style="height:160px"></div></div>
{:else if base.length === 0}
	<div class="card empty">
		<h3>No {type === 'invoice' ? 'invoices' : 'quotations'} yet</h3>
		<p>
			{type === 'invoice'
				? 'Create your first invoice, with GST split automatically into CGST and SGST or IGST based on the place of supply.'
				: 'Send a quotation first, then convert it into an invoice in one click once the client accepts.'}
		</p>
		<a class="btn btn-primary" href="/documents/new?type={type}">New {type}</a>
	</div>
{:else if filtered.length === 0}
	<div class="card empty">
		<h3>No matches</h3>
		<p>No {type === 'invoice' ? 'invoices' : 'quotations'} match that search or filter.</p>
		<button
			class="btn"
			onclick={() => {
				search = '';
				statusFilter = 'all';
			}}>Clear filters</button
		>
	</div>
{:else}
	<div class="card table-as-cards">
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th scope="col" aria-sort={ariaSort('number')}><button class="sort-btn" onclick={() => setSort('number')}>Number</button></th>
						<th scope="col" aria-sort={ariaSort('date')}><button class="sort-btn" onclick={() => setSort('date')}>Date</button></th>
						<th scope="col" aria-sort={ariaSort('client')}><button class="sort-btn" onclick={() => setSort('client')}>Client</button></th>
						<th scope="col">{type === 'invoice' ? 'Due' : 'Valid until'}</th>
						<th scope="col">Status</th>
						<th scope="col" class="num" aria-sort={ariaSort('amount')}><button class="sort-btn num" onclick={() => setSort('amount')}>Amount</button></th>
						{#if type === 'invoice'}<th scope="col" class="num">Balance</th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each filtered as v (v.doc.id)}
						<tr>
							<td><a href="/documents/{v.doc.id}">{v.doc.number}</a></td>
							<td>{formatDate(v.doc.date, app.data.settings.dateFormat)}</td>
							<td>{v.client ? v.client.company || v.client.name : '-'}</td>
							<td>{v.doc.dueDate ? formatDate(v.doc.dueDate, app.data.settings.dateFormat) : '-'}</td>
							<td><StatusPill status={v.status} /></td>
							<td class="num"><Money paise={v.totals.grandTotal} /></td>
							{#if type === 'invoice'}<td class="num"><Money paise={v.balance} /></td>{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="cards-list card-pad">
			{#each filtered as v (v.doc.id)}
				<a class="doc-card" href="/documents/{v.doc.id}">
					<div class="dc-top">
						<strong>{v.doc.number}</strong>
						<StatusPill status={v.status} />
					</div>
					<div class="dc-client">{v.client ? v.client.company || v.client.name : '-'}</div>
					<div class="dc-bottom">
						<span class="hint">{formatDate(v.doc.date, app.data.settings.dateFormat)}</span>
						<strong class="mono-num"><Money paise={v.totals.grandTotal} /></strong>
					</div>
					{#if type === 'invoice' && v.balance > 0}
						<div class="hint">Balance <Money paise={v.balance} /></div>
					{/if}
				</a>
			{/each}
		</div>
	</div>
{/if}

<style>
	.sort-btn {
		background: none;
		border: none;
		font: inherit;
		color: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		font-weight: inherit;
		cursor: pointer;
		padding: 0;
		min-height: 0;
	}

	.sort-btn:hover {
		color: var(--primary);
		text-decoration: underline;
	}

	.doc-card {
		display: grid;
		gap: 0.3rem;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: inherit;
		background: var(--surface);
	}

	.dc-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}

	.dc-client {
		font-size: 0.9rem;
		color: var(--muted);
	}

	.dc-bottom {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}
</style>
