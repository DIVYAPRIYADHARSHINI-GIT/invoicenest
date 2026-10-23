<script lang="ts">
	// Settings: business profile (with validation and logo upload), preferences,
	// numbering series, tax rates, backup/restore and sample data.
	import { untrack } from 'svelte';
	import { app } from '$lib/app.svelte.ts';
	import { exportBackup, importBackup } from '$lib/actions.ts';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { formatDate } from '$lib/core/dates.ts';
	import { newId, TEMPLATES } from '$lib/core/defaults.ts';
	import { compressImage, dataUrlBytes, MAX_LOGO_BYTES, MAX_SIGNATURE_EDGE } from '$lib/core/image.ts';
	import { pctToString, toPct } from '$lib/core/money.ts';
	import { pickableStates } from '$lib/core/states.ts';
	import type { CurrencyCode, DateFormat, TemplateId } from '$lib/core/types.ts';
	import {
		collect,
		validateAccent,
		validateAccountNumber,
		validateEmail,
		validateGstin,
		validateIfsc,
		validatePan,
		validatePhone,
		validateRequired,
		validateUpi
	} from '$lib/core/validate.ts';

	let profileErrors = $state<Record<string, string>>({});
	let logoBusy = $state(false);
	let logoNote = $state('');
	let confirmSample = $state(false);
	let confirmFresh = $state(false);
	let importInput = $state<HTMLInputElement | null>(null);
	let newRate = $state('');

	const p = () => app.data.profile;

	function setProfile<K extends keyof ReturnType<typeof p>>(key: K, value: ReturnType<typeof p>[K]) {
		app.commit((d) => {
			(d.profile[key] as unknown) = value;
		});
		validateProfile();
	}

	function setBank(key: keyof ReturnType<typeof p>['bank'], value: string) {
		app.commit((d) => {
			d.profile.bank[key] = value;
		});
		validateProfile();
	}

	function validateProfile() {
		const pr = app.data.profile;
		profileErrors = collect({
			name: validateRequired(pr.name, 'Business name'),
			state: validateRequired(pr.state, 'State'),
			email: validateEmail(pr.email),
			phone: validatePhone(pr.phone),
			gstin: validateGstin(pr.gstin, pr.state),
			pan: validatePan(pr.pan),
			ifsc: validateIfsc(pr.bank.ifsc),
			accountNumber: validateAccountNumber(pr.bank.accountNumber),
			upiId: validateUpi(pr.upiId),
			accent: validateAccent(app.data.settings.accent)
		});
	}

	async function uploadImage(file: File | null | undefined, kind: 'logo' | 'signature') {
		if (!file) return;
		logoBusy = true;
		logoNote = '';
		try {
			const res = kind === 'logo' ? await compressImage(file) : await compressImage(file, MAX_SIGNATURE_EDGE, MAX_LOGO_BYTES);
			app.commit((d) => {
				if (kind === 'logo') d.profile.logo = res.dataUrl;
				else d.profile.signature = res.dataUrl;
			});
			logoNote = `${kind === 'logo' ? 'Logo' : 'Signature'} saved at ${res.width}x${res.height}, ${(res.bytes / 1024).toFixed(0)} KB (limit ${Math.round(MAX_LOGO_BYTES / 1024)} KB).`;
		} catch (err) {
			app.toast((err as Error).message, 'error');
		} finally {
			logoBusy = false;
		}
	}

	function addTaxRate() {
		const bp = toPct(newRate);
		if (bp < 0 || !newRate.trim()) {
			app.toast('Enter a tax rate such as 12 or 0.5.', 'error');
			return;
		}
		if (app.data.settings.taxRates.some((t) => t.bp === bp)) {
			app.toast('That rate is already in the list.', 'error');
			return;
		}
		app.commit((d) => {
			d.settings.taxRates = [...d.settings.taxRates, { id: newId('tax'), bp, label: `${pctToString(bp)}%` }].sort((a, b) => a.bp - b.bp);
		}, `Added ${pctToString(bp)}%.`);
		newRate = '';
	}

	// Validate once after load. Untracked, because validateProfile writes
	// profileErrors while reading app.data - tracking both would loop.
	let validatedOnce = false;
	$effect(() => {
		if (!app.loaded || validatedOnce) return;
		validatedOnce = true;
		untrack(() => validateProfile());
	});

	let logoBytes = $derived(dataUrlBytes(app.data.profile.logo));
</script>

<div class="page-head">
	<div>
		<h1>Settings</h1>
		<p>Business profile, preferences, numbering, backups and sample data.</p>
	</div>
</div>

