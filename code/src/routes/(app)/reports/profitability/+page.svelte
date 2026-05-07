<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatCents(cents: number): string {
		return (cents / 100).toFixed(2) + ' ' + data.currency;
	}

	function margin(profitability: number, revenue: number): string {
		if (revenue === 0) return '—';
		return ((profitability / revenue) * 100).toFixed(1) + '%';
	}

	function profitColor(cents: number): string {
		if (cents > 0) return 'var(--success)';
		if (cents < 0) return 'var(--danger)';
		return 'var(--text)';
	}
</script>

<svelte:head>
	<title>Отчети: Рентабилност – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Отчети: Рентабилност</h1>
		<p class="page-sub">Приход срещу разход на ниво компания, клиент или проект</p>
	</div>
</div>

<!-- Scope tabs -->
<div class="tabs" style="margin-bottom:16px;">
	<a href="/reports/profitability?scope=company&dateFrom={data.filters.dateFrom}&dateTo={data.filters.dateTo}" class="tab" class:active={data.scope === 'company'}>Компания</a>
	<a href="/reports/profitability?scope=client&dateFrom={data.filters.dateFrom}&dateTo={data.filters.dateTo}" class="tab" class:active={data.scope === 'client'}>По клиент</a>
	<a href="/reports/profitability?scope=project&dateFrom={data.filters.dateFrom}&dateTo={data.filters.dateTo}" class="tab" class:active={data.scope === 'project'}>По проект</a>
</div>

