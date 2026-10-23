<script lang="ts">
	// Print-friendly view: just the document sheet, sized for A4.
	import { page } from '$app/state';
	import { app } from '$lib/app.svelte.ts';
	import DocPreview from '$lib/components/DocPreview.svelte';
	import { viewDoc } from '$lib/core/select.ts';
	import { buildRenderDoc } from '$lib/doc/model.ts';

	let doc = $derived(app.data.docs.find((d) => d.id === page.params.id) ?? null);
	let render = $derived(doc ? buildRenderDoc($state.snapshot(app.data), viewDoc($state.snapshot(app.data), doc)) : null);
</script>

{#if render && doc}
	<div class="print-bar no-print">
		<a class="btn btn-sm" href="/documents/{doc.id}">Back to the document</a>
		<button class="btn btn-sm btn-primary" onclick={() => window.print()}>Print</button>
		<span class="hint">Use your browser's "Save as PDF" here, or download the generated PDF from the document page.</span>
	</div>
	<div class="print-sheet">
		<DocPreview doc={render} showQr={!render.isQuotation && Boolean(render.upi)} />
	</div>
{:else if app.loaded}
	<div class="card empty"><h3>Document not found</h3><a class="btn" href="/invoices">Back to invoices</a></div>
{/if}

<style>
	.print-bar {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}

	.print-sheet {
		max-width: 820px;
	}

	@media print {
		.print-sheet {
			max-width: none;
		}

		:global(.sheet) {
			border: none !important;
			border-radius: 0 !important;
			padding: 0 !important;
		}
	}
</style>
