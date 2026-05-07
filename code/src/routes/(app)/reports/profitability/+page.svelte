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

	function profitClass(cents: number): string {
		if (cents > 0) return 'profit-positive';
		if (cents < 0) return 'profit-negative';
		return '';
	}
</script>

<svelte:head>
	<title>Отчети: Рентабилност</title>
</svelte:head>

<div class="page-header">
	<h1>Отчети: Рентабилност</h1>
</div>

<!-- Scope tabs -->
<div class="scope-tabs">
	<a
		href="/reports/profitability?scope=company&dateFrom={data.filters.dateFrom}&dateTo={data.filters.dateTo}"
		class="scope-tab"
		class:active={data.scope === 'company'}
	>
		Компания
	</a>
	<a
		href="/reports/profitability?scope=client&dateFrom={data.filters.dateFrom}&dateTo={data.filters.dateTo}"
		class="scope-tab"
		class:active={data.scope === 'client'}
	>
		По клиент
	</a>
	<a
		href="/reports/profitability?scope=project&dateFrom={data.filters.dateFrom}&dateTo={data.filters.dateTo}"
		class="scope-tab"
		class:active={data.scope === 'project'}
	>
		По проект
	</a>
</div>

<!-- Filter bar -->
<form method="GET" class="filter-bar">
	<input type="hidden" name="scope" value={data.filters.scope} />
	<div class="filter-group">
		<label for="dateFrom">От дата</label>
		<input
			id="dateFrom"
			type="date"
			name="dateFrom"
			value={data.filters.dateFrom}
			class="input-sm"
		/>
	</div>
	<div class="filter-group">
		<label for="dateTo">До дата</label>
		<input
			id="dateTo"
			type="date"
			name="dateTo"
			value={data.filters.dateTo}
			class="input-sm"
		/>
	</div>
	{#if data.scope === 'project' || data.scope === 'company'}
		<div class="filter-group">
			<label for="clientId">Клиент</label>
			<select id="clientId" name="clientId" class="input-sm">
				<option value="">Всички клиенти</option>
				{#each data.clients as client}
					<option value={client.id} selected={data.filters.clientId === client.id}
						>{client.legalName}</option
					>
				{/each}
			</select>
		</div>
	{/if}
	<div class="filter-actions">
		<button type="submit" class="btn btn-primary">Приложи</button>
		<a href="/reports/profitability?scope={data.filters.scope}" class="btn btn-secondary"
			>Изчисти</a
		>
	</div>
</form>

<!-- ─── Company view ──────────────────────────────────────────────────────── -->
{#if data.scope === 'company' && data.company}
	{@const c = data.company}
	<div class="summary-grid">
		<div class="summary-card summary-card--revenue">
			<div class="summary-label">Издадени приходи</div>
			<div class="summary-value">{formatCents(c.revenueCents)}</div>
			<div class="summary-hint">Брутна сума по издадени фактури</div>
		</div>
		<div class="summary-card summary-card--cost">
			<div class="summary-label">Разходи за труд</div>
			<div class="summary-value">{formatCents(c.laborCostCents)}</div>
			<div class="summary-hint">По снапшот себестойности на отработените часове</div>
		</div>
		<div class="summary-card summary-card--cost">
			<div class="summary-label">Преки разходи</div>
			<div class="summary-value">{formatCents(c.directExpCents)}</div>
			<div class="summary-hint">Платени разходи, свързани с клиент или проект</div>
		</div>
		<div class="summary-card {profitClass(c.profitabilityCents)}">
			<div class="summary-label">Рентабилност</div>
			<div class="summary-value">{formatCents(c.profitabilityCents)}</div>
			<div class="summary-hint">Марж: {margin(c.profitabilityCents, c.revenueCents)}</div>
		</div>
	</div>

	{#if !data.isManager}
		<div class="overhead-note">
			<span class="overhead-icon">ℹ</span>
			Режийните разходи ({formatCents(c.overheadCents)}) не са включени в рентабилността — показват
			се само за информация.
		</div>
	{/if}
{/if}

<!-- ─── Per-client view ───────────────────────────────────────────────────── -->
{#if data.scope === 'client' && data.clientRows}
	{@const totals = data.clientTotals}
	{#if !data.isManager && totals && totals.overheadCents > 0}
		<div class="overhead-note">
			<span class="overhead-icon">ℹ</span>
			Режийните разходи ({formatCents(totals.overheadCents)}) не са включени в проектната рентабилност.
		</div>
	{/if}

	{#if data.clientRows.length === 0}
		<p class="empty-state">Няма данни за избрания период.</p>
	{:else}
		<div class="table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th>Клиент</th>
						<th class="text-right">Приходи</th>
						<th class="text-right">Разходи труд</th>
						<th class="text-right">Преки разходи</th>
						<th class="text-right">Рентабилност</th>
						<th class="text-right">Марж</th>
					</tr>
				</thead>
				<tbody>
					{#each data.clientRows as row}
						<tr>
							<td>{row.legalName}</td>
							<td class="text-right">{formatCents(row.revenueCents)}</td>
							<td class="text-right">{formatCents(row.laborCostCents)}</td>
							<td class="text-right">{formatCents(row.directExpCents)}</td>
							<td class="text-right {profitClass(row.profitabilityCents)}">
								{formatCents(row.profitabilityCents)}
							</td>
							<td class="text-right {profitClass(row.profitabilityCents)}">
								{margin(row.profitabilityCents, row.revenueCents)}
							</td>
						</tr>
					{/each}
				</tbody>
				{#if totals && data.clientRows.length > 1}
					<tfoot>
						<tr class="totals-row">
							<td><strong>Общо</strong></td>
							<td class="text-right"><strong>{formatCents(totals.revenueCents)}</strong></td>
							<td class="text-right"><strong>{formatCents(totals.laborCostCents)}</strong></td>
							<td class="text-right"><strong>{formatCents(totals.directExpCents)}</strong></td>
							<td class="text-right {profitClass(totals.profitabilityCents)}">
								<strong>{formatCents(totals.profitabilityCents)}</strong>
							</td>
							<td class="text-right {profitClass(totals.profitabilityCents)}">
								<strong>{margin(totals.profitabilityCents, totals.revenueCents)}</strong>
							</td>
						</tr>
					</tfoot>
				{/if}
			</table>
		</div>
	{/if}
{/if}

<!-- ─── Per-project view ──────────────────────────────────────────────────── -->
{#if data.scope === 'project' && data.projectRows}
	{@const totals = data.projectTotals}
	{#if !data.isManager && totals && totals.overheadCents > 0}
		<div class="overhead-note">
			<span class="overhead-icon">ℹ</span>
			Режийните разходи ({formatCents(totals.overheadCents)}) не са включени в проектната рентабилност.
		</div>
	{/if}

	{#if data.projectRows.length === 0}
		<p class="empty-state">Няма данни за избрания период.</p>
	{:else}
		<div class="table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th>Проект</th>
						<th>Клиент</th>
						<th class="text-right">Приходи</th>
						<th class="text-right">Разходи труд</th>
						<th class="text-right">Преки разходи</th>
						<th class="text-right">Рентабилност</th>
						<th class="text-right">Марж</th>
					</tr>
				</thead>
				<tbody>
					{#each data.projectRows as row}
						<tr>
							<td>{row.projectName}</td>
							<td class="text-muted">{row.clientName}</td>
							<td class="text-right">{formatCents(row.revenueCents)}</td>
							<td class="text-right">{formatCents(row.laborCostCents)}</td>
							<td class="text-right">{formatCents(row.directExpCents)}</td>
							<td class="text-right {profitClass(row.profitabilityCents)}">
								{formatCents(row.profitabilityCents)}
							</td>
							<td class="text-right {profitClass(row.profitabilityCents)}">
								{margin(row.profitabilityCents, row.revenueCents)}
							</td>
						</tr>
					{/each}
				</tbody>
				{#if totals && data.projectRows.length > 1}
					<tfoot>
						<tr class="totals-row">
							<td colspan="2"><strong>Общо</strong></td>
							<td class="text-right"><strong>{formatCents(totals.revenueCents)}</strong></td>
							<td class="text-right"><strong>{formatCents(totals.laborCostCents)}</strong></td>
							<td class="text-right"><strong>{formatCents(totals.directExpCents)}</strong></td>
							<td class="text-right {profitClass(totals.profitabilityCents)}">
								<strong>{formatCents(totals.profitabilityCents)}</strong>
							</td>
							<td class="text-right {profitClass(totals.profitabilityCents)}">
								<strong>{margin(totals.profitabilityCents, totals.revenueCents)}</strong>
							</td>
						</tr>
					</tfoot>
				{/if}
			</table>
		</div>
	{/if}
{/if}

<style>
	.page-header {
		margin-bottom: 20px;
	}

	.page-header h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0;
	}

	/* Scope tabs */
	.scope-tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 20px;
		border-bottom: 2px solid #e2e8f0;
	}

	.scope-tab {
		padding: 8px 18px;
		font-size: 0.9375rem;
		font-weight: 500;
		color: #64748b;
		text-decoration: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		transition: color 0.15s, border-color 0.15s;
	}

	.scope-tab:hover {
		color: #1e293b;
	}

	.scope-tab.active {
		color: #3b82f6;
		border-bottom-color: #3b82f6;
	}

	/* Filter bar */
	.filter-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		align-items: flex-end;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 16px;
		margin-bottom: 24px;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.filter-group label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: #475569;
	}

	.filter-actions {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}

	.input-sm {
		height: 34px;
		padding: 0 10px;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		font-size: 0.875rem;
		font-family: inherit;
		color: #0f172a;
		background: #fff;
		min-width: 140px;
	}

	.input-sm:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 2px #bfdbfe;
	}

	/* Buttons */
	.btn {
		display: inline-flex;
		align-items: center;
		height: 34px;
		padding: 0 14px;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		font-family: inherit;
		cursor: pointer;
		border: 1px solid transparent;
		text-decoration: none;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}

	.btn-primary {
		background: #3b82f6;
		color: #fff;
		border-color: #3b82f6;
	}

	.btn-primary:hover {
		background: #2563eb;
		border-color: #2563eb;
	}

	.btn-secondary {
		background: #fff;
		color: #374151;
		border-color: #d1d5db;
	}

	.btn-secondary:hover {
		background: #f9fafb;
		border-color: #9ca3af;
	}

	/* Summary cards */
	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
		margin-bottom: 24px;
	}

	.summary-card {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 20px;
	}

	.summary-card--revenue {
		border-color: #93c5fd;
		background: #eff6ff;
	}

	.summary-card--cost {
		border-color: #fca5a5;
		background: #fef2f2;
	}

	.profit-positive {
		border-color: #86efac;
		background: #f0fdf4;
		color: #166534;
	}

	.profit-negative {
		border-color: #fca5a5;
		background: #fef2f2;
		color: #991b1b;
	}

	.summary-label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: #64748b;
		margin-bottom: 6px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.summary-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #0f172a;
		margin-bottom: 4px;
	}

	.summary-hint {
		font-size: 0.75rem;
		color: #94a3b8;
	}

	/* Overhead note */
	.overhead-note {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		background: #fffbeb;
		border: 1px solid #fcd34d;
		border-radius: 8px;
		padding: 12px 16px;
		font-size: 0.875rem;
		color: #92400e;
		margin-bottom: 24px;
	}

	.overhead-icon {
		font-style: normal;
		font-weight: 700;
		flex-shrink: 0;
	}

	/* Tables */
	.table-wrap {
		overflow-x: auto;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		margin-bottom: 32px;
	}

	.data-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.data-table th {
		background: #f8fafc;
		padding: 10px 14px;
		text-align: left;
		font-size: 0.8125rem;
		font-weight: 600;
		color: #475569;
		border-bottom: 1px solid #e2e8f0;
		white-space: nowrap;
	}

	.data-table td {
		padding: 10px 14px;
		border-bottom: 1px solid #f1f5f9;
		color: #1e293b;
		vertical-align: middle;
	}

	.data-table tbody tr:last-child td {
		border-bottom: none;
	}

	.data-table tbody tr:hover {
		background: #f8fafc;
	}

	.totals-row td {
		background: #f8fafc;
		border-top: 2px solid #e2e8f0;
		border-bottom: none;
	}

	.text-right {
		text-align: right;
	}

	.text-muted {
		color: #64748b;
		font-size: 0.8125rem;
	}

	.empty-state {
		color: #94a3b8;
		font-size: 0.9375rem;
		padding: 20px 0;
	}

	/* Profit coloring inside tables */
	td.profit-positive {
		color: #166534;
		font-weight: 600;
		background: transparent;
		border: none;
	}

	td.profit-negative {
		color: #991b1b;
		font-weight: 600;
		background: transparent;
		border: none;
	}
</style>
