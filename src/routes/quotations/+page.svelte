<script lang="ts">
	import DocList from '$lib/components/DocList.svelte';
</script>

<div class="page-head">
	<div>
		<h1>Quotations</h1>
		<p>Accepted quotations convert into an invoice in one click, keeping both documents linked.</p>
	</div>
	<a class="btn btn-primary" href="/documents/new?type=quotation">New quotation</a>
</div>

<DocList type="quotation" />