<!-- Filter bar -->
<form method="GET" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:16px;">
	<input type="hidden" name="scope" value={data.filters.scope} />
	<input class="input" type="date" name="dateFrom" value={data.filters.dateFrom} style="width:140px;" title="От дата" />
	<input class="input" type="date" name="dateTo" value={data.filters.dateTo} style="width:140px;" title="До дата" />
	{#if data.scope === 'project' || data.scope === 'company'}
		<select class="select" name="clientId" style="width:auto;">
			<option value="">Всички клиенти</option>
			{#each data.clients as client}
				<option value={client.id} selected={data.filters.clientId === client.id}>{client.legalName}</option>
			{/each}
		</select>
	{/if}
	<button type="submit" class="btn btn-secondary btn-sm">Приложи</button>
	<a href="/reports/profitability?scope={data.filters.scope}" class="btn btn-ghost btn-sm">Изчисти</a>
</form>

<!-- Company view -->
{#if data.scope === 'company' && data.company}
	{@const c = data.company}
	<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px;">
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Издадени приходи</div>
			<div class="amount" style="font-size:20px; font-weight:500;">{formatCents(c.revenueCents)}</div>
			<div class="muted" style="font-size:11px;">Брутна сума по издадени фактури</div>
		</div>
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Разходи за труд</div>
			<div class="amount" style="font-size:20px; font-weight:500;">{formatCents(c.laborCostCents)}</div>
			<div class="muted" style="font-size:11px;">По снапшот себестойности</div>
		</div>
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Преки разходи</div>
			<div class="amount" style="font-size:20px; font-weight:500;">{formatCents(c.directExpCents)}</div>
			<div class="muted" style="font-size:11px;">Платени разходи, свързани с клиент или проект</div>
		</div>
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Рентабилност</div>
			<div class="amount" style="font-size:20px; font-weight:500; color:{profitColor(c.profitabilityCents)};">{formatCents(c.profitabilityCents)}</div>
			<div class="muted" style="font-size:11px;">Марж: {margin(c.profitabilityCents, c.revenueCents)}</div>
		</div>
	</div>
	{#if !data.isManager}
		<div style="display:flex; align-items:flex-start; gap:8px; padding:10px 14px; background:var(--accent-subtle); border:1px solid var(--border); border-radius:var(--r-md); font-size:13px; color:var(--accent); margin-bottom:16px;">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
			<span>Режийните разходи ({formatCents(c.overheadCents)}) не са включени в рентабилността — показват се само за информация.</span>
		</div>
	{/if}
{/if}

<!-- Client view -->
{#if data.scope === 'client' && data.clientRows}
	{@const totals = data.clientTotals}
	{#if !data.isManager && totals && totals.overheadCents > 0}
		<div style="display:flex; align-items:flex-start; gap:8px; padding:10px 14px; background:var(--accent-subtle); border:1px solid var(--border); border-radius:var(--r-md); font-size:13px; color:var(--accent); margin-bottom:16px;">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
			<span>Режийните разходи ({formatCents(totals.overheadCents)}) не са включени в проектната рентабилност.</span>
		</div>
	{/if}
	<div class="card">
		<table class="tbl">
			<thead>
				<tr>
					<th>Клиент</th>
					<th style="text-align:right;">Приходи</th>
					<th style="text-align:right;">Разходи труд</th>
					<th style="text-align:right;">Преки разходи</th>
					<th style="text-align:right;">Рентабилност</th>
					<th style="text-align:right;">Марж</th>
				</tr>
			</thead>
			<tbody>
				{#if data.clientRows.length === 0}
					<tr><td colspan="6" style="text-align:center; padding:32px 16px; color:var(--text-muted);">Няма данни за избрания период.</td></tr>
				{/if}
				{#each data.clientRows as row}
					<tr>
						<td style="font-size:13px;">{row.legalName}</td>
						<td class="amount" style="text-align:right;">{formatCents(row.revenueCents)}</td>
						<td class="amount muted" style="text-align:right;">{formatCents(row.laborCostCents)}</td>
						<td class="amount muted" style="text-align:right;">{formatCents(row.directExpCents)}</td>
						<td class="amount" style="text-align:right; font-weight:600; color:{profitColor(row.profitabilityCents)};">{formatCents(row.profitabilityCents)}</td>
						<td class="amount" style="text-align:right; color:{profitColor(row.profitabilityCents)};">{margin(row.profitabilityCents, row.revenueCents)}</td>
					</tr>
				{/each}
			</tbody>
			{#if totals && data.clientRows.length > 1}
				<tfoot>
					<tr style="border-top:2px solid var(--border); background:var(--surface);">
						<td style="font-size:13px; font-weight:600;">Общо</td>
						<td class="amount" style="text-align:right; font-weight:600;">{formatCents(totals.revenueCents)}</td>
						<td class="amount muted" style="text-align:right; font-weight:600;">{formatCents(totals.laborCostCents)}</td>
						<td class="amount muted" style="text-align:right; font-weight:600;">{formatCents(totals.directExpCents)}</td>
						<td class="amount" style="text-align:right; font-weight:700; color:{profitColor(totals.profitabilityCents)};">{formatCents(totals.profitabilityCents)}</td>
						<td class="amount" style="text-align:right; color:{profitColor(totals.profitabilityCents)};">{margin(totals.profitabilityCents, totals.revenueCents)}</td>
					</tr>
				</tfoot>
			{/if}
		</table>
	</div>
{/if}

<!-- Project view -->
{#if data.scope === 'project' && data.projectRows}
	{@const totals = data.projectTotals}
	{#if !data.isManager && totals && totals.overheadCents > 0}
		<div style="display:flex; align-items:flex-start; gap:8px; padding:10px 14px; background:var(--accent-subtle); border:1px solid var(--border); border-radius:var(--r-md); font-size:13px; color:var(--accent); margin-bottom:16px;">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
			<span>Режийните разходи ({formatCents(totals.overheadCents)}) не са включени в проектната рентабилност.</span>
		</div>
	{/if}
	<div class="card">
		<table class="tbl">
			<thead>
				<tr>
					<th>Проект</th>
					<th>Клиент</th>
					<th style="text-align:right;">Приходи</th>
					<th style="text-align:right;">Разходи труд</th>
					<th style="text-align:right;">Преки разходи</th>
					<th style="text-align:right;">Рентабилност</th>
					<th style="text-align:right;">Марж</th>
				</tr>
			</thead>
			<tbody>
				{#if data.projectRows.length === 0}
					<tr><td colspan="7" style="text-align:center; padding:32px 16px; color:var(--text-muted);">Няма данни за избрания период.</td></tr>
				{/if}
				{#each data.projectRows as row}
					<tr>
						<td style="font-size:13px; font-weight:500;">{row.projectName}</td>
						<td class="muted" style="font-size:12px;">{row.clientName}</td>
						<td class="amount" style="text-align:right;">{formatCents(row.revenueCents)}</td>
						<td class="amount muted" style="text-align:right;">{formatCents(row.laborCostCents)}</td>
						<td class="amount muted" style="text-align:right;">{formatCents(row.directExpCents)}</td>
						<td class="amount" style="text-align:right; font-weight:600; color:{profitColor(row.profitabilityCents)};">{formatCents(row.profitabilityCents)}</td>
						<td class="amount" style="text-align:right; color:{profitColor(row.profitabilityCents)};">{margin(row.profitabilityCents, row.revenueCents)}</td>
					</tr>
				{/each}
			</tbody>
			{#if totals && data.projectRows.length > 1}
				<tfoot>
					<tr style="border-top:2px solid var(--border); background:var(--surface);">
						<td colspan="2" style="font-size:13px; font-weight:600;">Общо</td>
						<td class="amount" style="text-align:right; font-weight:600;">{formatCents(totals.revenueCents)}</td>
						<td class="amount muted" style="text-align:right; font-weight:600;">{formatCents(totals.laborCostCents)}</td>
						<td class="amount muted" style="text-align:right; font-weight:600;">{formatCents(totals.directExpCents)}</td>
						<td class="amount" style="text-align:right; font-weight:700; color:{profitColor(totals.profitabilityCents)};">{formatCents(totals.profitabilityCents)}</td>
						<td class="amount" style="text-align:right; color:{profitColor(totals.profitabilityCents)};">{margin(totals.profitabilityCents, totals.revenueCents)}</td>
					</tr>
				</tfoot>
			{/if}
		</table>
	</div>
{/if}
