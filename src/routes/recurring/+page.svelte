<script lang="ts">
	// Recurring templates. No server means no cron, so due invoices are generated
	// as drafts the next time the app is opened - stated plainly on the page.
	import { app } from '$lib/app.svelte.ts';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Money from '$lib/components/Money.svelte';
	import { addDays, formatDate, today } from '$lib/core/dates.ts';
	import { blankLine, newId, UNITS } from '$lib/core/defaults.ts';
	import { computeTotals } from '$lib/core/gst.ts';
	import { paiseToDecimal, pctToString, qtyToString, toPaise, toQty } from '$lib/core/money.ts';
	import { FREQUENCY_LABEL } from '$lib/core/recurring.ts';
	import { pickableStates } from '$lib/core/states.ts';
	import type { Frequency, RecurringTemplate } from '$lib/core/types.ts';

	let editingId = $state<string | null>(null);
	let draft = $state<RecurringTemplate | null>(null);
	let confirmId = $state<string | null>(null);

	function startNew() {
		editingId = 'new';
		draft = {
			id: newId('rc'),
			title: '',
			clientId: app.data.clients[0]?.id ?? '',
			placeOfSupply: app.data.clients[0]?.state ?? app.data.profile.state,
			lines: [blankLine(app.data.settings.defaultTaxBp)],
			charges: [],
			taxInclusive: app.data.settings.taxInclusive,
			frequency: 'monthly',
			nextDate: addDays(today(), 30),
			notes: app.data.settings.defaultNotes,
			terms: app.data.settings.defaultTerms,
			active: true,
			lastRunAt: '',
			createdAt: new Date().toISOString()
		};
	}

	function startEdit(t: RecurringTemplate) {
		editingId = t.id;
		draft = structuredClone($state.snapshot(t));
	}

	function save() {
		if (!draft) return;
		if (!draft.title.trim() || !draft.clientId) {
			app.toast('A title and a client are required.', 'error');
			return;
		}
		const d = draft;
		app.commit((data) => {
			const i = data.recurring.findIndex((x) => x.id === d.id);
			if (i >= 0) data.recurring[i] = d;
			else data.recurring.push(d);
		}, `Saved ${d.title}.`);
		editingId = null;
		draft = null;
	}

	function previewTotal(t: RecurringTemplate): number {
		return computeTotals({
			lines: t.lines,
			charges: t.charges,
			taxInclusive: t.taxInclusive,
			businessState: app.data.profile.state,
			placeOfSupply: t.placeOfSupply,
			roundOff: true
		}).grandTotal;
	}
</script>

<div class="page-head">
	<div>
		<h1>Recurring invoices</h1>
		<p>Templates that turn into draft invoices on their next date.</p>
	</div>
	<button class="btn btn-primary" onclick={startNew} disabled={app.data.clients.length === 0}>Add template</button>
</div>

<div class="banner banner-info">
	<div>
		<strong>How this works without a server.</strong>
		InvoiceNest has no background scheduler, because it runs entirely in your browser with no paid services. Any recurring invoice that has come due is created as a
		<strong>Draft</strong> the next time you open the app, and you get a notice listing exactly what was created. Nothing is ever sent automatically - you review and send each draft yourself.
	</div>
</div>

