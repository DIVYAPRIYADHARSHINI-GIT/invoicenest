<script lang="ts">
	// Clients: search, add, edit, delete. Deleting a client that has documents is
	// blocked with a clear message rather than silently orphaning records.
	import { app } from '$lib/app.svelte.ts';
	import { downloadCsv } from '$lib/actions.ts';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { clientsCsv } from '$lib/core/csv.ts';
	import { newId } from '$lib/core/defaults.ts';
	import { clientUsage } from '$lib/core/select.ts';
	import { pickableStates, stateName } from '$lib/core/states.ts';
	import type { Client } from '$lib/core/types.ts';
	import { collect, validateEmail, validateGstin, validatePhone, validateRequired } from '$lib/core/validate.ts';

	let search = $state('');
	let editingId = $state<string | null>(null);
	let draft = $state<Client | null>(null);
	let errors = $state<Record<string, string>>({});
	let confirmId = $state<string | null>(null);

	let filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const list = [...app.data.clients].sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name));
		if (!q) return list;
		return list.filter((c) => `${c.name} ${c.company} ${c.email} ${c.phone} ${c.gstin}`.toLowerCase().includes(q));
	});

	function startNew() {
		editingId = 'new';
		errors = {};
		draft = {
			id: newId('cl'),
			name: '',
			company: '',
			email: '',
			phone: '',
			address: '',
			state: app.data.profile.state,
			gstin: '',
			notes: '',
			createdAt: new Date().toISOString()
		};
	}

	function startEdit(c: Client) {
		editingId = c.id;
		errors = {};
		draft = { ...c };
	}

	function validate(d: Client) {
		return collect({
			name: validateRequired(d.company || d.name, 'A client or company name'),
			state: validateRequired(d.state, 'State'),
			email: validateEmail(d.email),
			phone: validatePhone(d.phone),
			gstin: validateGstin(d.gstin, d.state)
		});
	}

	function save() {
		if (!draft) return;
		const d = { ...draft, gstin: draft.gstin.trim().toUpperCase() };
		const errs = validate(d);
		errors = errs;
		if (Object.keys(errs).length) return;
		app.commit((data) => {
			const i = data.clients.findIndex((c) => c.id === d.id);
			if (i >= 0) data.clients[i] = d;
			else data.clients.push(d);
		}, `Saved ${d.company || d.name}.`);
		editingId = null;
		draft = null;
	}

	function removeClient(id: string) {
		const usage = clientUsage($state.snapshot(app.data), id);
		if (usage.docs > 0 || usage.recurring > 0) {
			app.toast(
				`This client has ${usage.docs} document${usage.docs === 1 ? '' : 's'}${usage.recurring ? ` and ${usage.recurring} recurring template${usage.recurring === 1 ? '' : 's'}` : ''}. Delete or reassign those first.`,
				'error'
			);
			return;
		}
		app.commit((data) => (data.clients = data.clients.filter((c) => c.id !== id)), 'Client deleted.');
	}

	let pendingClient = $derived(confirmId ? app.data.clients.find((c) => c.id === confirmId) : null);
</script>

<div class="page-head">
	<div>
		<h1>Clients</h1>
		<p>The client's state sets the place of supply, which decides CGST + SGST or IGST.</p>
	</div>
	<div class="btn-row">
		<button class="btn btn-sm" onclick={() => downloadCsv(clientsCsv($state.snapshot(app.data)), 'invoicenest-clients.csv')} disabled={!app.data.clients.length}>
			Export CSV
		</button>
		<button class="btn btn-primary" onclick={startNew}>Add client</button>
	</div>
</div>

