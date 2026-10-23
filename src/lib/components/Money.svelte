<script lang="ts">
	// Money display: Indian grouping for INR, tabular numerals, right aligned.
	import { app } from '$lib/app.svelte.ts';
	import { formatAmount } from '$lib/core/money.ts';

	let { paise, symbol = true, bold = false }: { paise: number; symbol?: boolean; bold?: boolean } = $props();
</script>

<span class="mono-num" class:bold>{formatAmount(paise, app.data.settings.currency, symbol)}</span>

<style>
	.bold {
		font-weight: 650;
	}
</style>
