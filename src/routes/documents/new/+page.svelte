<script lang="ts">
	// "New document" creates a draft shell once, then hands over to the editor, so
	// there is one editor implementation rather than two.
	//
	// IMPORTANT: creating the draft writes to app.data, which is the same reactive
	// state this component reads. The `started` guard plus `untrack` keep that from
	// re-triggering the effect (which would create documents in an endless loop).
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { app } from '$lib/app.svelte.ts';
	import { addDays, today } from '$lib/core/dates.ts';
	import { blankLine, newId } from '$lib/core/defaults.ts';
	import type { DocType, InvoiceDoc } from '$lib/core/types.ts';

	let error = $state('');
	let started = false;

	function createDraft() {
		const type = (page.url.searchParams.get('type') === 'quotation' ? 'quotation' : 'invoice') as DocType;
		const fromId = page.url.searchParams.get('from') ?? '';
		const convertId = page.url.searchParams.get('convert') ?? '';
		const draftId = newId(type === 'invoice' ? 'in' : 'qt');
		const date = today();
		const s = app.data.settings;

		const source = app.data.docs.find((d) => d.id === (convertId || fromId));
		if ((convertId || fromId) && !source) {
			error = 'That document could not be found.';
			return;
		}

		app.commit((d) => {
			const used = new Set(d.docs.map((x) => x.number.toLowerCase()));
			const number = app.reserveNumber(d, type, date, used);
			const base: InvoiceDoc = {
				id: draftId,
				type,
				number,
				date,
				dueDate: addDays(date, type === 'invoice' ? s.defaultDueDays : s.defaultValidDays),
				clientId: source?.clientId ?? '',
				placeOfSupply: source?.placeOfSupply ?? d.profile.state,
				reference: convertId && source ? `Against quotation ${source.number}` : '',
				lines: source ? source.lines.map((l) => ({ ...l, id: newId('line') })) : [blankLine(s.defaultTaxBp)],
				charges: source ? source.charges.map((c) => ({ ...c, id: newId('ch') })) : [],
				taxInclusive: source?.taxInclusive ?? s.taxInclusive,
				roundOff: true,
				notes: source?.notes ?? s.defaultNotes,
				terms: source?.terms ?? s.defaultTerms,
				signature: '',
				template: source?.template ?? s.template,
				status: 'draft',
				convertedFromId: convertId ? source?.id : undefined,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			};
			d.docs.push(base);
			if (convertId && source) {
				const src = d.docs.find((x) => x.id === source.id);
				if (src) {
					src.convertedToId = draftId;
					src.status = 'accepted';
				}
			}
		});
		goto(`/documents/${draftId}?edit=1`, { replaceState: true });
	}

	$effect(() => {
		// Only `app.loaded` is tracked; everything else runs untracked so writing the
		// new document cannot invalidate this effect.
		if (!app.loaded || started) return;
		started = true;
		untrack(() => createDraft());
	});
</script>

{#if error}
	<div class="banner banner-bad"><div>{error} <a href="/invoices">Back to invoices</a></div></div>
{:else}
	<div class="card card-pad">
		<h1 class="visually-hidden">Creating a new document</h1>
		<div class="skeleton" style="height:28px;width:220px;margin-bottom:1rem"></div>
		<div class="skeleton" style="height:180px"></div>
	</div>
{/if}
