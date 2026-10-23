<script lang="ts">
	// Live preview that mirrors the PDF: same RenderDoc model, same column set,
	// same totals order, same template treatment. Also used by the print view.
	import type { RenderDoc } from '$lib/doc/model.ts';
	import { qrSvgPath } from '$lib/core/upi.ts';

	let { doc, showQr = false }: { doc: RenderDoc; showQr?: boolean } = $props();

	let qr = $derived.by(() => {
		if (!showQr || !doc.upi) return null;
		try {
			return qrSvgPath(doc.upi.link);
		} catch {
			return null;
		}
	});
</script>

<article class="sheet tpl-{doc.template}" style="--accent: {doc.accent}" aria-label="Document preview">
	{#if doc.template === 'modern'}<div class="accent-band"></div>{/if}

	<header class="sheet-head">
		<div class="biz">
			{#if doc.business.logo}
				<img src={doc.business.logo} alt="" class="logo" />
			{/if}
			<div>
				<h2 class="biz-name">{doc.business.name}</h2>
				{#each doc.business.addressLines as line, i (i)}<div class="muted">{line}</div>{/each}
				{#each doc.business.contactLines as line, i (i)}<div class="muted">{line}</div>{/each}
				{#if doc.business.gstin}<div class="strong">GSTIN: {doc.business.gstin}</div>{/if}
				{#if doc.business.pan}<div class="muted">PAN: {doc.business.pan}</div>{/if}
			</div>
		</div>
		<div class="doc-meta">
			<h1 class="doc-title">{doc.title}</h1>
			<dl>
				{#each doc.meta as m (m.label)}
					<div><dt>{m.label}</dt><dd class="mono-num">{m.value}</dd></div>
				{/each}
			</dl>
		</div>
	</header>

	<div class="rule"></div>

	<section class="parties">
		<div>
			<div class="section-label">Bill to</div>
			<div class="strong big">{doc.client.company || doc.client.name || 'Client'}</div>
			{#if doc.client.company && doc.client.name}<div class="muted">{doc.client.name}</div>{/if}
			{#each doc.client.addressLines as line, i (i)}<div class="muted">{line}</div>{/each}
			{#each doc.client.contactLines as line, i (i)}<div class="muted">{line}</div>{/each}
			{#if doc.client.gstin}<div class="strong">GSTIN: {doc.client.gstin}</div>{/if}
			{#if doc.client.state}<div class="muted">State: {doc.client.state}</div>{/if}
		</div>
		<div>
			<div class="section-label">{doc.interState ? 'Inter-state supply (IGST)' : 'Intra-state supply (CGST + SGST)'}</div>
			{#if doc.business.state}<div class="muted">Supplier state: {doc.business.state}</div>{/if}
			{#each doc.meta.filter((m) => m.label === 'Place of supply') as m (m.label)}
				<div class="muted">Place of supply: {m.value}</div>
			{/each}
			{#if doc.footerNote}<div class="strong">{doc.footerNote}</div>{/if}
		</div>
	</section>

	<table class="items">
		<thead>
			<tr>
				<th scope="col">#</th>
				<th scope="col">Description</th>
				{#if doc.hasHsnColumn}<th scope="col">HSN/SAC</th>{/if}
				<th scope="col" class="num">Qty</th>
				<th scope="col">Unit</th>
				<th scope="col" class="num">Rate</th>
				{#if doc.hasDiscountColumn}<th scope="col" class="num">Disc.</th>{/if}
				<th scope="col" class="num">Tax</th>
				<th scope="col" class="num">Amount</th>
			</tr>
		</thead>
		<tbody>
			{#each doc.rows as row (row.sn)}
				<tr>
					<td>{row.sn}</td>
					<td>{row.description}</td>
					{#if doc.hasHsnColumn}<td>{row.hsn}</td>{/if}
					<td class="num">{row.qty}</td>
					<td>{row.unit}</td>
					<td class="num">{row.rate}</td>
					{#if doc.hasDiscountColumn}<td class="num">{row.discount}</td>{/if}
					<td class="num">{row.taxRate}</td>
					<td class="num">{row.amount}</td>
				</tr>
			{:else}
				<tr><td colspan="9" class="muted center">No line items yet.</td></tr>
			{/each}
		</tbody>
	</table>

	<section class="summary">
		<div class="tax-summary">
			{#if doc.taxRows.length}
				<div class="section-label">Tax summary</div>
				<table class="tax">
					<thead>
						<tr>
							<th scope="col">Rate</th>
							<th scope="col" class="num">Taxable value</th>
							{#if doc.interState}
								<th scope="col" class="num">IGST</th>
							{:else}
								<th scope="col" class="num">CGST</th>
								<th scope="col" class="num">SGST</th>
							{/if}
						</tr>
					</thead>
					<tbody>
						{#each doc.taxRows as r (r.rate)}
							<tr>
								<td>{r.rate}</td>
								<td class="num">{r.taxable}</td>
								{#if doc.interState}
									<td class="num">{r.igst}</td>
								{:else}
									<td class="num">{r.cgst}</td>
									<td class="num">{r.sgst}</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
		<div class="totals">
			{#each doc.totals as row (row.label)}
				<div class="total-row" class:strong-row={row.strong}>
					<span>{row.label}</span>
					<span class="mono-num">{row.value}</span>
				</div>
			{/each}
		</div>
	</section>

	<section class="words">
		<div class="section-label">Amount in words</div>
		<div class="strong">{doc.amountWords}</div>
	</section>

	<footer class="sheet-foot">
		<div>
			{#if doc.bank.length}
				<div class="section-label">Bank details</div>
				<dl class="bank">
					{#each doc.bank as b (b.label)}
						<div><dt>{b.label}</dt><dd class="mono-num">{b.value}</dd></div>
					{/each}
				</dl>
			{/if}
			{#if doc.upi}
				<div class="strong" style="margin-top:.35rem">UPI: {doc.upi.id}</div>
				{#if qr}
					<svg class="qr" viewBox="0 0 {qr.size} {qr.size}" width="104" height="104" role="img" aria-label="UPI payment QR code">
						<rect width={qr.size} height={qr.size} fill="#fff" />
						<path d={qr.path} fill="#000" />
					</svg>
					<div class="muted tiny">Scan with any UPI app to pay the balance.</div>
				{/if}
			{/if}
			{#if doc.notes}
				<div class="section-label" style="margin-top:.6rem">Notes</div>
				<div class="muted pre">{doc.notes}</div>
			{/if}
		</div>
		<div class="sign-col">
			{#if doc.terms}
				<div class="section-label">Terms and conditions</div>
				<div class="muted pre">{doc.terms}</div>
			{/if}
			<div class="sign">
				{#if doc.signature}<img src={doc.signature} alt="" class="sign-img" />{/if}
				<div class="sign-rule"></div>
				<div class="strong">For {doc.business.name}</div>
				<div class="muted tiny">Authorised signatory</div>
			</div>
		</div>
	</footer>

	<div class="muted tiny center computer-note">This is a computer generated document.</div>
</article>

<style>
	.sheet {
		background: #fff;
		color: #1b2440;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 22px 24px 18px;
		font-size: 12px;
		line-height: 1.45;
		position: relative;
		overflow: hidden;
		container-type: inline-size;
	}

	.accent-band {
		position: absolute;
		inset: 0 0 auto;
		height: 6px;
		background: var(--accent);
	}

	.tpl-modern {
		padding-top: 26px;
	}

	.sheet-head {
		display: flex;
		justify-content: space-between;
		gap: 18px;
		align-items: flex-start;
	}

	.biz {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		min-width: 0;
	}

	.logo {
		max-width: 110px;
		max-height: 46px;
		object-fit: contain;
	}

	.biz-name {
		font-size: 15px;
		margin: 0 0 3px;
		color: var(--accent);
		font-weight: 700;
	}

	.tpl-minimal .biz-name {
		color: #1b2440;
	}

	.doc-title {
		font-size: 19px;
		margin: 0 0 6px;
		text-align: right;
		letter-spacing: 0.02em;
		color: #1b2440;
	}

	.doc-meta dl {
		margin: 0;
		display: grid;
		gap: 2px;
	}

	.doc-meta dl > div {
		display: grid;
		grid-template-columns: auto auto;
		gap: 10px;
		justify-content: end;
	}

	dt {
		color: #5c6578;
		font-size: 11px;
	}

	dd {
		margin: 0;
		font-weight: 600;
		font-size: 11.5px;
		text-align: right;
	}

	.muted {
		color: #5c6578;
		font-size: 11px;
	}

	.strong {
		font-weight: 650;
		font-size: 11.5px;
	}

	.big {
		font-size: 13px;
	}

	.tiny {
		font-size: 10px;
	}

	.center {
		text-align: center;
	}

	.pre {
		white-space: pre-wrap;
	}

	.rule {
		height: 2px;
		background: var(--accent);
		margin: 12px 0;
	}

	.tpl-minimal .rule {
		height: 1px;
		background: #d2d2c9;
	}

	.section-label {
		font-size: 9.5px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #5c6578;
		font-weight: 700;
		margin-bottom: 4px;
	}

	.parties {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px;
		margin-bottom: 14px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 11px;
	}

	.items thead th {
		background: #f5f5f1;
		color: #1b2440;
		text-transform: none;
		letter-spacing: 0;
		font-size: 10px;
		padding: 6px 6px;
		border-bottom: 1px solid #d2d2c9;
	}

	.tpl-modern .items thead th {
		background: var(--accent);
		color: #fff;
	}

	.tpl-minimal .items thead th {
		background: transparent;
		border-top: 1px solid #1b2440;
		border-bottom: 1px solid #d2d2c9;
	}

	.items tbody td {
		padding: 6px;
		border-bottom: 1px solid #ebebe4;
		vertical-align: top;
	}

	.tpl-classic .items tbody td,
	.tpl-classic .items thead th {
		border: 1px solid #d2d2c9;
	}

	.items tbody tr:hover {
		background: transparent;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.summary {
		display: grid;
		grid-template-columns: 1fr 260px;
		gap: 18px;
		margin-top: 14px;
	}

	.tax thead th {
		background: #f5f5f1;
		font-size: 9.5px;
		padding: 4px 6px;
		border-bottom: 1px solid #d2d2c9;
		text-transform: none;
		letter-spacing: 0;
		color: #1b2440;
	}

	.tax tbody td {
		padding: 4px 6px;
		border-bottom: 1px solid #ebebe4;
		font-size: 10.5px;
	}

	.total-row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 3px 8px;
		font-size: 11.5px;
		color: #5c6578;
	}

	.strong-row {
		background: var(--accent);
		color: #fff;
		font-weight: 700;
		font-size: 13px;
		padding: 7px 8px;
		border-radius: 3px;
		margin: 3px 0;
	}

	.tpl-minimal .strong-row {
		background: #f5f5f1;
		color: #1b2440;
	}

	.words {
		margin-top: 14px;
		padding-top: 10px;
		border-top: 1px solid #ebebe4;
	}

	.sheet-foot {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px;
		margin-top: 14px;
	}

	.bank {
		margin: 0;
		display: grid;
		gap: 2px;
	}

	.bank > div {
		display: grid;
		grid-template-columns: 90px 1fr;
		gap: 6px;
	}

	.bank dd {
		text-align: left;
	}

	.qr {
		margin-top: 6px;
		border: 1px solid #ebebe4;
		border-radius: 3px;
	}

	.sign-col {
		display: flex;
		flex-direction: column;
	}

	.sign {
		margin-top: auto;
		padding-top: 24px;
	}

	.sign-img {
		max-height: 40px;
		max-width: 150px;
		object-fit: contain;
		display: block;
	}

	.sign-rule {
		border-top: 1px solid #d2d2c9;
		width: 160px;
		margin-bottom: 4px;
	}

	.computer-note {
		margin-top: 12px;
		padding-top: 8px;
		border-top: 1px solid #ebebe4;
	}

	/* Narrow containers (mobile preview): stack the two-column blocks. */
	@container (max-width: 520px) {
		.sheet-head,
		.parties,
		.summary,
		.sheet-foot {
			grid-template-columns: 1fr;
			display: grid;
		}

		.doc-title,
		.doc-meta dl > div,
		dd {
			text-align: left;
			justify-content: start;
		}
	}
</style>
