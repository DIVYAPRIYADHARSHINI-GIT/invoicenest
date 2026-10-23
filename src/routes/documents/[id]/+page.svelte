<script lang="ts">
	// The document editor - the hero screen.
	// Form on the left, live preview on the right (stacked with a toggle on mobile),
	// sticky totals bar, inline tax summary. Every edit recomputes through the same
	// integer-paise engine that the PDF uses.
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { app } from '$lib/app.svelte.ts';
	import { copyDocSummary, downloadPdf } from '$lib/actions.ts';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import DocPreview from '$lib/components/DocPreview.svelte';
	import Money from '$lib/components/Money.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { addDays, formatDate, today } from '$lib/core/dates.ts';
	import { blankLine, newId, PAYMENT_MODES, TEMPLATES, UNITS } from '$lib/core/defaults.ts';
	import { formatAmount, paiseToDecimal, pctToString, qtyToString, toPaise, toPct, toQty } from '$lib/core/money.ts';
	import { viewDoc } from '$lib/core/select.ts';
	import { allowedTransitions, canEdit, checkPayment, STATUS_LABEL } from '$lib/core/status.ts';
	import { pickableStates, stateName } from '$lib/core/states.ts';
	import type { DiscountKind, InvoiceDoc, PaymentMode } from '$lib/core/types.ts';
	import { buildRenderDoc } from '$lib/doc/model.ts';

	let docId = $derived(page.params.id ?? '');
	let doc = $derived(app.data.docs.find((d) => d.id === docId) ?? null);
	let view = $derived(doc ? viewDoc($state.snapshot(app.data), doc) : null);
	let editable = $derived(doc && view ? canEdit(doc, view.paid) : false);
	let editing = $state(false);
	let showPreview = $state(false);
	let numberError = $state('');

	// Start in edit mode when asked (a fresh draft) and allowed. Runs once: the
	// guard stops the write to `editing` from re-triggering the effect.
	let autoEditApplied = false;
	$effect(() => {
		if (autoEditApplied || !app.loaded) return;
		if (page.url.searchParams.get('edit') !== '1') return;
		if (!untrack(() => editable)) return;
		autoEditApplied = true;
		editing = true;
	});

	let render = $derived(view ? buildRenderDoc($state.snapshot(app.data), view) : null);
	let isQuotation = $derived(doc?.type === 'quotation');

	// ---- mutation helpers (each one commits to localStorage) ----
	function patch(fn: (d: InvoiceDoc) => void, message?: string) {
		app.commit((data) => {
			const target = data.docs.find((x) => x.id === docId);
			if (!target) return;
			fn(target);
			target.updatedAt = new Date().toISOString();
		}, message);
	}

	function setNumber(value: string) {
		const trimmed = value.trim();
		const clash = app.data.docs.some((d) => d.id !== docId && d.number.trim().toLowerCase() === trimmed.toLowerCase());
		if (!trimmed) {
			numberError = 'A document number is required.';
			return;
		}
		if (clash) {
			numberError = 'That number is already used by another document.';
			return;
		}
		numberError = '';
		patch((d) => {
			d.number = trimmed;
		});
	}

	const addLine = () => patch((d) => d.lines.push(blankLine(app.data.settings.defaultTaxBp)));
	const removeLine = (id: string) =>
		patch((d) => {
			d.lines = d.lines.filter((l) => l.id !== id);
			if (d.lines.length === 0) d.lines.push(blankLine(app.data.settings.defaultTaxBp));
		});
	const duplicateLine = (id: string) =>
		patch((d) => {
			const i = d.lines.findIndex((l) => l.id === id);
			if (i >= 0) d.lines.splice(i + 1, 0, { ...d.lines[i], id: newId('line') });
		});
	const moveLine = (id: string, dir: -1 | 1) =>
		patch((d) => {
			const i = d.lines.findIndex((l) => l.id === id);
			const j = i + dir;
			if (i < 0 || j < 0 || j >= d.lines.length) return;
			[d.lines[i], d.lines[j]] = [d.lines[j], d.lines[i]];
		});

	function pickCatalogueItem(lineId: string, itemId: string) {
		const item = app.data.items.find((i) => i.id === itemId);
		if (!item) return;
		patch((d) => {
			const l = d.lines.find((x) => x.id === lineId);
			if (!l) return;
			l.description = item.name + (item.description ? `\n${item.description}` : '');
			l.hsn = item.hsn;
			l.unit = item.unit;
			l.rate = item.rate;
			l.taxBp = item.taxBp;
		});
	}

	const addCharge = () => patch((d) => d.charges.push({ id: newId('ch'), label: 'Shipping', amount: 0, taxBp: app.data.settings.defaultTaxBp }));
	const removeCharge = (id: string) => patch((d) => (d.charges = d.charges.filter((c) => c.id !== id)));

	// ---- client inline add ----
	let newClientName = $state('');
	let newClientState = $state('');
	function addClientInline() {
		const name = newClientName.trim();
		if (!name) return;
		const id = newId('cl');
		app.commit((d) => {
			d.clients.push({
				id,
				name,
				company: name,
				email: '',
				phone: '',
				address: '',
				state: newClientState || d.profile.state,
				gstin: '',
				notes: '',
				createdAt: new Date().toISOString()
			});
			const target = d.docs.find((x) => x.id === docId);
			if (target) {
				target.clientId = id;
				target.placeOfSupply = newClientState || d.profile.state;
			}
		}, `Added client ${name}.`);
		newClientName = '';
		newClientState = '';
	}

	function selectClient(id: string) {
		const client = app.data.clients.find((c) => c.id === id);
		patch((d) => {
			d.clientId = id;
			if (client?.state) d.placeOfSupply = client.state;
		});
	}

	// ---- payments ----
	let payAmount = $state('');
	let payDate = $state(today());
	let payMode = $state<PaymentMode>('upi');
	let payRef = $state('');
	let advanceConfirm = $state(false);
	let payError = $state('');

	function recordPayment() {
		if (!view) return;
		const paise = toPaise(payAmount);
		const check = checkPayment(paise, view.balance, advanceConfirm);
		if (!check.ok) {
			payError = check.error ?? 'Could not record that payment.';
			return;
		}
		payError = '';
		app.commit((d) => {
			d.payments.push({
				id: newId('pm'),
				invoiceId: docId,
				amount: paise,
				date: payDate,
				mode: payMode,
				reference: payRef.trim(),
				createdAt: new Date().toISOString()
			});
			const target = d.docs.find((x) => x.id === docId);
			// Leaving a draft when money arrives keeps the status model honest.
			if (target && target.status === 'draft') target.status = 'sent';
		}, 'Payment recorded.');
		payAmount = '';
		payRef = '';
		advanceConfirm = false;
		editing = false;
	}

	function deletePayment(id: string) {
		app.commit((d) => (d.payments = d.payments.filter((p) => p.id !== id)), 'Payment removed.');
	}

	// ---- actions ----
	let confirmCancel = $state(false);
	let confirmDelete = $state(false);

	function convertToInvoice() {
		if (!doc) return;
		goto(`/documents/new?type=invoice&convert=${doc.id}`);
	}

	function duplicateDoc() {
		if (!doc) return;
		goto(`/documents/new?type=${doc.type}&from=${doc.id}`);
	}

	function cancelDoc() {
		patch((d) => {
			d.status = 'cancelled';
		}, 'Document cancelled.');
	}

	function deleteDoc() {
		app.commit((d) => {
			d.docs = d.docs.filter((x) => x.id !== docId);
			d.payments = d.payments.filter((p) => p.invoiceId !== docId);
		}, 'Document deleted.');
		goto(isQuotation ? '/quotations' : '/invoices');
	}

	let payments = $derived(app.data.payments.filter((p) => p.invoiceId === docId).sort((a, b) => a.date.localeCompare(b.date)));
	let taxRates = $derived(app.data.settings.taxRates);