{#if editingId && draft}
	<section class="card" style="margin-bottom:1rem">
		<div class="card-head"><h2>{editingId === 'new' ? 'New client' : 'Edit client'}</h2></div>
		<div class="card-pad grid grid-2" style="gap:.85rem">
			<div class="field">
				<label for="c-company">Company</label>
				<input id="c-company" bind:value={draft.company} aria-invalid={errors.name ? 'true' : undefined} />
			</div>
			<div class="field">
				<label for="c-name">Contact name</label>
				<input id="c-name" bind:value={draft.name} aria-invalid={errors.name ? 'true' : undefined} />
				{#if errors.name}<span class="error-text">{errors.name}</span>{/if}
			</div>
			<div class="field">
				<label for="c-email">Email</label>
				<input id="c-email" type="email" bind:value={draft.email} aria-invalid={errors.email ? 'true' : undefined} />
				{#if errors.email}<span class="error-text">{errors.email}</span>{/if}
			</div>
			<div class="field">
				<label for="c-phone">Phone</label>
				<input id="c-phone" bind:value={draft.phone} aria-invalid={errors.phone ? 'true' : undefined} />
				{#if errors.phone}<span class="error-text">{errors.phone}</span>{/if}
			</div>
			<div class="field" style="grid-column:1/-1">
				<label for="c-address">Billing address</label>
				<textarea id="c-address" bind:value={draft.address}></textarea>
			</div>
			<div class="field">
				<label for="c-state">State</label>
				<select id="c-state" bind:value={draft.state} aria-invalid={errors.state ? 'true' : undefined}>
					<option value="">Select a state</option>
					{#each pickableStates() as s (s.code)}<option value={s.code}>{s.code} - {s.name}</option>{/each}
				</select>
				{#if errors.state}<span class="error-text">{errors.state}</span>{/if}
			</div>
			<div class="field">
				<label for="c-gstin">GSTIN (optional)</label>
				<input id="c-gstin" class="num" bind:value={draft.gstin} placeholder="33AABCB1234C1Z5" aria-invalid={errors.gstin ? 'true' : undefined} />
				{#if errors.gstin}<span class="error-text">{errors.gstin}</span>{/if}
			</div>
			<div class="field" style="grid-column:1/-1">
				<label for="c-notes">Notes</label>
				<textarea id="c-notes" bind:value={draft.notes}></textarea>
			</div>
		</div>
		<div class="card-pad btn-row" style="border-top:1px solid var(--border)">
			<button class="btn btn-primary" onclick={save}>Save client</button>
			<button
				class="btn"
				onclick={() => {
					editingId = null;
					draft = null;
					errors = {};
				}}>Cancel</button
			>
		</div>
	</section>
{/if}

<div class="toolbar">
	<input type="search" placeholder="Search clients" bind:value={search} aria-label="Search clients" />
	<span class="hint" style="margin-left:auto">{filtered.length} of {app.data.clients.length}</span>
</div>

{#if !app.loaded}
	<div class="card card-pad"><div class="skeleton" style="height:140px"></div></div>
{:else if app.data.clients.length === 0}
	<div class="card empty">
		<h3>No clients yet</h3>
		<p>Add a client to start invoicing. You only need a name and a state; GSTIN is optional for unregistered clients.</p>
		<button class="btn btn-primary" onclick={startNew}>Add your first client</button>
	</div>
{:else}
	<div class="card table-as-cards">
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th scope="col">Client</th>
						<th scope="col">State</th>
						<th scope="col">GSTIN</th>
						<th scope="col">Contact</th>
						<th scope="col" class="num">Documents</th>
						<th scope="col"></th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as c (c.id)}
						{@const usage = clientUsage(app.data, c.id)}
						<tr>
							<td>
								<strong>{c.company || c.name}</strong>
								{#if c.company && c.name}<div class="hint">{c.name}</div>{/if}
							</td>
							<td>{c.state ? `${stateName(c.state)} (${c.state})` : '-'}</td>
							<td class="mono-num">{c.gstin || '-'}</td>
							<td>
								{#if c.email}<div class="hint">{c.email}</div>{/if}
								{#if c.phone}<div class="hint mono-num">{c.phone}</div>{/if}
								{#if !c.email && !c.phone}-{/if}
							</td>
							<td class="num">{usage.docs}</td>
							<td>
								<div class="btn-row">
									<button class="btn btn-sm btn-ghost" onclick={() => startEdit(c)}>Edit</button>
									<button class="btn btn-sm btn-ghost" onclick={() => (confirmId = c.id)}>Delete</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="cards-list card-pad">
			{#each filtered as c (c.id)}
				<div class="client-card">
					<strong>{c.company || c.name}</strong>
					<div class="hint">{c.state ? stateName(c.state) : 'No state'} &middot; {clientUsage(app.data, c.id).docs} documents</div>
					{#if c.gstin}<div class="hint mono-num">{c.gstin}</div>{/if}
					<div class="btn-row">
						<button class="btn btn-sm" onclick={() => startEdit(c)}>Edit</button>
						<button class="btn btn-sm btn-ghost" onclick={() => (confirmId = c.id)}>Delete</button>
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

<ConfirmDialog
	open={confirmId !== null}
	title="Delete this client?"
	message={pendingClient ? `${pendingClient.company || pendingClient.name} will be removed from this browser. Clients with documents cannot be deleted.` : ''}
	confirmLabel="Delete"
	danger
	onconfirm={() => {
		if (confirmId) removeClient(confirmId);
		confirmId = null;
	}}
	oncancel={() => (confirmId = null)}
/>

<style>
	.client-card {
		display: grid;
		gap: 0.3rem;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
</style>
