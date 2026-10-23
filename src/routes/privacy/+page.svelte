<script lang="ts">
	import { app } from '$lib/app.svelte.ts';
	import { exportBackup } from '$lib/actions.ts';
	import { BACKUP_REMINDER_DAYS } from '$lib/core/defaults.ts';
	import { formatDate } from '$lib/core/dates.ts';

	let storage = $derived(app.storageStatus);
</script>

<div class="page-head">
	<div>
		<h1>Privacy and backup</h1>
		<p>Where your data lives, and how to keep a copy.</p>
	</div>
</div>

<div class="prose">
	<section class="card card-pad" style="margin-bottom:1rem">
		<h2>Your data never leaves this browser</h2>
		<p>
			InvoiceNest stores your business profile, clients, items, invoices, quotations, payments and settings in this browser's
			<strong>localStorage</strong>. There is no account, no sign-in and no database. Nothing is uploaded, and no one else - including the people who built this app - can see your
			invoices.
		</p>
		<p>
			Two server routes exist and they are used only at the moment you press a button: one renders a PDF and one returns a CSV download. The document content is sent, turned into a file
			and immediately discarded. Nothing is logged or stored.
		</p>
		<p>There is no email sending, because there is no mail server. Use <strong>Copy summary</strong> or download the PDF and attach it in your own email or WhatsApp.</p>
	</section>

	<section class="card card-pad" style="margin-bottom:1rem">
		<h2>What that means for you</h2>
		<ul>
			<li><strong>Private by default.</strong> Your records stay on this device.</li>
			<li><strong>This browser only.</strong> Another browser, another device or another profile shows an empty workspace.</li>
			<li><strong>Clearing data deletes it.</strong> Clearing site data, "Reset browser", or some privacy cleaners will erase everything.</li>
			<li><strong>Private windows forget.</strong> Data stored in a private or incognito window disappears when it closes.</li>
			<li><strong>Space is limited.</strong> Browsers allow roughly 5 MB per site, which is why logos and signatures are compressed to under 150 KB.</li>
		</ul>
		<p><strong>So export a JSON backup regularly.</strong> It is the only copy that survives a cleared browser.</p>
	</section>

	<section class="card card-pad" style="margin-bottom:1rem">
		<h2>Backups</h2>
		<p>
			{#if app.data.lastBackupAt}
				Last backup: <strong>{formatDate(app.data.lastBackupAt.slice(0, 10), app.data.settings.dateFormat)}</strong>
				({app.backupAgeDays} days ago). A reminder banner appears after {BACKUP_REMINDER_DAYS} days.
			{:else}
				<strong>You have never exported a backup.</strong> A reminder banner appears while there is unsaved work and no backup.
			{/if}
		</p>
		<div class="btn-row">
			<button class="btn btn-primary" onclick={exportBackup}>Export JSON backup</button>
			<a class="btn" href="/settings#backup">Import a backup</a>
		</div>
	</section>

	<section class="card card-pad">
		<h2>Storage status</h2>
		<table>
			<tbody>
				<tr><td>Storage</td><td><strong>{storage.status === 'ready' ? 'Working normally (localStorage)' : storage.status === 'memory' ? 'Unavailable - this session only' : 'Error'}</strong></td></tr>
				<tr><td>Space used</td><td class="mono-num">{(storage.usedBytes / 1024).toFixed(1)} KB</td></tr>
				<tr><td>Documents</td><td class="mono-num">{app.data.docs.length}</td></tr>
				<tr><td>Clients</td><td class="mono-num">{app.data.clients.length}</td></tr>
				<tr><td>Payments</td><td class="mono-num">{app.data.payments.length}</td></tr>
			</tbody>
		</table>
		{#if storage.error}
			<p class="error-text" style="margin-top:.75rem">{storage.error}</p>
		{/if}
	</section>
</div>

<style>
	.prose {
		max-width: 76ch;
	}

	.prose h2 {
		margin-bottom: 0.6rem;
	}

	.prose ul {
		margin: 0 0 0.75rem;
		padding-left: 1.2rem;
		display: grid;
		gap: 0.3rem;
		font-size: 0.93rem;
	}

	.prose p {
		font-size: 0.93rem;
		color: var(--ink-soft);
	}

	.prose td {
		padding: 0.5rem 0.75rem 0.5rem 0;
	}
</style>
