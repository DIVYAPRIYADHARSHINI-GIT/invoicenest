<script lang="ts">
	// Items catalogue: reusable descriptions, HSN/SAC, unit, default rate and tax
	// rate so a line can be filled in one pick inside the editor.
	import { app } from '$lib/app.svelte.ts';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Money from '$lib/components/Money.svelte';
	import { newId, UNITS } from '$lib/core/defaults.ts';
	import { paiseToDecimal, pctToString, toPaise } from '$lib/core/money.ts';
	import type { CatalogueItem } from '$lib/core/types.ts';
	import { collect, validateRequired } from '$lib/core/validate.ts';

	let search = $state('');
	let editingId = $state<string | null>(null);
	let draft = $state<CatalogueItem | null>(null);
	let rateText = $state('0.00');
	let errors = $state<Record<string, string>>({});
	let confirmId = $state<string | null>(null);

	let filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const list = [...app.data.items].sort((a, b) => a.name.localeCompare(b.name));
		if (!q) return list;
		return list.filter((i) => `${i.name} ${i.description} ${i.hsn}`.toLowerCase().includes(q));
	});

	function startNew() {
		editingId = 'new';
		errors = {};
		rateText = '0.00';
		draft = {
			id: newId('it'),
			name: '',
			description: '',
			hsn: '',
			unit: 'nos',
			rate: 0,
			taxBp: app.data.settings.defaultTaxBp,
			createdAt: new Date().toISOString()
		};
	}

	function startEdit(item: CatalogueItem) {
		editingId = item.id;
		errors = {};
		draft = { ...item };
		rateText = paiseToDecimal(item.rate);
	}

	function save() {
		if (!draft) return;
		const d = { ...draft, rate: toPaise(rateText) };
		const errs = collect({ name: validateRequired(d.name, 'An item name') });
		errors = errs;
		if (Object.keys(errs).length) return;
		app.commit((data) => {
			const i = data.items.findIndex((x) => x.id === d.id);
			if (i >= 0) data.items[i] = d;
			else data.items.push(d);
		}, `Saved ${d.name}.`);
		editingId = null;
		draft = null;
	}
</script>

<div class="page-head">
	<div>
		<h1>Items</h1>
		<p>Saved items fill a line item in one pick, including HSN or SAC code and the usual tax rate.</p>
	</div>
	<button class="btn btn-primary" onclick={startNew}>Add item</button>
</div>

{#if editingId && draft}
	<section class="card" style="margin-bottom:1rem">
		<div class="card-head"><h2>{editingId === 'new' ? 'New item' : 'Edit item'}</h2></div>
		<div class="card-pad grid grid-2" style="gap:.85rem">
			<div class="field">
				<label for="i-name">Name</label>
				<input id="i-name" bind:value={draft.name} aria-invalid={errors.name ? 'true' : undefined} />
				{#if errors.name}<span class="error-text">{errors.name}</span>{/if}
			</div>
			<div class="field">
				<label for="i-hsn">HSN or SAC code (optional)</label>
				<input id="i-hsn" class="num" bind:value={draft.hsn} placeholder="998314" />
			</div>
			<div class="field" style="grid-column:1/-1">
				<label for="i-desc">Description</label>
				<textarea id="i-desc" bind:value={draft.description}></textarea>
			</div>
			<div class="field">
				<label for="i-unit">Unit</label>
				<select id="i-unit" bind:value={draft.unit}>
					{#each UNITS as u (u)}<option value={u}>{u}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="i-rate">Default rate</label>
				<input id="i-rate" class="num" inputmode="decimal" bind:value={rateText} />
			</div>
			<div class="field">
				<label for="i-tax">Default tax rate</label>
				<select id="i-tax" value={String(draft.taxBp)} onchange={(e) => draft && (draft.taxBp = Number(e.currentTarget.value))}>
					{#each app.data.settings.taxRates as t (t.id)}<option value={String(t.bp)}>{t.label}</option>{/each}
				</select>
			</div>
		</div>
		<div class="card-pad btn-row" style="border-top:1px solid var(--border)">
			<button class="btn btn-primary" onclick={save}>Save item</button>
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

<div class="toolbar">
	<input type="search" placeholder="Search items" bind:value={search} aria-label="Search items" />
	<span class="hint" style="margin-left:auto">{filtered.length} of {app.data.items.length}</span>
</div>

{#if !app.loaded}
	<div class="card card-pad"><div class="skeleton" style="height:140px"></div></div>
{:else if app.data.items.length === 0}
	<div class="card empty">
		<h3>No catalogue items yet</h3>
		<p>Add the services or products you bill most often so you do not retype them on every invoice.</p>
		<button class="btn btn-primary" onclick={startNew}>Add your first item</button>
	</div>
{:else}
	<div class="card table-as-cards">
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th scope="col">Item</th>
						<th scope="col">HSN/SAC</th>
						<th scope="col">Unit</th>
						<th scope="col" class="num">Rate</th>
						<th scope="col" class="num">Tax</th>
						<th scope="col"></th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as item (item.id)}
						<tr>
							<td>
								<strong>{item.name}</strong>
								{#if item.description}<div class="hint">{item.description}</div>{/if}
							</td>
							<td class="mono-num">{item.hsn || '-'}</td>
							<td>{item.unit}</td>
							<td class="num"><Money paise={item.rate} /></td>
							<td class="num">{pctToString(item.taxBp)}%</td>
							<td>
								<div class="btn-row">
									<button class="btn btn-sm btn-ghost" onclick={() => startEdit(item)}>Edit</button>
									<button class="btn btn-sm btn-ghost" onclick={() => (confirmId = item.id)}>Delete</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="cards-list card-pad">
			{#each filtered as item (item.id)}
				<div class="item-card">
					<strong>{item.name}</strong>
					<div class="hint">{item.unit} &middot; {pctToString(item.taxBp)}% tax {item.hsn ? `&middot; HSN ${item.hsn}` : ''}</div>
					<strong class="mono-num"><Money paise={item.rate} /></strong>
					<div class="btn-row">
						<button class="btn btn-sm" onclick={() => startEdit(item)}>Edit</button>
						<button class="btn btn-sm btn-ghost" onclick={() => (confirmId = item.id)}>Delete</button>
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

<ConfirmDialog
	open={confirmId !== null}
	title="Delete this item?"
	message="Documents that already use it keep their own copy of the description and rate."
	confirmLabel="Delete"
	danger
	onconfirm={() => {
		const id = confirmId;
		confirmId = null;
		if (id) app.commit((d) => (d.items = d.items.filter((x) => x.id !== id)), 'Item deleted.');
	}}
	oncancel={() => (confirmId = null)}
/>

<style>
	.item-card {
		display: grid;
		gap: 0.3rem;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
</style>
