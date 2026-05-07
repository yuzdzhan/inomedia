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

	const statusLabels: Record<string, string> = {
		issued: 'Издадена',
		partially_paid: 'Частично платена',
		paid: 'Платена',
		overdue: 'Просрочена',
		voided: 'Анулирана'
	};

	const paymentMethodLabels: Record<string, string> = {
		bank_transfer: 'Банков превод',
		cash: 'В брой'
	};

	function statusClass(status: string): string {
		const map: Record<string, string> = {
			issued: 'status-issued',
			partially_paid: 'status-partial',
			paid: 'status-paid',
			overdue: 'status-overdue',
			voided: 'status-voided'
		};
		return map[status] ?? '';
	}

	// Filter values are read directly from data.filters (URL-driven)
</script>

<svelte:head>
	<title>Отчети: Фактуриране</title>
</svelte:head>

<div class="page-header">
	<h1>Отчети: Фактуриране</h1>
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
		<label for="clientId">Клиент</label>
		<select id="clientId" name="clientId" class="input-sm">
			<option value="">Всички клиенти</option>
			{#each data.clients as client}
				<option value={client.id} selected={data.filters.clientId === client.id}>{client.legalName}</option>
			{/each}
		</select>
	</div>
	<div class="filter-group">
		<label for="status">Статус</label>
		<select id="status" name="status" class="input-sm">
			<option value="">Всички статуси</option>
			<option value="issued" selected={data.filters.status === 'issued'}>Издадена</option>
			<option value="partially_paid" selected={data.filters.status === 'partially_paid'}>Частично платена</option>
			<option value="paid" selected={data.filters.status === 'paid'}>Платена</option>
			<option value="overdue" selected={data.filters.status === 'overdue'}>Просрочена</option>
		</select>
	</div>
	<div class="filter-actions">
		<button type="submit" class="btn btn-primary">Приложи</button>
		<a href="/reports/billing" class="btn btn-secondary">Изчисти</a>
	</div>
</form>

<!-- Summary cards -->
<div class="summary-grid">
	<div class="summary-card">
		<div class="summary-label">Издадени приходи</div>
		<div class="summary-value">{formatCents(data.summary.issuedGrossCents)}</div>
		<div class="summary-hint">Брутна сума по издадени фактури</div>
	</div>
	<div class="summary-card summary-card--positive">
		<div class="summary-label">Събрани приходи</div>
		<div class="summary-value">{formatCents(data.summary.collectedCents)}</div>
		<div class="summary-hint">Реално постъпили плащания</div>
	</div>
	<div class="summary-card" class:summary-card--warning={data.summary.outstandingCents > 0}>
		<div class="summary-label">Незавършени плащания</div>
		<div class="summary-value">{formatCents(data.summary.outstandingCents)}</div>
		<div class="summary-hint">Разлика между издадено и събрано</div>
	</div>
	<div class="summary-card" class:summary-card--danger={data.summary.overdueCount > 0}>
		<div class="summary-label">Просрочени фактури</div>
		<div class="summary-value">{data.summary.overdueCount}</div>
		<div class="summary-hint">Брой просрочени фактури</div>
	</div>
</div>

<!-- Per-client breakdown -->
{#if data.clientBreakdown.length > 0}
	<section class="section">
		<h2>Разбивка по клиент</h2>
		<div class="table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th>Клиент</th>
						<th class="text-right">Издадено</th>
						<th class="text-right">Събрано</th>
						<th class="text-right">Остатък</th>
					</tr>
				</thead>
				<tbody>
					{#each data.clientBreakdown as row}
						<tr>
							<td>{row.legalName}</td>
							<td class="text-right">{formatCents(row.issuedCents)}</td>
							<td class="text-right">{formatCents(row.collectedCents)}</td>
							<td class="text-right" class:text-warning={row.outstandingCents > 0}>
								{formatCents(row.outstandingCents)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}

<!-- Invoice list -->
<section class="section">
	<h2>Фактури</h2>
	{#if data.invoices.length === 0}
		<p class="empty-state">Няма фактури за избраните филтри.</p>
	{:else}
		<div class="table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th>#</th>
						<th>Дата</th>
						<th>Клиент</th>
						<th>Статус</th>
						<th class="text-right">Брутна сума</th>
						<th class="text-right">Платено</th>
					</tr>
				</thead>
				<tbody>
					{#each data.invoices as invoice}
						<tr>
							<td class="mono">{invoice.invoiceNumber ?? '—'}</td>
							<td>{formatDate(invoice.issueDate)}</td>
							<td>{invoice.client.legalName}</td>
							<td>
								<span class="status-badge {statusClass(invoice.status)}">
									{statusLabels[invoice.status] ?? invoice.status}
								</span>
							</td>
							<td class="text-right">{formatCents(invoice.grossTotalCents)}</td>
							<td class="text-right">{formatCents(invoice.paidTotalCents)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<!-- Payment list -->
<section class="section">
	<h2>Плащания</h2>
	{#if data.payments.length === 0}
		<p class="empty-state">Няма плащания за избраните филтри.</p>
	{:else}
		<div class="table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th>Дата</th>
						<th>Фактура #</th>
						<th>Клиент</th>
						<th class="text-right">Сума</th>
						<th>Метод</th>
					</tr>
				</thead>
				<tbody>
					{#each data.payments as payment}
						<tr>
							<td>{formatDate(payment.paymentDate)}</td>
							<td class="mono">{payment.invoice.invoiceNumber ?? '—'}</td>
							<td>{payment.invoice.client.legalName}</td>
							<td class="text-right">{formatCents(payment.amountCents)}</td>
							<td>{paymentMethodLabels[payment.paymentMethod] ?? payment.paymentMethod}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

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

	.summary-card--positive {
		border-color: #86efac;
		background: #f0fdf4;
	}

	.summary-card--warning {
		border-color: #fcd34d;
		background: #fffbeb;
	}

	.summary-card--danger {
		border-color: #fca5a5;
		background: #fef2f2;
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

	.text-warning {
		color: #d97706;
		font-weight: 600;
	}

	.mono {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.8125rem;
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

	.status-issued {
		background: #dbeafe;
		color: #1d4ed8;
	}

	.status-partial {
		background: #fef3c7;
		color: #92400e;
	}

	.status-paid {
		background: #dcfce7;
		color: #166534;
	}

	.status-overdue {
		background: #fee2e2;
		color: #991b1b;
	}

	.status-voided {
		background: #f1f5f9;
		color: #64748b;
	}
</style>
