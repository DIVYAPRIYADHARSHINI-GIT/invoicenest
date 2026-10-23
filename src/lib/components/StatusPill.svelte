<script lang="ts">
	// Status pill: colour AND text, never colour alone (WCAG).
	import { STATUS_LABEL, STATUS_TONE } from '$lib/core/status.ts';
	import type { DerivedStatus } from '$lib/core/types.ts';

	let { status, title = '' }: { status: DerivedStatus; title?: string } = $props();
</script>

<span class="pill pill-{STATUS_TONE[status]}" {title}>{STATUS_LABEL[status]}</span>
