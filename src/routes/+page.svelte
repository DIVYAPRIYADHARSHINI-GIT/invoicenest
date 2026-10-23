<script lang="ts">
	// Dashboard: financial-year figures, revenue bar chart, status donut, top
	// clients and recent activity. All charts are hand-written SVG (no library).
	import { app } from '$lib/app.svelte.ts';
	import { formatDate } from '$lib/core/dates.ts';
	import { formatAmount } from '$lib/core/money.ts';
	import { STATUS_LABEL, STATUS_TONE } from '$lib/core/status.ts';
	import Money from '$lib/components/Money.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';

	let stats = $derived(app.stats);
	let cur = $derived(app.data.settings.currency);
	let hasData = $derived(app.data.docs.length > 0);

	// --- revenue bar chart geometry ---
	const CH_W = 720;
	const CH_H = 220;
	const PAD_L = 54;
	const PAD_B = 28;
	const PAD_T = 12;

	let maxMonth = $derived(Math.max(1, ...stats.byMonth.map((m) => m.amount)));
	let barW = $derived((CH_W - PAD_L - 10) / stats.byMonth.length);

	function niceTop(v: number): number {
		const rupees = Math.ceil(v / 100);
		const mag = Math.pow(10, Math.max(0, String(Math.floor(rupees)).length - 1));
		return Math.ceil(rupees / mag) * mag * 100;
	}
	let top = $derived(niceTop(maxMonth));

	// --- donut geometry ---
	const R = 58;
	const C = 2 * Math.PI * R;
	const TONE_COLOR: Record<string, string> = {
		good: 'var(--good)',
		warn: 'var(--warn)',
		bad: 'var(--bad)',
		neutral: 'var(--muted-2)'
	};
	let donutTotal = $derived(stats.statusBreakdown.reduce((s, x) => s + x.count, 0));
	let donutSegments = $derived(
		(() => {
			let acc = 0;
			return stats.statusBreakdown.map((s) => {
				const frac = donutTotal ? s.count / donutTotal : 0;
				const seg = { ...s, dash: frac * C, offset: -acc * C, color: TONE_COLOR[STATUS_TONE[s.status]] };
				acc += frac;
				return seg;
			});
		})()
	);

	let recent = $derived(
		[...app.views]
			.sort((a, b) => (b.doc.updatedAt || '').localeCompare(a.doc.updatedAt || '') || b.doc.date.localeCompare(a.doc.date))
			.slice(0, 8)
	);
</script>

<div class="page-head">
	<div>
		<h1>Dashboard</h1>
		<p>Financial year {stats.fyKey} &middot; {formatDate(stats.fyStart, app.data.settings.dateFormat)} to {formatDate(stats.fyEnd, app.data.settings.dateFormat)}</p>
	</div>
	<div class="btn-row">
		<a class="btn" href="/documents/new?type=quotation">New quotation</a>
		<a class="btn btn-primary" href="/documents/new?type=invoice">New invoice</a>
	</div>
</div>

