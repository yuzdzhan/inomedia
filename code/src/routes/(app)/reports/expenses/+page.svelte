<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatCents(cents: number): string {
		return (cents / 100).toFixed(2) + ' лв.';
	}

	function formatDate(date: Date | string | null): string {
		if (!date) return '—';
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	const expenseStatusLabels: Record<string, string> = {
		paid: 'Платен',
		unpaid: 'Неплатен'
	};

	function expenseStatusClass(status: string): string {
		return status === 'paid' ? 'status-paid' : 'status-unpaid';
	}
</script>

<svelte:head>
	<title>Отчети: Разходи и прогноза</title>
</svelte:head>

<div class="page-header">
	<h1>Отчети: Разходи и прогноза</h1>
</div>

<!-- Filter bar -->
<form method="GET" class="filter-bar">
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
	<div class="filter-group">
		<label for="categoryId">Категория</label>
		<select id="categoryId" name="categoryId" class="input-sm">
			<option value="">Всички категории</option>
			{#each data.categories as cat}
				<option value={cat.id} selected={data.filters.categoryId === cat.id}>{cat.name}</option>
			{/each}
		</select>
	</div>
	<div class="filter-group">
		<label for="projectId">Проект</label>
		<select id="projectId" name="projectId" class="input-sm">
			<option value="">Всички проекти</option>
			{#each data.projects as proj}
				<option value={proj.id} selected={data.filters.projectId === proj.id}>
					{proj.client.legalName} / {proj.name}
				</option>
			{/each}
		</select>
	</div>
	{#if data.isAdminOrAccountant}
		<div class="filter-group">
			<label for="clientId">Клиент</label>
			<select id="clientId" name="clientId" class="input-sm">
				<option value="">Всички клиенти</option>
				{#each data.clients as client}
					<option value={client.id} selected={data.filters.clientId === client.id}>{client.legalName}</option>
				{/each}
			</select>
		</div>
	{/if}
	<div class="filter-actions">
		<button type="submit" class="btn btn-primary">Приложи</button>
		<a href="/reports/expenses" class="btn btn-secondary">Изчисти</a>
	</div>
</form>

<!-- Summary cards -->
<div class="summary-grid">
	<div class="summary-card">
		<div class="summary-label">Общо разходи</div>
		<div class="summary-value">{formatCents(data.summary.totalActualCents)}</div>
		<div class="summary-hint">Действителни разходи за периода</div>
	</div>
	<div class="summary-card" class:summary-card--warning={data.summary.unpaidActualCents > 0}>
		<div class="summary-label">Неплатени разходи</div>
		<div class="summary-value">{formatCents(data.summary.unpaidActualCents)}</div>
		<div class="summary-hint">Сума на неплатените разходи</div>
	</div>
	<div class="summary-card summary-card--labor">
		<div class="summary-label">Трудов разход</div>
		<div class="summary-value">{formatCents(data.summary.laborCostCents)}</div>
		<div class="summary-hint">Изчислен трудов разход за периода</div>
	</div>
	<div class="summary-card summary-card--forecast">
		<div class="summary-label">Предстоящи повт. разходи (30 дни)</div>
		<div class="summary-value">{formatCents(data.summary.forecast30Cents)}</div>
		<div class="summary-hint">Прогноза за следващите 30 дни</div>
	</div>
</div>

<!-- By-category breakdown -->
{#if data.categoryBreakdown.length > 0}
	<section class="section">
		<h2>Действителни разходи по категория</h2>
		<div class="table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th>Категория</th>
						<th class="text-right">Брой</th>
						<th class="text-right">Обща сума</th>
					</tr>
				</thead>
				<tbody>
					{#each data.categoryBreakdown as row}
						<tr>
							<td>{row.categoryName}</td>
							<td class="text-right">{row.count}</td>
							<td class="text-right">{formatCents(row.totalCents)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}

<!-- Actual expenses list -->
<section class="section">
	<h2>Действителни разходи</h2>
	{#if data.actualExpenses.length === 0}
		<p class="empty-state">Няма разходи за избраните филтри.</p>
	{:else}
		<div class="table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th>Дата</th>
						<th>Описание</th>
						<th>Категория</th>
						<th>Проект / Клиент</th>
						<th class="text-right">Сума</th>
						<th>Статус</th>
					</tr>
				</thead>
				<tbody>
					{#each data.actualExpenses as exp}
						<tr>
							<td class="nowrap">{formatDate(exp.incurredDate)}</td>
							<td>{exp.description}</td>
							<td>{exp.category.name}</td>
							<td>
								{#if exp.project}
									{exp.project.name}
								{:else if exp.client}
									{exp.client.legalName}
								{:else}
									<span class="text-muted">Общ разход</span>
								{/if}
							</td>
							<td class="text-right">{formatCents(exp.amountCents)}</td>
							<td>
								<span class="status-badge {expenseStatusClass(exp.status)}">
									{expenseStatusLabels[exp.status] ?? exp.status}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<!-- Upcoming recurring expenses (next 90 days) -->
<section class="section">
	<h2>Предстоящи повтарящи се разходи <span class="forecast-badge">прогноза · следващи 90 дни</span></h2>
	{#if data.upcomingRecurring.length === 0}
		<p class="empty-state">Няма предстоящи повтарящи се разходи в следващите 90 дни.</p>
	{:else}
		<div class="forecast-totals">
			<span class="forecast-total-item">30 дни: <strong>{formatCents(data.forecast.days30)}</strong></span>
			<span class="forecast-total-item">60 дни: <strong>{formatCents(data.forecast.days60)}</strong></span>
			<span class="forecast-total-item">90 дни: <strong>{formatCents(data.forecast.days90)}</strong></span>
		</div>
		<div class="table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th>Дата</th>
						<th>Описание</th>
						<th>Категория</th>
						<th>Проект / Клиент</th>
						<th class="text-right">Сума</th>
					</tr>
				</thead>
				<tbody>
					{#each data.upcomingRecurring as exp}
						<tr class="forecast-row">
							<td class="nowrap">{formatDate(exp.incurredDate)}</td>
							<td>{exp.description}</td>
							<td>{exp.category.name}</td>
							<td>
								{#if exp.project}
									{exp.project.name}
								{:else if exp.client}
									{exp.client.legalName}
								{:else}
									<span class="text-muted">Общ разход</span>
								{/if}
							</td>
							<td class="text-right">{formatCents(exp.amountCents)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<!-- Labor cost details (admin/accountant only) -->
{#if data.labor.canSeeDetail}
	<section class="section">
		<h2>Трудов разход (детайли)</h2>
		<div class="labor-detail">
			<div class="labor-item">
				<span class="labor-label">Общо часове</span>
				<span class="labor-value">{data.labor.totalHours} ч.</span>
			</div>
			<div class="labor-item">
				<span class="labor-label">Общ трудов разход</span>
				<span class="labor-value">{formatCents(data.labor.laborCostCents)}</span>
			</div>
		</div>
		{#if data.labor.laborCostCents === 0}
			<p class="empty-state">Няма регистрирано работно време с разходна ставка за избрания период.</p>
		{/if}
	</section>
{/if}

<style>
	.page-header {
		margin-bottom: 24px;
	}

	.page-header h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0;
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
		margin-bottom: 32px;
	}

	.summary-card {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 20px;
	}

	.summary-card--warning {
		border-color: #fcd34d;
		background: #fffbeb;
	}

	.summary-card--labor {
		border-color: #c4b5fd;
		background: #faf5ff;
	}

	.summary-card--forecast {
		border-color: #93c5fd;
		background: #eff6ff;
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

	/* Sections */
	.section {
		margin-bottom: 36px;
	}

	.section h2 {
		font-size: 1.0625rem;
		font-weight: 600;
		color: #1e293b;
		margin: 0 0 12px;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.forecast-badge {
		display: inline-block;
		background: #dbeafe;
		color: #1d4ed8;
		font-size: 0.6875rem;
		font-weight: 500;
		padding: 2px 8px;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.forecast-totals {
		display: flex;
		gap: 24px;
		margin-bottom: 12px;
		font-size: 0.875rem;
		color: #475569;
	}

	.forecast-total-item strong {
		color: #0f172a;
		font-weight: 700;
	}

	.forecast-row td {
		color: #374151;
		background: #f8faff;
	}

	.empty-state {
		color: #94a3b8;
		font-size: 0.9375rem;
		padding: 20px 0;
	}

	/* Tables */
	.table-wrap {
		overflow-x: auto;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
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

	.text-right {
		text-align: right;
	}

	.text-muted {
		color: #94a3b8;
		font-style: italic;
	}

	.nowrap {
		white-space: nowrap;
	}

	/* Status badges */
	.status-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.status-paid {
		background: #dcfce7;
		color: #166534;
	}

	.status-unpaid {
		background: #fee2e2;
		color: #991b1b;
	}

	/* Labor detail */
	.labor-detail {
		display: flex;
		gap: 32px;
		background: #faf5ff;
		border: 1px solid #c4b5fd;
		border-radius: 8px;
		padding: 16px 20px;
		margin-bottom: 8px;
	}

	.labor-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.labor-label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: #6d28d9;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.labor-value {
		font-size: 1.25rem;
		font-weight: 700;
		color: #0f172a;
	}
</style>
