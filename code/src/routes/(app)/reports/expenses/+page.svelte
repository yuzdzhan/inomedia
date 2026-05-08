<script lang="ts">
	import type { PageData } from './$types';
	import { fmtDate as formatDate } from '$lib/utils/format';

	let { data }: { data: PageData } = $props();

	function formatCents(cents: number): string {
		return (cents / 100).toFixed(2) + ' EUR';
	}


	const expenseStatusLabels: Record<string, string> = {
		paid: 'Платен',
		unpaid: 'Неплатен'
	};
</script>

<svelte:head>
	<title>Отчети: Разходи – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Отчети: Разходи и прогноза</h1>
		<p class="page-sub">Действителни разходи и прогноза за повтарящи се плащания</p>
	</div>
</div>

<!-- Filter bar -->
<form method="GET" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:16px;">
	<input class="input" type="date" name="dateFrom" value={data.filters.dateFrom} style="width:140px;" title="От дата" />
	<input class="input" type="date" name="dateTo" value={data.filters.dateTo} style="width:140px;" title="До дата" />
	<select class="select" name="categoryId" style="width:auto;">
		<option value="">Всички категории</option>
		{#each data.categories as cat}
			<option value={cat.id} selected={data.filters.categoryId === cat.id}>{cat.name}</option>
		{/each}
	</select>
	<select class="select" name="projectId" style="width:auto;">
		<option value="">Всички проекти</option>
		{#each data.projects as proj}
			<option value={proj.id} selected={data.filters.projectId === proj.id}>{proj.client.legalName} / {proj.name}</option>
		{/each}
	</select>
	{#if data.isAdminOrAccountant}
		<select class="select" name="clientId" style="width:auto;">
			<option value="">Всички клиенти</option>
			{#each data.clients as client}
				<option value={client.id} selected={data.filters.clientId === client.id}>{client.legalName}</option>
			{/each}
		</select>
	{/if}
	<button type="submit" class="btn btn-secondary btn-sm">Приложи</button>
	<a href="/reports/expenses" class="btn btn-ghost btn-sm">Изчисти</a>
</form>

<!-- Summary stats -->
<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px;">
	<div class="stat" style="padding:14px;">
		<div class="stat-label">Общо разходи</div>
		<div class="amount" style="font-size:20px; font-weight:500;">{formatCents(data.summary.totalActualCents)}</div>
		<div class="muted" style="font-size:11px;">Действителни разходи за периода</div>
	</div>
	<div class="stat" style="padding:14px;">
		<div class="stat-label">Неплатени разходи</div>
		<div class="amount" style="font-size:20px; font-weight:500;">{formatCents(data.summary.unpaidActualCents)}</div>
		<div class="muted" style="font-size:11px;">Сума на неплатените разходи</div>
	</div>
	<div class="stat" style="padding:14px;">
		<div class="stat-label">Трудов разход</div>
		<div class="amount" style="font-size:20px; font-weight:500;">{formatCents(data.summary.laborCostCents)}</div>
		<div class="muted" style="font-size:11px;">Изчислен трудов разход за периода</div>
	</div>
	<div class="stat" style="padding:14px;">
		<div class="stat-label">Прогноза 30 дни</div>
		<div class="amount" style="font-size:20px; font-weight:500;">{formatCents(data.summary.forecast30Cents)}</div>
		<div class="muted" style="font-size:11px;">Предстоящи повтарящи се разходи</div>
	</div>
</div>

<!-- Category breakdown -->
{#if data.categoryBreakdown.length > 0}
	<div class="card" style="margin-bottom:16px;">
		<div class="card-header">
			<h3 class="card-title">Разходи по категория</h3>
		</div>
		<table class="tbl">
			<thead>
				<tr>
					<th>Категория</th>
					<th style="text-align:right;">Брой</th>
					<th style="text-align:right;">Обща сума</th>
				</tr>
			</thead>
			<tbody>
				{#each data.categoryBreakdown as row}
					<tr>
						<td style="font-size:13px;">{row.categoryName}</td>
						<td class="amount muted" style="text-align:right;">{row.count}</td>
						<td class="amount" style="text-align:right;">{formatCents(row.totalCents)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<!-- Actual expenses -->
<div class="card" style="margin-bottom:16px;">
	<div class="card-header">
		<h3 class="card-title">Действителни разходи</h3>
	</div>
	<table class="tbl">
		<thead>
			<tr>
				<th>Дата</th>
				<th>Описание</th>
				<th>Категория</th>
				<th>Проект / Клиент</th>
				<th style="text-align:right;">Сума</th>
				<th>Статус</th>
			</tr>
		</thead>
		<tbody>
			{#each data.actualExpenses as exp}
				<tr>
					<td class="muted" style="font-size:12px; white-space:nowrap;">{formatDate(exp.incurredDate)}</td>
					<td style="font-size:13px;">{exp.description}</td>
					<td class="muted" style="font-size:12px;">{exp.category.name}</td>
					<td class="muted" style="font-size:12px;">
						{#if exp.project}{exp.project.name}
						{:else if exp.client}{exp.client.legalName}
						{:else}—
						{/if}
					</td>
					<td class="amount" style="text-align:right;">{formatCents(exp.amountCents)}</td>
					<td>
						<span class="badge {exp.status === 'paid' ? 'task-done' : 'task-cancelled'}" style="font-size:10px;">
							{expenseStatusLabels[exp.status] ?? exp.status}
						</span>
					</td>
				</tr>
			{/each}
			{#if data.actualExpenses.length === 0}
				<tr><td colspan="6" style="text-align:center; padding:32px 16px; color:var(--text-muted);">Няма разходи за избраните филтри.</td></tr>
			{/if}
		</tbody>
	</table>
</div>

<!-- Upcoming recurring -->
<div class="card" style="margin-bottom:16px;">
	<div class="card-header">
		<div>
			<h3 class="card-title">Предстоящи повтарящи се разходи</h3>
			<div class="card-sub">Прогноза · следващите 90 дни</div>
		</div>
		{#if data.upcomingRecurring.length > 0}
			<div class="row gap-3 muted" style="font-size:12px;">
				<span>30д: <strong class="amount" style="color:var(--text);">{formatCents(data.forecast.days30)}</strong></span>
				<span>60д: <strong class="amount" style="color:var(--text);">{formatCents(data.forecast.days60)}</strong></span>
				<span>90д: <strong class="amount" style="color:var(--text);">{formatCents(data.forecast.days90)}</strong></span>
			</div>
		{/if}
	</div>
	<table class="tbl">
		<thead>
			<tr>
				<th>Дата</th>
				<th>Описание</th>
				<th>Категория</th>
				<th>Проект / Клиент</th>
				<th style="text-align:right;">Сума</th>
			</tr>
		</thead>
		<tbody>
			{#each data.upcomingRecurring as exp}
				<tr style="background:var(--accent-subtle);">
					<td class="muted" style="font-size:12px; white-space:nowrap;">{formatDate(exp.incurredDate)}</td>
					<td style="font-size:13px;">{exp.description}</td>
					<td class="muted" style="font-size:12px;">{exp.category.name}</td>
					<td class="muted" style="font-size:12px;">
						{#if exp.project}{exp.project.name}
						{:else if exp.client}{exp.client.legalName}
						{:else}—
						{/if}
					</td>
					<td class="amount" style="text-align:right;">{formatCents(exp.amountCents)}</td>
				</tr>
			{/each}
			{#if data.upcomingRecurring.length === 0}
				<tr><td colspan="5" style="text-align:center; padding:32px 16px; color:var(--text-muted);">Няма предстоящи повтарящи се разходи в следващите 90 дни.</td></tr>
			{/if}
		</tbody>
	</table>
</div>

<!-- Labor details -->
{#if data.labor.canSeeDetail}
	<div class="card">
		<div class="card-header">
			<h3 class="card-title">Трудов разход (детайли)</h3>
		</div>
		<div style="padding:16px; display:flex; gap:32px;">
			<div>
				<div class="stat-label">Общо часове</div>
				<div class="amount" style="font-size:20px; font-weight:500;">{data.labor.totalHours} ч.</div>
			</div>
			<div>
				<div class="stat-label">Общ трудов разход</div>
				<div class="amount" style="font-size:20px; font-weight:500;">{formatCents(data.labor.laborCostCents)}</div>
			</div>
		</div>
		{#if data.labor.laborCostCents === 0}
			<div class="muted" style="padding:0 16px 16px; font-size:13px;">Няма регистрирано работно време с разходна ставка за избрания период.</div>
		{/if}
	</div>
{/if}
