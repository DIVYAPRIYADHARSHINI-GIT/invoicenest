<script lang="ts">
	import DocList from '$lib/components/DocList.svelte';
</script>

<div class="page-head">
	<div>
		<h1>Invoices</h1>
		<p>Overdue is calculated from the due date, so it updates itself every day.</p>
	</div>
	<a class="btn btn-primary" href="/documents/new?type=invoice">New invoice</a>
</div>

<DocList type="invoice" />