<!-- ---------- business profile ---------- -->
<section class="card" style="margin-bottom:1rem">
	<div class="card-head"><h2>Business profile</h2><span class="hint">Appears on every invoice and quotation</span></div>
	<div class="card-pad grid grid-2" style="gap:.85rem">
		<div class="field">
			<label for="p-name">Business name</label>
			<input id="p-name" value={p().name} aria-invalid={profileErrors.name ? 'true' : undefined} onchange={(e) => setProfile('name', e.currentTarget.value)} />
			{#if profileErrors.name}<span class="error-text">{profileErrors.name}</span>{/if}
		</div>
		<div class="field">
			<label for="p-state">State</label>
			<select id="p-state" value={p().state} aria-invalid={profileErrors.state ? 'true' : undefined} onchange={(e) => setProfile('state', e.currentTarget.value)}>
				<option value="">Select your state</option>
				{#each pickableStates() as s (s.code)}<option value={s.code}>{s.code} - {s.name}</option>{/each}
			</select>
			<span class="hint">This decides CGST + SGST versus IGST on every document.</span>
			{#if profileErrors.state}<span class="error-text">{profileErrors.state}</span>{/if}
		</div>
		<div class="field" style="grid-column:1/-1">
			<label for="p-address">Address</label>
			<textarea id="p-address" value={p().address} onchange={(e) => setProfile('address', e.currentTarget.value)}></textarea>
		</div>
		<div class="field">
			<label for="p-phone">Phone</label>
			<input id="p-phone" value={p().phone} aria-invalid={profileErrors.phone ? 'true' : undefined} onchange={(e) => setProfile('phone', e.currentTarget.value)} />
			{#if profileErrors.phone}<span class="error-text">{profileErrors.phone}</span>{/if}
		</div>
		<div class="field">
			<label for="p-email">Email</label>
			<input id="p-email" type="email" value={p().email} aria-invalid={profileErrors.email ? 'true' : undefined} onchange={(e) => setProfile('email', e.currentTarget.value)} />
			{#if profileErrors.email}<span class="error-text">{profileErrors.email}</span>{/if}
		</div>
		<div class="field">
			<label for="p-web">Website</label>
			<input id="p-web" value={p().website} onchange={(e) => setProfile('website', e.currentTarget.value)} />
		</div>
		<div class="field">
			<label for="p-gstin">GSTIN (optional)</label>
			<input
				id="p-gstin"
				class="num"
				value={p().gstin}
				placeholder="33AABCB1234C1Z5"
				aria-invalid={profileErrors.gstin ? 'true' : undefined}
				onchange={(e) => setProfile('gstin', e.currentTarget.value.trim().toUpperCase())}
			/>
			{#if profileErrors.gstin}<span class="error-text">{profileErrors.gstin}</span>{/if}
		</div>
		<div class="field">
			<label for="p-pan">PAN (optional)</label>
			<input id="p-pan" class="num" value={p().pan} placeholder="AABCB1234C" aria-invalid={profileErrors.pan ? 'true' : undefined} onchange={(e) => setProfile('pan', e.currentTarget.value.trim().toUpperCase())} />
			{#if profileErrors.pan}<span class="error-text">{profileErrors.pan}</span>{/if}
		</div>

		<div class="field" style="grid-column:1/-1">
			<span class="label">Logo and signature</span>
			<div class="img-row">
				<div>
					{#if p().logo}
						<img src={p().logo} alt="Current logo" class="img-prev" />
						<button class="btn btn-sm btn-ghost" onclick={() => setProfile('logo', '')}>Remove logo</button>
					{:else}
						<div class="img-prev placeholder">No logo</div>
					{/if}
					<input type="file" accept="image/*" disabled={logoBusy} aria-label="Upload logo" onchange={(e) => uploadImage(e.currentTarget.files?.[0], 'logo')} />
				</div>
				<div>
					{#if p().signature}
						<img src={p().signature} alt="Current signature" class="img-prev" />
						<button class="btn btn-sm btn-ghost" onclick={() => setProfile('signature', '')}>Remove signature</button>
					{:else}
						<div class="img-prev placeholder">No signature</div>
					{/if}
					<input type="file" accept="image/*" disabled={logoBusy} aria-label="Upload signature" onchange={(e) => uploadImage(e.currentTarget.files?.[0], 'signature')} />
				</div>
			</div>
			<span class="hint">
				Images are resized and compressed to under {Math.round(MAX_LOGO_BYTES / 1024)} KB because they are stored in this browser.
				{#if logoBytes}Current logo: {(logoBytes / 1024).toFixed(0)} KB.{/if}
			</span>
			{#if logoBusy}<span class="hint">Processing image...</span>{/if}
			{#if logoNote}<span class="hint">{logoNote}</span>{/if}
		</div>
	</div>
</section>

<!-- ---------- bank ---------- -->
<section class="card" style="margin-bottom:1rem">
	<div class="card-head"><h2>Bank and UPI</h2><span class="hint">Printed on invoices so clients can pay</span></div>
	<div class="card-pad grid grid-2" style="gap:.85rem">
		<div class="field">
			<label for="b-name">Account name</label>
			<input id="b-name" value={p().bank.accountName} onchange={(e) => setBank('accountName', e.currentTarget.value)} />
		</div>
		<div class="field">
			<label for="b-num">Account number</label>
			<input id="b-num" class="num" value={p().bank.accountNumber} aria-invalid={profileErrors.accountNumber ? 'true' : undefined} onchange={(e) => setBank('accountNumber', e.currentTarget.value.trim())} />
			{#if profileErrors.accountNumber}<span class="error-text">{profileErrors.accountNumber}</span>{/if}
		</div>
		<div class="field">
			<label for="b-ifsc">IFSC</label>
			<input id="b-ifsc" class="num" value={p().bank.ifsc} placeholder="HDFC0001234" aria-invalid={profileErrors.ifsc ? 'true' : undefined} onchange={(e) => setBank('ifsc', e.currentTarget.value.trim().toUpperCase())} />
			{#if profileErrors.ifsc}<span class="error-text">{profileErrors.ifsc}</span>{/if}
		</div>
		<div class="field">
			<label for="b-bank">Bank</label>
			<input id="b-bank" value={p().bank.bank} onchange={(e) => setBank('bank', e.currentTarget.value)} />
		</div>
		<div class="field">
			<label for="b-branch">Branch</label>
			<input id="b-branch" value={p().bank.branch} onchange={(e) => setBank('branch', e.currentTarget.value)} />
		</div>
		<div class="field">
			<label for="b-upi">UPI ID (optional)</label>
			<input id="b-upi" value={p().upiId} placeholder="name@bank" aria-invalid={profileErrors.upiId ? 'true' : undefined} onchange={(e) => setProfile('upiId', e.currentTarget.value.trim())} />
			<span class="hint">With a UPI ID, invoices show a payment QR generated in your browser.</span>
			{#if profileErrors.upiId}<span class="error-text">{profileErrors.upiId}</span>{/if}
		</div>
	</div>
</section>

<!-- ---------- preferences ---------- -->
<section class="card" style="margin-bottom:1rem">
	<div class="card-head"><h2>Preferences</h2></div>
	<div class="card-pad grid grid-3" style="gap:.85rem">
		<div class="field">
			<label for="s-currency">Currency</label>
			<select id="s-currency" value={app.data.settings.currency} onchange={(e) => app.commit((d) => (d.settings.currency = e.currentTarget.value as CurrencyCode))}>
				<option value="INR">INR - Indian rupee</option>
				<option value="USD">USD - US dollar</option>
				<option value="EUR">EUR - Euro</option>
				<option value="GBP">GBP - Pound sterling</option>
			</select>
		</div>
		<div class="field">
			<label for="s-datefmt">Date format</label>
			<select id="s-datefmt" value={app.data.settings.dateFormat} onchange={(e) => app.commit((d) => (d.settings.dateFormat = e.currentTarget.value as DateFormat))}>
				<option value="dd-mm-yyyy">31-03-2027</option>
				<option value="dd/mm/yyyy">31/03/2027</option>
				<option value="yyyy-mm-dd">2027-03-31</option>
				<option value="d-mmm-yyyy">31-Mar-2027</option>
			</select>
		</div>
		<div class="field">
			<label for="s-fy">Financial year starts</label>
			<select id="s-fy" value={String(app.data.settings.fyStartMonth)} onchange={(e) => app.commit((d) => (d.settings.fyStartMonth = Number(e.currentTarget.value)))}>
				{#each ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as m, i (m)}
					<option value={String(i + 1)}>{m}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="s-due">Default due days</label>
			<input id="s-due" class="num" type="number" min="0" max="365" value={app.data.settings.defaultDueDays} onchange={(e) => app.commit((d) => (d.settings.defaultDueDays = Math.max(0, Number(e.currentTarget.value) || 0)))} />
		</div>
		<div class="field">
			<label for="s-valid">Quotation valid days</label>
			<input id="s-valid" class="num" type="number" min="0" max="365" value={app.data.settings.defaultValidDays} onchange={(e) => app.commit((d) => (d.settings.defaultValidDays = Math.max(0, Number(e.currentTarget.value) || 0)))} />
		</div>
		<div class="field">
			<label for="s-theme">Theme</label>
			<select id="s-theme" value={app.data.settings.theme} onchange={(e) => app.commit((d) => (d.settings.theme = e.currentTarget.value as 'light' | 'dark' | 'system'))}>
				<option value="system">Match my system</option>
				<option value="light">Light</option>
				<option value="dark">Dark</option>
			</select>
		</div>
		<div class="field">
			<label for="s-template">Default template</label>
			<select id="s-template" value={app.data.settings.template} onchange={(e) => app.commit((d) => (d.settings.template = e.currentTarget.value as TemplateId))}>
				{#each TEMPLATES as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
			</select>
		</div>
		<div class="field">
			<label for="s-accent">Accent colour</label>
			<div style="display:flex;gap:.4rem;align-items:center">
				<input id="s-accent" type="color" value={app.data.settings.accent} style="width:52px;padding:4px" onchange={(e) => app.commit((d) => (d.settings.accent = e.currentTarget.value))} />
				<input class="num" value={app.data.settings.accent} aria-label="Accent colour hex" onchange={(e) => app.commit((d) => (d.settings.accent = e.currentTarget.value))} />
			</div>
			{#if profileErrors.accent}<span class="error-text">{profileErrors.accent}</span>{/if}
		</div>
		<div class="field">
			<span class="label">Pricing</span>
			<label class="checkbox">
				<input type="checkbox" checked={app.data.settings.taxInclusive} onchange={(e) => app.commit((d) => (d.settings.taxInclusive = e.currentTarget.checked))} />
				New documents use tax-inclusive rates
			</label>
		</div>
		<div class="field" style="grid-column:1/-1">
			<label for="s-notes">Default notes</label>
			<textarea id="s-notes" value={app.data.settings.defaultNotes} onchange={(e) => app.commit((d) => (d.settings.defaultNotes = e.currentTarget.value))}></textarea>
		</div>
		<div class="field" style="grid-column:1/-1">
			<label for="s-terms">Default terms</label>
			<textarea id="s-terms" value={app.data.settings.defaultTerms} onchange={(e) => app.commit((d) => (d.settings.defaultTerms = e.currentTarget.value))}></textarea>
		</div>
	</div>
</section>

<!-- ---------- numbering ---------- -->
<section class="card" style="margin-bottom:1rem">
	<div class="card-head"><h2>Numbering</h2><span class="hint">Counters restart in each new financial year</span></div>
	<div class="card-pad grid grid-2" style="gap:1rem">
		{#each [{ key: 'invoiceSeries', label: 'Invoices' }, { key: 'quotationSeries', label: 'Quotations' }] as series (series.key)}
			{@const s = app.data.settings[series.key as 'invoiceSeries']}
			<div class="grid" style="gap:.6rem">
				<strong>{series.label}</strong>
				<div class="field">
					<label for="n-prefix-{series.key}">Prefix</label>
					<input
						id="n-prefix-{series.key}"
						value={s.prefix}
						onchange={(e) => app.commit((d) => (d.settings[series.key as 'invoiceSeries'].prefix = e.currentTarget.value))}
					/>
				</div>
				<div class="field">
					<label for="n-pad-{series.key}">Padding</label>
					<input
						id="n-pad-{series.key}"
						class="num"
						type="number"
						min="1"
						max="8"
						value={s.padding}
						onchange={(e) => app.commit((d) => (d.settings[series.key as 'invoiceSeries'].padding = Math.min(8, Math.max(1, Number(e.currentTarget.value) || 4))))}
					/>
				</div>
				<label class="checkbox">
					<input
						type="checkbox"
						checked={s.useFy}
						onchange={(e) => app.commit((d) => (d.settings[series.key as 'invoiceSeries'].useFy = e.currentTarget.checked))}
					/>
					Include the financial year
				</label>
				<span class="hint">
					Next: <strong class="mono-num">{[s.prefix.trim(), s.useFy ? '2026-27' : '', String(1).padStart(s.padding, '0')].filter(Boolean).join('/')}</strong>
				</span>
			</div>
		{/each}
	</div>
</section>

<!-- ---------- tax rates ---------- -->
<section class="card" style="margin-bottom:1rem">
	<div class="card-head"><h2>Tax rates</h2><span class="hint">Shown in the tax dropdown on every line</span></div>
	<div class="card-pad">
		<div class="btn-row" style="margin-bottom:.75rem">
			{#each app.data.settings.taxRates as t (t.id)}
				<span class="rate-chip">
					{t.label}
					{#if app.data.settings.taxRates.length > 1}
						<button
							aria-label="Remove {t.label}"
							onclick={() => app.commit((d) => (d.settings.taxRates = d.settings.taxRates.filter((x) => x.id !== t.id)), `Removed ${t.label}.`)}>&times;</button
						>
					{/if}
				</span>
			{/each}
		</div>
		<div class="btn-row">
			<input class="num" inputmode="decimal" placeholder="12" bind:value={newRate} aria-label="New tax rate percentage" style="max-width:110px" />
			<button class="btn" onclick={addTaxRate}>Add rate</button>
			<span class="hint">Any rate works, including 0.5 or 28.</span>
		</div>
		<div class="field" style="max-width:220px;margin-top:.75rem">
			<label for="s-deftax">Default rate for new lines</label>
			<select id="s-deftax" value={String(app.data.settings.defaultTaxBp)} onchange={(e) => app.commit((d) => (d.settings.defaultTaxBp = Number(e.currentTarget.value)))}>
				{#each app.data.settings.taxRates as t (t.id)}<option value={String(t.bp)}>{t.label}</option>{/each}
			</select>
		</div>
	</div>
</section>

<!-- ---------- backup ---------- -->
<section class="card" style="margin-bottom:1rem" id="backup">
	<div class="card-head"><h2>Backup and restore</h2></div>
	<div class="card-pad">
		<p class="hint" style="margin-bottom:.75rem">
			Your data is stored only in this browser.
			{#if app.data.lastBackupAt}
				Last backup {formatDate(app.data.lastBackupAt.slice(0, 10), app.data.settings.dateFormat)} ({app.backupAgeDays} days ago).
			{:else}
				You have not exported a backup yet.
			{/if}
			<a href="/privacy">Read more about storage</a>.
		</p>
		<div class="btn-row">
			<button class="btn btn-primary" onclick={exportBackup}>Export JSON backup</button>
			<button class="btn" onclick={() => importInput?.click()}>Import a backup</button>
			<input
				bind:this={importInput}
				type="file"
				accept="application/json,.json"
				aria-label="Import a JSON backup file"
				style="display:none"
				onchange={async (e) => {
					const f = e.currentTarget.files?.[0];
					if (f) await importBackup(f);
					e.currentTarget.value = '';
				}}
			/>
		</div>
		<p class="hint" style="margin-top:.6rem">Importing replaces everything currently in this browser, so export first if you have unsaved work.</p>
	</div>
</section>

<!-- ---------- sample data ---------- -->
<section class="card" id="sample">
	<div class="card-head"><h2>Sample data</h2><span class="hint">Fictional business, clients and documents</span></div>
	<div class="card-pad">
		<p class="hint" style="margin-bottom:.75rem">
			The sample workspace is entirely fictional: "Bluebird Design Co." with an obviously sample GSTIN, a sample bank account and invented clients. Use it to explore every page, then
			start fresh when you are ready to bill for real.
		</p>
		<div class="btn-row">
			<button class="btn" onclick={() => (confirmSample = true)}>Load sample data</button>
			<button class="btn btn-danger" onclick={() => (confirmFresh = true)}>Start fresh</button>
		</div>
	</div>
</section>

<ConfirmDialog
	bind:open={confirmSample}
	title="Load the sample workspace?"
	message="This replaces everything currently in this browser with the fictional Bluebird Design Co. data. Export a backup first if you need your current records."
	confirmLabel="Load sample data"
	onconfirm={() => app.loadSample()}
	oncancel={() => {}}
/>

<ConfirmDialog
	bind:open={confirmFresh}
	title="Delete everything and start fresh?"
	message="Your business profile, clients, items, documents and payments will be erased from this browser. This cannot be undone."
	confirmLabel="Delete everything"
	danger
	onconfirm={() => app.startFresh()}
	oncancel={() => {}}
/>

<style>
	.img-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	@media (max-width: 640px) {
		.img-row {
			grid-template-columns: 1fr;
		}
	}

	.img-prev {
		display: block;
		max-width: 160px;
		max-height: 60px;
		object-fit: contain;
		margin-bottom: 0.4rem;
	}

	.placeholder {
		display: grid;
		place-items: center;
		width: 160px;
		height: 60px;
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-sm);
		color: var(--muted);
		font-size: 0.8rem;
	}

	.rate-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
	}

	.rate-chip button {
		background: none;
		border: none;
		color: var(--muted);
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		padding: 0 0.1rem;
		min-width: 22px;
		min-height: 22px;
	}

	.rate-chip button:hover {
		color: var(--bad);
	}
</style>