{#if editingId && draft}
	<section class="card" style="margin-bottom:1rem">
		<div class="card-head"><h2>{editingId === 'new' ? 'New template' : 'Edit template'}</h2></div>
		<div class="card-pad grid grid-2" style="gap:.85rem">
			<div class="field">
				<label for="r-title">Title</label>
				<input id="r-title" bind:value={draft.title} placeholder="Monthly retainer" />
			</div>
			<div class="field">
				<label for="r-client">Client</label>
				<select
					id="r-client"
					value={draft.clientId}
					onchange={(e) => {
						if (!draft) return;
						draft.clientId = e.currentTarget.value;
						const c = app.data.clients.find((x) => x.id === draft!.clientId);
						if (c?.state) draft.placeOfSupply = c.state;
					}}
				>
					{#each app.data.clients as c (c.id)}<option value={c.id}>{c.company || c.name}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="r-pos">Place of supply</label>
				<select id="r-pos" bind:value={draft.placeOfSupply}>
					{#each pickableStates() as s (s.code)}<option value={s.code}>{s.code} - {s.name}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="r-freq">Frequency</label>
				<select id="r-freq" value={draft.frequency} onchange={(e) => draft && (draft.frequency = e.currentTarget.value as Frequency)}>
					{#each Object.entries(FREQUENCY_LABEL) as [id, label] (id)}<option value={id}>{label}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="r-next">Next date</label>
				<input id="r-next" type="date" bind:value={draft.nextDate} />
			</div>
			<div class="field">
				<span class="label">Options</span>
				<label class="checkbox"><input type="checkbox" bind:checked={draft.active} /> Active</label>
				<label class="checkbox"><input type="checkbox" bind:checked={draft.taxInclusive} /> Rates include GST</label>
			</div>

			<div style="grid-column:1/-1">
				<span class="label">Line items</span>
				{#each draft.lines as l, i (l.id)}
					<div class="r-line">
						<input aria-label="Description" bind:value={draft.lines[i].description} placeholder="Description" />
						<input aria-label="Quantity" class="num" value={qtyToString(l.qty)} onchange={(e) => draft && (draft.lines[i].qty = toQty(e.currentTarget.value))} />
						<select aria-label="Unit" bind:value={draft.lines[i].unit}>
							{#each UNITS as u (u)}<option value={u}>{u}</option>{/each}
						</select>
						<input aria-label="Rate" class="num" value={paiseToDecimal(l.rate)} onchange={(e) => draft && (draft.lines[i].rate = toPaise(e.currentTarget.value))} />
						<select aria-label="Tax rate" value={String(l.taxBp)} onchange={(e) => draft && (draft.lines[i].taxBp = Number(e.currentTarget.value))}>
							{#each app.data.settings.taxRates as t (t.id)}<option value={String(t.bp)}>{t.label}</option>{/each}
						</select>
						<button class="btn btn-sm btn-ghost" onclick={() => draft && (draft.lines = draft.lines.filter((x) => x.id !== l.id))} disabled={draft.lines.length === 1}>
							Remove
						</button>
					</div>
				{/each}
				<button class="btn btn-sm" style="margin-top:.5rem" onclick={() => draft && draft.lines.push(blankLine(app.data.settings.defaultTaxBp))}>Add line</button>
			</div>
		</div>
		<div class="card-pad btn-row" style="border-top:1px solid var(--border)">
			<button class="btn btn-primary" onclick={save}>Save template</button>
			<button
				class="btn"
				onclick={() => {
					editingId = null;
					draft = null;
				}}>Cancel</button
			>
		</div>
	</section>
{/if}

{#if !app.loaded}
	<div class="card card-pad"><div class="skeleton" style="height:120px"></div></div>
{:else if app.data.clients.length === 0}
	<div class="card empty">
		<h3>Add a client first</h3>
		<p>A recurring template needs a client to bill.</p>
		<a class="btn btn-primary" href="/clients">Go to clients</a>
	</div>
{:else if app.data.recurring.length === 0}
	<div class="card empty">
		<h3>No recurring templates</h3>
		<p>Set up a retainer or maintenance fee once, and InvoiceNest will prepare the draft invoice each period.</p>
		<button class="btn btn-primary" onclick={startNew}>Add your first template</button>
	</div>
{:else}
	<div class="card">
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th scope="col">Template</th>
						<th scope="col">Client</th>
						<th scope="col">Frequency</th>
						<th scope="col">Next date</th>
						<th scope="col">Status</th>
						<th scope="col" class="num">Amount</th>
						<th scope="col"></th>
					</tr>
				</thead>
				<tbody>
					{#each app.data.recurring as t (t.id)}
						<tr>
							<td><strong>{t.title}</strong></td>
							<td>{app.clientName(t.clientId)}</td>
							<td>{FREQUENCY_LABEL[t.frequency]}</td>
							<td>{formatDate(t.nextDate, app.data.settings.dateFormat)}</td>
							<td><span class="pill {t.active ? 'pill-good' : 'pill-neutral'}">{t.active ? 'Active' : 'Paused'}</span></td>
							<td class="num"><Money paise={previewTotal(t)} /></td>
							<td>
								<div class="btn-row">
									<button class="btn btn-sm btn-ghost" onclick={() => startEdit(t)}>Edit</button>
									<button
										class="btn btn-sm btn-ghost"
										onclick={() =>
											app.commit((d) => {
												const x = d.recurring.find((r) => r.id === t.id);
												if (x) x.active = !x.active;
											}, t.active ? 'Template paused.' : 'Template activated.')}
									>
										{t.active ? 'Pause' : 'Activate'}
									</button>
									<button class="btn btn-sm btn-ghost" onclick={() => (confirmId = t.id)}>Delete</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/if}

<ConfirmDialog
	open={confirmId !== null}
	title="Delete this template?"
	message="Invoices already generated from it are not affected."
	confirmLabel="Delete"
	danger
	onconfirm={() => {
		const id = confirmId;
		confirmId = null;
		if (id) app.commit((d) => (d.recurring = d.recurring.filter((x) => x.id !== id)), 'Template deleted.');
	}}
	oncancel={() => (confirmId = null)}
/>

<style>
	.r-line {
		display: grid;
		grid-template-columns: 1fr 70px 90px 110px 90px auto;
		gap: 0.4rem;
		margin-top: 0.4rem;
		align-items: center;
	}

	@media (max-width: 760px) {
		.r-line {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
