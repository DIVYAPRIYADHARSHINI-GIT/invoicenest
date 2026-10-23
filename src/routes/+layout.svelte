<script lang="ts">
	import '../app.css';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { app } from '$lib/app.svelte.ts';
	import { BACKUP_REMINDER_DAYS } from '$lib/core/defaults.ts';
	import NestLogo from '$lib/components/NestLogo.svelte';
	import Toasts from '$lib/components/Toasts.svelte';

	let { children } = $props();

	// Load from localStorage once, on the client. `untrack` is essential: load()
	// reads and writes app.data (and may generate recurring drafts), which would
	// otherwise re-trigger this effect in a loop.
	$effect(() => {
		untrack(() => app.load());
	});

	// Keep the document theme in sync with the setting.
	$effect(() => {
		const pref = app.data.settings.theme;
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const apply = () => {
			const dark = pref === 'dark' || (pref === 'system' && mq.matches);
			document.documentElement.dataset.theme = dark ? 'dark' : 'light';
		};
		apply();
		if (pref === 'system') {
			mq.addEventListener('change', apply);
			return () => mq.removeEventListener('change', apply);
		}
	});

	const nav = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/invoices', label: 'Invoices' },
		{ href: '/quotations', label: 'Quotations' },
		{ href: '/clients', label: 'Clients' },
		{ href: '/items', label: 'Items' },
		{ href: '/payments', label: 'Payments' },
		{ href: '/reports', label: 'Reports' },
		{ href: '/recurring', label: 'Recurring' },
		{ href: '/settings', label: 'Settings' }
	];

	const counts: Record<string, () => string> = {
		'/invoices': () => String(app.data.docs.filter((d) => d.type === 'invoice').length || ''),
		'/quotations': () => String(app.data.docs.filter((d) => d.type === 'quotation').length || ''),
		'/clients': () => String(app.data.clients.length || ''),
		'/items': () => String(app.data.items.length || ''),
		'/payments': () => String(app.data.payments.length || '')
	};

	const isActive = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));

	let backupBanner = $derived(app.loaded && app.backupOverdue && app.data.docs.length > 0);
	let recurringNotice = $derived(app.recurringNotice);
</script>

<svelte:head>
	<title>InvoiceNest - Bill right. Get paid.</title>
</svelte:head>

<div class="app-shell">
	<aside class="sidebar no-print">
		<a href="/" class="brand">
			<NestLogo size={30} light />
			<span>
				<span class="brand-name">InvoiceNest</span><br />
				<span class="brand-tag">Bill right. Get paid.</span>
			</span>
		</a>
		<nav aria-label="Main">
			{#each nav as item (item.href)}
				<a href={item.href} class="nav-link" aria-current={isActive(item.href) ? 'page' : undefined}>
					<span>{item.label}</span>
					{#if counts[item.href]?.()}<span class="count">{counts[item.href]()}</span>{/if}
				</a>
			{/each}
		</nav>
		<div class="sidebar-foot">
			<p style="margin:0 0 .35rem">Data is stored only in this browser.</p>
			<a href="/privacy" style="color:#9fa9c7">Privacy and backup</a>
		</div>
	</aside>

	<div class="main">
		<header class="topbar no-print">
			<a class="badge-storage" href="/privacy" title="How your data is stored">
				<span aria-hidden="true">&#9679;</span>
				Data is stored only in this browser
			</a>
			<div style="margin-left:auto" class="btn-row">
				<a class="btn btn-sm" href="/settings#backup">Backup</a>
				<a class="btn btn-sm btn-primary" href="/documents/new?type=invoice">New invoice</a>
			</div>
		</header>

		<main class="content" id="main">
			{#if backupBanner}
				<div class="banner banner-warn">
					<div>
						<strong>Time for a backup.</strong>
						{#if app.backupAgeDays === null}
							You have never exported a backup. Your data lives only in this browser - export a JSON backup to keep it safe.
						{:else}
							Your last backup was {app.backupAgeDays} days ago (reminder after {BACKUP_REMINDER_DAYS} days).
						{/if}
						<a href="/settings#backup">Export a backup now</a>.
					</div>
				</div>
			{/if}

			{#if app.storageNote}
				<div class="banner banner-bad">
					<div><strong>Storage problem.</strong> {app.storageNote}</div>
				</div>
			{/if}

			{#if recurringNotice.count > 0}
				<div class="banner banner-info">
					<div>
						<strong>{recurringNotice.count} recurring {recurringNotice.count === 1 ? 'invoice was' : 'invoices were'} created as drafts:</strong>
						{recurringNotice.numbers.join(', ')}.
						<a href="/invoices">Review drafts</a>.
						<button class="btn btn-sm btn-ghost" onclick={() => (app.recurringNotice = { count: 0, numbers: [] })}>Dismiss</button>
					</div>
				</div>
			{/if}

			{@render children()}
		</main>
	</div>
</div>

<nav class="tabbar no-print" aria-label="Primary">
	<a href="/" class="tab" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Home</a>
	<a href="/invoices" class="tab" aria-current={isActive('/invoices') ? 'page' : undefined}>Invoices</a>
	<a href="/documents/new?type=invoice" class="tab-new" aria-label="New invoice">+</a>
	<a href="/payments" class="tab" aria-current={isActive('/payments') ? 'page' : undefined}>Payments</a>
	<a href="/settings" class="tab" aria-current={isActive('/settings') ? 'page' : undefined}>More</a>
</nav>

<Toasts />