{#if !app.loaded}
	<div class="grid grid-4">
		{#each [1, 2, 3, 4] as i (i)}
			<div class="card card-pad"><div class="skeleton" style="height:48px"></div></div>
		{/each}
	</div>
{:else if !hasData}
	<div class="card empty">
		<h3>Nothing here yet</h3>
		<p>
			Create your first invoice, or load the fictional sample workspace (Bluebird Design Co.) from Settings to see every page filled with realistic content.
		</p>
		<div class="btn-row" style="justify-content:center">
			<a class="btn btn-primary" href="/documents/new?type=invoice">Create an invoice</a>
			<a class="btn" href="/settings#sample">Load sample data</a>
		</div>
	</div>
{:else}
	<div class="grid grid-4">
		<div class="card card-pad">
			<div class="stat-label">Invoiced this FY</div>
			<div class="stat-value"><Money paise={stats.invoiced} /></div>
		</div>
		<div class="card card-pad">
			<div class="stat-label">Received</div>
			<div class="stat-value" style="color:var(--good)"><Money paise={stats.received} /></div>
		</div>
		<div class="card card-pad">
			<div class="stat-label">Pending</div>
			<div class="stat-value" style="color:var(--warn)"><Money paise={stats.pending} /></div>
		</div>
		<div class="card card-pad">
			<div class="stat-label">Overdue ({stats.overdueCount} {stats.overdueCount === 1 ? 'invoice' : 'invoices'})</div>
			<div class="stat-value" style="color:var(--bad)"><Money paise={stats.overdue} /></div>
		</div>
	</div>

	<div class="grid grid-2 chart-row" style="margin-top:1rem">
		<section class="card">
			<div class="card-head"><h2>Revenue by month</h2><span class="hint">Invoiced, excluding cancelled</span></div>
			<div class="card-pad">
				<svg viewBox="0 0 {CH_W} {CH_H}" class="chart" role="img" aria-label="Revenue by month bar chart">
					{#each [0, 0.25, 0.5, 0.75, 1] as t (t)}
						<line x1={PAD_L} x2={CH_W - 6} y1={PAD_T + (1 - t) * (CH_H - PAD_T - PAD_B)} y2={PAD_T + (1 - t) * (CH_H - PAD_T - PAD_B)} stroke="var(--border)" stroke-width="1" />
						<text x={PAD_L - 8} y={PAD_T + (1 - t) * (CH_H - PAD_T - PAD_B) + 4} text-anchor="end" class="axis">
							{formatAmount(top * t, cur, false).split('.')[0]}
						</text>
					{/each}
					{#each stats.byMonth as m, i (m.key)}
						{@const h = top ? (m.amount / top) * (CH_H - PAD_T - PAD_B) : 0}
						<rect
							x={PAD_L + i * barW + barW * 0.18}
							y={CH_H - PAD_B - h}
							width={barW * 0.64}
							height={Math.max(h, m.amount > 0 ? 2 : 0)}
							fill="var(--primary)"
							rx="2"
						>
							<title>{m.label}: {formatAmount(m.amount, cur)}</title>
						</rect>
						<text x={PAD_L + i * barW + barW / 2} y={CH_H - 8} text-anchor="middle" class="axis">{m.label}</text>
					{/each}
				</svg>
			</div>
		</section>

		<section class="card">
			<div class="card-head"><h2>Invoice status</h2></div>
			<div class="card-pad donut-wrap">
				{#if donutTotal === 0}
					<p class="hint">No invoices in this financial year yet.</p>
				{:else}
					<svg viewBox="0 0 160 160" width="150" height="150" role="img" aria-label="Invoice status breakdown">
						<g transform="rotate(-90 80 80)">
							{#each donutSegments as seg (seg.status)}
								<circle
									cx="80"
									cy="80"
									r={R}
									fill="none"
									stroke={seg.color}
									stroke-width="20"
									stroke-dasharray="{seg.dash} {C - seg.dash}"
									stroke-dashoffset={seg.offset}
								>
									<title>{STATUS_LABEL[seg.status]}: {seg.count}</title>
								</circle>
							{/each}
						</g>
						<text x="80" y="76" text-anchor="middle" class="donut-num">{donutTotal}</text>
						<text x="80" y="92" text-anchor="middle" class="axis">invoices</text>
					</svg>
					<ul class="legend">
						{#each donutSegments as seg (seg.status)}
							<li>
								<span class="swatch" style="background:{seg.color}"></span>
								<span>{STATUS_LABEL[seg.status]}</span>
								<span class="mono-num" style="margin-left:auto">{seg.count}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>
	</div>

	<div class="grid grid-2" style="margin-top:1rem">
		<section class="card">
			<div class="card-head"><h2>Top clients</h2><span class="hint">By invoiced value this FY</span></div>
			<div class="table-wrap">
				<table>
					<thead>
						<tr><th scope="col">Client</th><th scope="col" class="num">Invoices</th><th scope="col" class="num">Value</th></tr>
					</thead>
					<tbody>
						{#each stats.topClients as row (row.client?.id ?? 'unknown')}
							<tr>
								<td>{row.client ? row.client.company || row.client.name : 'Unknown client'}</td>
								<td class="num">{row.count}</td>
								<td class="num"><Money paise={row.amount} /></td>
							</tr>
						{:else}
							<tr><td colspan="3" class="hint">No invoices yet.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="card">
			<div class="card-head"><h2>Recent activity</h2></div>
			<div class="table-wrap">
				<table>
					<thead>
						<tr><th scope="col">Document</th><th scope="col">Client</th><th scope="col">Status</th><th scope="col" class="num">Amount</th></tr>
					</thead>
					<tbody>
						{#each recent as v (v.doc.id)}
							<tr>
								<td><a href="/documents/{v.doc.id}">{v.doc.number}</a></td>
								<td>{v.client ? v.client.company || v.client.name : '-'}</td>
								<td><StatusPill status={v.status} /></td>
								<td class="num"><Money paise={v.totals.grandTotal} /></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</div>
{/if}

<style>
	/* Wider chart column on desktop only; the shared .grid-2 media query collapses
	   this to a single column on small screens. */
	@media (min-width: 901px) {
		.chart-row {
			grid-template-columns: 1.6fr 1fr;
		}
	}

	.chart {
		width: 100%;
		height: auto;
	}

	.axis {
		font-size: 10px;
		fill: var(--muted);
		font-variant-numeric: tabular-nums;
	}

	.donut-num {
		font-size: 20px;
		font-weight: 700;
		fill: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	.donut-wrap {
		display: flex;
		gap: 1rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
		font-size: 0.85rem;
		min-width: 160px;
		flex: 1;
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		flex: none;
	}
</style>