</script>

{#if !app.loaded}
	<div class="card card-pad"><div class="skeleton" style="height:200px"></div></div>
{:else if !doc || !view || !render}
	<div class="card empty">
		<h3>Document not found</h3>
		<p>It may have been deleted, or this browser does not have it stored.</p>
		<a class="btn btn-primary" href="/invoices">Back to invoices</a>
	</div>
{:else}
	<div class="page-head">
		<div>
			<h1 style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">
				{doc.number}
				<StatusPill status={view.status} />
			</h1>
			<p>
				{isQuotation ? 'Quotation' : 'Tax invoice'} &middot; {formatDate(doc.date, app.data.settings.dateFormat)}
				{#if doc.convertedFromId}
					&middot; converted from
					<a href="/documents/{doc.convertedFromId}">{app.data.docs.find((d) => d.id === doc.convertedFromId)?.number ?? 'quotation'}</a>
				{/if}
				{#if doc.convertedToId}
					&middot; converted to
					<a href="/documents/{doc.convertedToId}">{app.data.docs.find((d) => d.id === doc.convertedToId)?.number ?? 'invoice'}</a>
				{/if}
			</p>
		</div>
		<div class="btn-row no-print">
			{#if editable}
				<button class="btn" onclick={() => (editing = !editing)} aria-pressed={editing}>{editing ? 'Done editing' : 'Edit'}</button>
			{/if}
			<button class="btn" onclick={() => copyDocSummary(view)}>Copy summary</button>
			<a class="btn" href="/documents/{doc.id}/print">Print view</a>
			<button class="btn btn-primary" onclick={() => downloadPdf(view)}>Download PDF</button>
		</div>
	</div>

	{#if !editable}
		<div class="banner banner-info">
			<div>
				{#if doc.status === 'cancelled'}
					<strong>This document is cancelled.</strong> Cancelled documents are kept for your records and excluded from every total.
				{:else}
					<strong>This invoice has a recorded payment, so it can no longer be edited.</strong>
					You can still record more payments, download the PDF, or cancel it. Cancel and reissue if the amounts were wrong.
				{/if}
			</div>
		</div>
	{/if}

	{#if numberError}
		<div class="banner banner-bad"><div>{numberError}</div></div>
	{/if}

	<div class="only-mobile no-print" style="margin-bottom:.75rem">
		<div class="btn-row">
			<button class="btn btn-sm" onclick={() => (showPreview = false)} aria-pressed={!showPreview}>Form</button>
			<button class="btn btn-sm" onclick={() => (showPreview = true)} aria-pressed={showPreview}>Preview</button>
		</div>
	</div>

	<div class="editor-grid">
		<div class="col-form" class:hide-mobile={showPreview}>
			<!-- ---------- details ---------- -->
			<section class="card" style="margin-bottom:1rem">
				<div class="card-head"><h2>Details</h2></div>
				<div class="card-pad grid grid-2" style="gap:.85rem">
					<div class="field">
						<label for="f-number">{isQuotation ? 'Quotation' : 'Invoice'} number</label>
						<input
							id="f-number"
							value={doc.number}
							class="num"
							disabled={!editing || view.paid > 0}
							aria-invalid={numberError ? 'true' : undefined}
							onchange={(e) => setNumber(e.currentTarget.value)}
						/>
						<span class="hint">{editing && view.paid === 0 ? 'Editable until a payment is recorded.' : 'Locked.'}</span>
					</div>
					<div class="field">
						<label for="f-date">Date</label>
						<input id="f-date" type="date" value={doc.date} disabled={!editing} onchange={(e) => patch((d) => (d.date = e.currentTarget.value))} />
					</div>
					<div class="field">
						<label for="f-due">{isQuotation ? 'Valid until' : 'Due date'}</label>
						<input id="f-due" type="date" value={doc.dueDate} disabled={!editing} onchange={(e) => patch((d) => (d.dueDate = e.currentTarget.value))} />
						{#if editing}
							<span class="hint">
								<button class="btn btn-sm btn-ghost" onclick={() => patch((d) => (d.dueDate = addDays(d.date, isQuotation ? app.data.settings.defaultValidDays : app.data.settings.defaultDueDays)))}>
									Reset to default ({isQuotation ? app.data.settings.defaultValidDays : app.data.settings.defaultDueDays} days)
								</button>
							</span>
						{/if}
					</div>
					<div class="field">
						<label for="f-ref">Reference / PO number</label>
						<input id="f-ref" value={doc.reference} disabled={!editing} onchange={(e) => patch((d) => (d.reference = e.currentTarget.value))} />
					</div>
					<div class="field">
						<label for="f-client">Client</label>
						<select id="f-client" value={doc.clientId} disabled={!editing} onchange={(e) => selectClient(e.currentTarget.value)}>
							<option value="">Select a client</option>
							{#each app.data.clients as c (c.id)}
								<option value={c.id}>{c.company || c.name}</option>
							{/each}
						</select>
					</div>
					<div class="field">
						<label for="f-pos">Place of supply</label>
						<select id="f-pos" value={doc.placeOfSupply} disabled={!editing} onchange={(e) => patch((d) => (d.placeOfSupply = e.currentTarget.value))}>
							<option value="">Select a state</option>
							{#each pickableStates() as s (s.code)}
								<option value={s.code}>{s.code} - {s.name}</option>
							{/each}
						</select>
						<span class="hint">
							{view.totals.interState ? 'Different from your state, so IGST applies.' : 'Same as your state, so CGST + SGST apply.'}
						</span>
					</div>
					{#if editing && app.data.clients.length === 0}
						<div class="field" style="grid-column:1/-1">
							<span class="label">Add a client quickly</span>
							<div class="btn-row">
								<input placeholder="Client or company name" bind:value={newClientName} style="flex:1;min-width:160px" />
								<select bind:value={newClientState} style="width:auto;min-width:140px" aria-label="Client state">
									<option value="">Same as your state</option>
									{#each pickableStates() as s (s.code)}
										<option value={s.code}>{s.code} - {s.name}</option>
									{/each}
								</select>
								<button class="btn" onclick={addClientInline} disabled={!newClientName.trim()}>Add</button>
							</div>
						</div>
					{/if}
				</div>
			</section>

			<!-- ---------- line items ---------- -->
			<section class="card" style="margin-bottom:1rem">
				<div class="card-head">
					<h2>Line items</h2>
					<label class="checkbox">
						<input type="checkbox" checked={doc.taxInclusive} disabled={!editing} onchange={(e) => patch((d) => (d.taxInclusive = e.currentTarget.checked))} />
						Rates include GST
					</label>
				</div>
				<div class="lines">
					{#each doc.lines as l, i (l.id)}
						{@const r = view.totals.lines[i]}
						<div class="line">
							<div class="line-top">
								<span class="line-no">{i + 1}</span>
								<textarea
									aria-label="Description for line {i + 1}"
									rows="2"
									value={l.description}
									disabled={!editing}
									placeholder="Description of goods or services"
									onchange={(e) => patch((d) => (d.lines[i].description = e.currentTarget.value))}
								></textarea>
								{#if editing}
									<div class="line-tools">
										<button class="btn btn-sm btn-ghost" onclick={() => moveLine(l.id, -1)} disabled={i === 0} aria-label="Move line {i + 1} up">&uarr;</button>
										<button class="btn btn-sm btn-ghost" onclick={() => moveLine(l.id, 1)} disabled={i === doc.lines.length - 1} aria-label="Move line {i + 1} down">&darr;</button>
										<button class="btn btn-sm btn-ghost" onclick={() => duplicateLine(l.id)} aria-label="Duplicate line {i + 1}">Copy</button>
										<button class="btn btn-sm btn-ghost" onclick={() => removeLine(l.id)} aria-label="Remove line {i + 1}">Remove</button>
									</div>
								{/if}
							</div>
							<div class="line-fields">
								{#if editing && app.data.items.length}
									<div class="field">
										<label for="pick-{l.id}">From catalogue</label>
										<select id="pick-{l.id}" value="" onchange={(e) => pickCatalogueItem(l.id, e.currentTarget.value)}>
											<option value="">Pick an item</option>
											{#each app.data.items as it (it.id)}
												<option value={it.id}>{it.name}</option>
											{/each}
										</select>
									</div>
								{/if}
								<div class="field">
									<label for="hsn-{l.id}">HSN/SAC</label>
									<input id="hsn-{l.id}" value={l.hsn} disabled={!editing} onchange={(e) => patch((d) => (d.lines[i].hsn = e.currentTarget.value))} />
								</div>
								<div class="field">
									<label for="qty-{l.id}">Qty</label>
									<input id="qty-{l.id}" class="num" inputmode="decimal" value={qtyToString(l.qty)} disabled={!editing} onchange={(e) => patch((d) => (d.lines[i].qty = toQty(e.currentTarget.value)))} />
								</div>
								<div class="field">
									<label for="unit-{l.id}">Unit</label>
									<select id="unit-{l.id}" value={l.unit} disabled={!editing} onchange={(e) => patch((d) => (d.lines[i].unit = e.currentTarget.value))}>
										{#each UNITS as u (u)}<option value={u}>{u}</option>{/each}
									</select>
								</div>
								<div class="field">
									<label for="rate-{l.id}">Rate</label>
									<input id="rate-{l.id}" class="num" inputmode="decimal" value={paiseToDecimal(l.rate)} disabled={!editing} onchange={(e) => patch((d) => (d.lines[i].rate = toPaise(e.currentTarget.value)))} />
								</div>
								<div class="field">
									<label for="disc-{l.id}">Discount</label>
									<div style="display:flex;gap:.3rem">
										<input
											id="disc-{l.id}"
											class="num"
											inputmode="decimal"
											value={l.discountKind === 'percent' ? pctToString(l.discountValue) : paiseToDecimal(l.discountValue)}
											disabled={!editing}
											onchange={(e) =>
												patch((d) => {
													const raw = e.currentTarget.value;
													d.lines[i].discountValue = d.lines[i].discountKind === 'percent' ? toPct(raw) : toPaise(raw);
												})}
										/>
										<select
											aria-label="Discount type for line {i + 1}"
											value={l.discountKind}
											disabled={!editing}
											style="width:auto;min-width:62px"
											onchange={(e) =>
												patch((d) => {
													d.lines[i].discountKind = e.currentTarget.value as DiscountKind;
													d.lines[i].discountValue = 0;
												})}
										>
											<option value="percent">%</option>
											<option value="amount">{app.data.settings.currency === 'INR' ? '\u20B9' : 'amt'}</option>
										</select>
									</div>
								</div>
								<div class="field">
									<label for="tax-{l.id}">Tax rate</label>
									<select id="tax-{l.id}" value={String(l.taxBp)} disabled={!editing} onchange={(e) => patch((d) => (d.lines[i].taxBp = Number(e.currentTarget.value)))}>
										{#each taxRates as t (t.id)}<option value={String(t.bp)}>{t.label}</option>{/each}
										{#if !taxRates.some((t) => t.bp === l.taxBp)}
											<option value={String(l.taxBp)}>{pctToString(l.taxBp)}%</option>
										{/if}
									</select>
								</div>
								<div class="field line-total">
									<span class="label">Line total</span>
									<strong class="mono-num"><Money paise={r ? r.taxable + r.tax : 0} /></strong>
									{#if r && r.discount}<span class="hint">after {formatAmount(r.discount, app.data.settings.currency)} discount</span>{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
				{#if editing}
					<div class="card-pad btn-row" style="border-top:1px solid var(--border)">
						<button class="btn" onclick={addLine}>Add line</button>
						<button class="btn" onclick={addCharge}>Add charge</button>
					</div>
				{/if}
			</section>

			<!-- ---------- charges ---------- -->
			{#if doc.charges.length}
				<section class="card" style="margin-bottom:1rem">
					<div class="card-head"><h2>Extra charges</h2></div>
					<div class="card-pad grid" style="gap:.6rem">
						{#each doc.charges as c, ci (c.id)}
							<div class="charge-row">
								<input aria-label="Charge label" value={c.label} disabled={!editing} onchange={(e) => patch((d) => (d.charges[ci].label = e.currentTarget.value))} />
								<input aria-label="Charge amount" class="num" inputmode="decimal" value={paiseToDecimal(c.amount)} disabled={!editing} onchange={(e) => patch((d) => (d.charges[ci].amount = toPaise(e.currentTarget.value)))} />
								<select aria-label="Charge tax rate" value={String(c.taxBp)} disabled={!editing} onchange={(e) => patch((d) => (d.charges[ci].taxBp = Number(e.currentTarget.value)))}>
									{#each taxRates as t (t.id)}<option value={String(t.bp)}>{t.label}</option>{/each}
								</select>
								{#if editing}<button class="btn btn-sm btn-ghost" onclick={() => removeCharge(c.id)}>Remove</button>{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- ---------- notes, terms, template ---------- -->
			<section class="card" style="margin-bottom:1rem">
				<div class="card-head"><h2>Notes, terms and template</h2></div>
				<div class="card-pad grid grid-2" style="gap:.85rem">
					<div class="field">
						<label for="f-notes">Notes</label>
						<textarea id="f-notes" value={doc.notes} disabled={!editing} onchange={(e) => patch((d) => (d.notes = e.currentTarget.value))}></textarea>
					</div>
					<div class="field">
						<label for="f-terms">Terms and conditions</label>
						<textarea id="f-terms" value={doc.terms} disabled={!editing} onchange={(e) => patch((d) => (d.terms = e.currentTarget.value))}></textarea>
					</div>
					<div class="field">
						<label for="f-template">Template</label>
						<select id="f-template" value={doc.template} onchange={(e) => patch((d) => (d.template = e.currentTarget.value as InvoiceDoc['template']))}>
							{#each TEMPLATES as t (t.id)}<option value={t.id}>{t.label} - {t.hint}</option>{/each}
						</select>
					</div>
					<div class="field">
						<span class="label">Options</span>
						<label class="checkbox">
							<input type="checkbox" checked={doc.roundOff} disabled={!editing} onchange={(e) => patch((d) => (d.roundOff = e.currentTarget.checked))} />
							Round off to the nearest rupee
						</label>
					</div>
					<div class="field" style="grid-column:1/-1">
						<span class="label">Status</span>
						<div class="btn-row">
							{#each allowedTransitions(doc, view.paid) as s (s)}
								<button class="btn btn-sm" onclick={() => patch((d) => (d.status = s as InvoiceDoc['status']), `Marked as ${STATUS_LABEL[s as 'sent']}.`)}>
									Mark as {STATUS_LABEL[s as 'sent']}
								</button>
							{/each}
							{#if allowedTransitions(doc, view.paid).length === 0}
								<span class="hint">No further status changes are possible for this document.</span>
							{/if}
						</div>
					</div>
				</div>
			</section>

			<!-- ---------- payments ---------- -->
			{#if !isQuotation}
				<section class="card" style="margin-bottom:1rem" id="payments">
					<div class="card-head">
						<h2>Payments</h2>
						<span class="hint">Balance due <Money paise={view.balance} /></span>
					</div>
					{#if payments.length}
						<div class="table-wrap">
							<table>
								<thead><tr><th scope="col">Date</th><th scope="col">Mode</th><th scope="col">Reference</th><th scope="col" class="num">Amount</th><th scope="col"></th></tr></thead>
								<tbody>
									{#each payments as p (p.id)}
										<tr>
											<td>{formatDate(p.date, app.data.settings.dateFormat)}</td>
											<td>{PAYMENT_MODES.find((m) => m.id === p.mode)?.label ?? p.mode}</td>
											<td>{p.reference || '-'}</td>
											<td class="num"><Money paise={p.amount} /></td>
											<td><button class="btn btn-sm btn-ghost" onclick={() => deletePayment(p.id)}>Remove</button></td>
										</tr>
									{/each}
								</tbody>
								<tfoot>
									<tr><td colspan="3">Total received</td><td class="num"><Money paise={view.paid} /></td><td></td></tr>
								</tfoot>
							</table>
						</div>
					{/if}
					{#if doc.status !== 'cancelled'}
						<div class="card-pad" style="border-top:1px solid var(--border)">
							<div class="pay-row">
								<div class="field">
									<label for="pay-amt">Amount</label>
									<input id="pay-amt" class="num" inputmode="decimal" bind:value={payAmount} placeholder={paiseToDecimal(view.balance)} />
								</div>
								<div class="field">
									<label for="pay-date">Date</label>
									<input id="pay-date" type="date" bind:value={payDate} />
								</div>
								<div class="field">
									<label for="pay-mode">Mode</label>
									<select id="pay-mode" bind:value={payMode}>
										{#each PAYMENT_MODES as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
									</select>
								</div>
								<div class="field">
									<label for="pay-ref">Reference</label>
									<input id="pay-ref" bind:value={payRef} placeholder="UTR, cheque no." />
								</div>
								<button class="btn btn-primary" onclick={recordPayment}>Record payment</button>
							</div>
							{#if payError}
								<p class="error-text" style="margin-top:.5rem">{payError}</p>
								{#if checkPayment(toPaise(payAmount), view.balance).needsAdvanceConfirm}
									<label class="checkbox">
										<input type="checkbox" bind:checked={advanceConfirm} />
										Yes, record this as an advance above the balance due
									</label>
								{/if}
							{/if}
						</div>
					{/if}
				</section>
			{/if}

			<div class="btn-row no-print" style="margin-bottom:1rem">
				{#if isQuotation && doc.status !== 'cancelled' && !doc.convertedToId}
					<button class="btn btn-primary" onclick={convertToInvoice}>Convert to invoice</button>
				{/if}
				<button class="btn" onclick={duplicateDoc}>Duplicate</button>
				{#if doc.status !== 'cancelled'}
					<button class="btn btn-danger" onclick={() => (confirmCancel = true)}>Cancel document</button>
				{/if}
				{#if view.paid === 0}
					<button class="btn btn-danger" onclick={() => (confirmDelete = true)}>Delete</button>
				{/if}
			</div>
		</div>

		<!-- ---------- live preview ---------- -->
		<div class="col-preview" class:hide-mobile={!showPreview}>
			<div class="preview-sticky">
				<div class="preview-label no-print">
					<span class="section-cap">Live preview</span>
					<span class="hint">This is exactly what the PDF prints.</span>
				</div>
				<DocPreview doc={render} showQr={!isQuotation && Boolean(render.upi)} />
			</div>
		</div>
	</div>

	<!-- ---------- sticky totals bar ---------- -->
	<div class="totals-bar no-print" role="status" aria-live="polite">
		<div class="tb-group">
			<span class="tb-label">Taxable</span>
			<span class="tb-value"><Money paise={view.totals.taxableTotal} /></span>
		</div>
		{#if view.totals.interState}
			<div class="tb-group"><span class="tb-label">IGST</span><span class="tb-value"><Money paise={view.totals.igstTotal} /></span></div>
		{:else}
			<div class="tb-group"><span class="tb-label">CGST</span><span class="tb-value"><Money paise={view.totals.cgstTotal} /></span></div>
			<div class="tb-group"><span class="tb-label">SGST</span><span class="tb-value"><Money paise={view.totals.sgstTotal} /></span></div>
		{/if}
		{#if view.totals.roundOff}
			<div class="tb-group"><span class="tb-label">Round off</span><span class="tb-value"><Money paise={view.totals.roundOff} /></span></div>
		{/if}
		<div class="tb-group tb-total">
			<span class="tb-label">{isQuotation ? 'Quotation total' : 'Total'}</span>
			<span class="tb-value"><Money paise={view.totals.grandTotal} bold /></span>
		</div>
		{#if !isQuotation && view.paid > 0}
			<div class="tb-group tb-total"><span class="tb-label">Balance</span><span class="tb-value"><Money paise={view.balance} bold /></span></div>
		{/if}
	</div>

	<ConfirmDialog
		bind:open={confirmCancel}
		title="Cancel this document?"
		message="It stays in your records for the audit trail but is excluded from all totals and reports. This cannot be undone."
		confirmLabel="Cancel document"
		cancelLabel="Keep it"
		danger
		onconfirm={cancelDoc}
		oncancel={() => {}}
	/>
	<ConfirmDialog
		bind:open={confirmDelete}
		title="Delete this document?"
		message="It will be removed from this browser permanently. Export a JSON backup first if you might need it."
		confirmLabel="Delete"
		danger
		onconfirm={deleteDoc}
		oncancel={() => {}}
	/>
{/if}

<style>
	.editor-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 0.92fr);
		gap: 1.1rem;
		align-items: start;
		padding-bottom: 72px;
	}

	@media (max-width: 1100px) {
		.editor-grid {
			/* minmax(0, ...) so a wide field row cannot stretch the single column. */
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.preview-sticky {
		position: sticky;
		top: 72px;
	}

	.preview-label {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
		flex-wrap: wrap;
	}

	.section-cap {
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}

	.lines {
		display: grid;
	}

	.line {
		padding: 0.8rem 1.1rem;
		border-bottom: 1px solid var(--border);
	}

	.line:last-child {
		border-bottom: none;
	}

	.line-top {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
	}

	.line-no {
		font-variant-numeric: tabular-nums;
		font-weight: 650;
		color: var(--muted);
		padding-top: 0.6rem;
		min-width: 1.2rem;
	}

	.line-top textarea {
		min-height: 52px;
		flex: 1;
	}

	.line-tools {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.line-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
		gap: 0.6rem;
		margin-top: 0.6rem;
		padding-left: 1.8rem;
	}

	@media (max-width: 640px) {
		.line-fields {
			padding-left: 0;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.line-tools {
			flex-direction: row;
		}
	}

	.line-total {
		justify-content: center;
		text-align: right;
	}

	.line-total strong {
		font-size: 1rem;
	}

	.charge-row {
		display: grid;
		grid-template-columns: 1fr 140px 110px auto;
		gap: 0.5rem;
		align-items: center;
	}

	@media (max-width: 640px) {
		.charge-row {
			grid-template-columns: 1fr 1fr;
		}
	}

	.pay-row {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr 1.2fr auto;
		gap: 0.6rem;
		align-items: end;
	}

	@media (max-width: 760px) {
		.pay-row {
			grid-template-columns: 1fr 1fr;
		}
	}

	.totals-bar {
		position: sticky;
		bottom: 0;
		z-index: 30;
		display: flex;
		gap: 1.25rem;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 0.6rem 1rem;
		margin-top: -56px;
	}

	@media (max-width: 900px) {
		.totals-bar {
			bottom: calc(var(--tabbar-h) + 0.5rem);
			justify-content: space-between;
			gap: 0.75rem;
		}
	}

	.tb-group {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		line-height: 1.25;
	}

	.tb-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		font-weight: 650;
	}

	.tb-value {
		font-size: 0.95rem;
		font-variant-numeric: tabular-nums;
	}

	.tb-total .tb-value {
		font-size: 1.15rem;
		font-weight: 700;
	}

	.col-form,
	.col-preview {
		min-width: 0;
	}

	.hide-mobile {
		display: none;
	}

	@media (min-width: 901px) {
		.hide-mobile {
			display: block;
		}
	}
</style>
