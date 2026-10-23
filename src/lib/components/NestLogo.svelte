<script lang="ts">
	// Nest-shaped mark: stacked arcs cradling the "egg" of a document.
	let { size = 28, light = false }: { size?: number; light?: boolean } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="InvoiceNest logo" focusable="false">
	<path d="M5 20.5c0-6.1 4.9-11 11-11s11 4.9 11 11" fill="none" stroke={light ? '#8B87F0' : 'var(--primary)'} stroke-width="2.6" stroke-linecap="round" />
	<path
		d="M8.8 23c0-4 3.2-7.2 7.2-7.2s7.2 3.2 7.2 7.2"
		fill="none"
		stroke={light ? '#5C56C9' : 'color-mix(in srgb, var(--primary) 55%, transparent)'}
		stroke-width="2.4"
		stroke-linecap="round"
	/>
	<path d="M12.6 25.2c0-1.9 1.5-3.4 3.4-3.4s3.4 1.5 3.4 3.4" fill="none" stroke={light ? '#FFFFFF' : 'var(--ink)'} stroke-width="2.2" stroke-linecap="round" />
</svg>
