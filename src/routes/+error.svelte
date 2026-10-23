<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="card empty" style="margin-top:2rem">
	<h1 style="font-size:2.5rem;margin-bottom:.25rem">{page.status}</h1>
	<h3>{page.status === 404 ? 'That page does not exist' : 'Something went wrong'}</h3>
	<p>
		{page.error?.message ?? 'An unexpected error occurred.'}
		{#if page.status === 404}
			Your data is safe - it is stored in this browser and nothing was lost.
		{/if}
	</p>
	<div class="btn-row" style="justify-content:center">
		<a class="btn btn-primary" href="/">Back to the dashboard</a>
		<a class="btn" href="/invoices">Invoices</a>
	</div>
</div>
