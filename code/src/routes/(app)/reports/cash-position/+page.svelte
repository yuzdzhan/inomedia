<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatCents(cents: number): string {
		const sign = cents < 0 ? '-' : '';
		const abs = Math.abs(cents);
		return `${sign}${(abs / 100).toFixed(2)} лв.`;
	}

	function formatDate(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	const entryTypeLabels: Record<string, string> = {
		invoice_payment: 'Плащания по фактури',
		standalone_income: 'Директни приходи',
		expense_payment: 'Платени разходи',
		generic_credit: 'Общи кредити',
		generic_debit: 'Общи дебити',
		transfer_out: 'Трансфери (изходящи)',
		transfer_in: 'Трансфери (входящи)'
	};

	// Group movement rows by entry type across all containers for the summary table
	type SummaryByType = {
		entryType: string;
		bankCents: number;
		cashboxCents: number;
		totalCents: number;
		count: number;
	};

	const summaryByType = $derived.by(() => {
		const map = new Map<string, SummaryByType>();
		for (const row of data.movementRows) {
			const existing = map.get(row.entryType);
			if (existing) {
				if (row.containerType === 'bank') existing.bankCents += row.totalCents;
				else existing.cashboxCents += row.totalCents;
				existing.totalCents += row.totalCents;
				existing.count += row.count;
			} else {
				map.set(row.entryType, {
					entryType: row.entryType,
					bankCents: row.containerType === 'bank' ? row.totalCents : 0,
					cashboxCents: row.containerType === 'cashbox' ? row.totalCents : 0,
					totalCents: row.totalCents,
					count: row.count
				});
			}
		}

		const order = [
			'invoice_payment',
			'standalone_income',
			'expense_payment',
			'generic_credit',
			'generic_debit',
			'transfer_in',
			'transfer_out'
		];
		return [...map.values()].sort(
			(a, b) => order.indexOf(a.entryType) - order.indexOf(b.entryType)
		);
	});

	const totalMovementCents = $derived(summaryByType.reduce((s, r) => s + r.totalCents, 0));
</script>

<svelte:head>
	<title>Парична позиция</title>
</svelte:head>

<div class="page-header">
	<h1>Парична позиция</h1>
	<p class="page-desc">Баланси към избрана дата и история на движенията за период</p>
</div>

<!-- As-of date and period filter -->
<section class="filter-section">
	<form method="GET" class="filter-bar">
		<div class="filter-group">
			<label for="asOfDate">Баланс към дата</label>
			<input
				id="asOfDate"
				type="date"
				name="asOfDate"
				value={data.filters.asOfDate}
				class="filter-input"
			/>
		</div>

		<div class="filter-divider"></div>

		<div class="filter-group">
			<label for="dateFrom">Движения от</label>
			<input
				id="dateFrom"
				type="date"
				name="dateFrom"
				value={data.filters.dateFrom}
				class="filter-input"
			/>
		</div>

		<div class="filter-group">
			<label for="dateTo">до</label>
			<input
				id="dateTo"
				type="date"
				name="dateTo"
				value={data.filters.dateTo}
				class="filter-input"
			/>
		</div>

		<div class="filter-actions">
			<button type="submit" class="btn btn-primary">Приложи</button>
			<a href="/reports/cash-position" class="btn btn-secondary">Изчисти</a>
		</div>
	</form>
</section>

<!-- Balance Cards -->
<div class="balance-grid">
	{#if data.bank}
		<div class="balance-card" class:negative={data.bank.balanceCents < 0}>
			<div class="balance-label">Банкова сметка</div>
			<div class="balance-amount" class:negative-amount={data.bank.balanceCents < 0}>
				{formatCents(data.bank.balanceCents)}
			</div>
			{#if data.bank.balanceCents < 0}
				<span class="negative-badge">Отрицателно салдо</span>
			{/if}
			<div class="balance-meta">към {formatDate(data.filters.asOfDate)}</div>
		</div>
	{/if}

	{#if data.cashbox}
		<div class="balance-card" class:negative={data.cashbox.balanceCents < 0}>
			<div class="balance-label">Каса</div>
			<div class="balance-amount" class:negative-amount={data.cashbox.balanceCents < 0}>
				{formatCents(data.cashbox.balanceCents)}
			</div>
			{#if data.cashbox.balanceCents < 0}
				<span class="negative-badge">Отрицателно салдо</span>
			{/if}
			<div class="balance-meta">към {formatDate(data.filters.asOfDate)}</div>
		</div>
	{/if}

	<div class="balance-card combined" class:negative={data.combinedBalanceCents < 0}>
		<div class="balance-label">Обща позиция</div>
		<div class="balance-amount" class:negative-amount={data.combinedBalanceCents < 0}>
			{formatCents(data.combinedBalanceCents)}
		</div>
		{#if data.combinedBalanceCents < 0}
			<span class="negative-badge">Отрицателно салдо</span>
		{/if}
		<div class="balance-meta">Банка + Каса към {formatDate(data.filters.asOfDate)}</div>
	</div>
</div>

<!-- Movement Breakdown -->
<section class="report-section">
	<h2>
		Разбивка по тип
		{#if data.filters.dateFrom || data.filters.dateTo}
			<span class="period-label">
				({data.filters.dateFrom ? formatDate(data.filters.dateFrom) : '—'} →
				{data.filters.dateTo ? formatDate(data.filters.dateTo) : 'днес'})
			</span>
		{/if}
	</h2>

	{#if summaryByType.length === 0}
		<p class="empty-state">Няма движения за избрания период.</p>
	{:else}
		<table class="report-table">
			<thead>
				<tr>
					<th>Тип движение</th>
					<th class="amount-col">Банка</th>
					<th class="amount-col">Каса</th>
					<th class="amount-col">Общо</th>
					<th class="count-col">Брой</th>
				</tr>
			</thead>
			<tbody>
				{#each summaryByType as row}
					<tr>
						<td>
							<span
								class="type-badge"
								class:credit={row.totalCents > 0}
								class:debit={row.totalCents < 0}
								class:neutral={row.entryType === 'transfer_in' || row.entryType === 'transfer_out'}
							>
								{entryTypeLabels[row.entryType] ?? row.entryType}
							</span>
						</td>
						<td class="amount-col" class:positive={row.bankCents > 0} class:negative-text={row.bankCents < 0}>
							{row.bankCents !== 0 ? formatCents(row.bankCents) : '—'}
						</td>
						<td class="amount-col" class:positive={row.cashboxCents > 0} class:negative-text={row.cashboxCents < 0}>
							{row.cashboxCents !== 0 ? formatCents(row.cashboxCents) : '—'}
						</td>
						<td class="amount-col" class:positive={row.totalCents > 0} class:negative-text={row.totalCents < 0}>
							{formatCents(row.totalCents)}
						</td>
						<td class="count-col">{row.count}</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr class="total-row">
					<td><strong>Нетно движение</strong></td>
					<td class="amount-col"></td>
					<td class="amount-col"></td>
					<td class="amount-col" class:positive={totalMovementCents > 0} class:negative-text={totalMovementCents < 0}>
						<strong>{formatCents(totalMovementCents)}</strong>
					</td>
					<td class="count-col"></td>
				</tr>
			</tfoot>
		</table>

		<p class="transfer-note">
			* Трансферите не влияят на общата позиция, но са включени в баланса.
		</p>
	{/if}
</section>

<!-- Full Ledger Table -->
<section class="report-section">
	<h2>
		Детайлни движения
		{#if data.filters.dateFrom || data.filters.dateTo}
			<span class="period-label">
				({data.filters.dateFrom ? formatDate(data.filters.dateFrom) : '—'} →
				{data.filters.dateTo ? formatDate(data.filters.dateTo) : 'днес'})
			</span>
		{/if}
	</h2>

	{#if data.ledgerEntries.length === 0}
		<p class="empty-state">Няма движения за избрания период.</p>
	{:else}
		<table class="report-table ledger-table">
			<thead>
				<tr>
					<th>Дата</th>
					<th>Сметка</th>
					<th>Тип</th>
					<th>Описание</th>
					<th class="amount-col">Сума</th>
					<th class="amount-col">Салдо</th>
				</tr>
			</thead>
			<tbody>
				{#each data.ledgerEntries as entry}
					<tr>
						<td class="date-col">{formatDate(entry.entryDate)}</td>
						<td>
							<span class="container-badge" class:bank={entry.containerType === 'bank'} class:cashbox={entry.containerType === 'cashbox'}>
								{entry.containerName}
							</span>
						</td>
						<td>
							<span
								class="type-badge"
								class:credit={entry.amountCents > 0}
								class:debit={entry.amountCents < 0}
								class:neutral={entry.entryType === 'transfer_in' || entry.entryType === 'transfer_out'}
							>
								{entryTypeLabels[entry.entryType] ?? entry.entryType}
							</span>
						</td>
						<td class="desc-col">{entry.description}</td>
						<td class="amount-col" class:positive={entry.amountCents > 0} class:negative-text={entry.amountCents < 0}>
							{formatCents(entry.amountCents)}
						</td>
						<td class="amount-col" class:positive={entry.runningBalanceCents > 0} class:negative-text={entry.runningBalanceCents < 0}>
							{formatCents(entry.runningBalanceCents)}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
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
		margin: 0 0 4px 0;
	}

	.page-desc {
		font-size: 0.875rem;
		color: #64748b;
		margin: 0;
	}

	/* Filter bar */
	.filter-section {
		margin-bottom: 28px;
	}

	.filter-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		align-items: flex-end;
		padding: 16px 20px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.filter-group label {
		font-size: 0.75rem;
		font-weight: 600;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.filter-input {
		padding: 7px 10px;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		font-size: 0.875rem;
		font-family: inherit;
		background: white;
		color: #0f172a;
	}

	.filter-divider {
		width: 1px;
		background: #e2e8f0;
		align-self: stretch;
		margin: 0 4px;
	}

	.filter-actions {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}

	/* Balance cards */
	.balance-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 20px;
		margin-bottom: 32px;
	}

	.balance-card {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 24px;
	}

	.balance-card.negative {
		border-color: #fca5a5;
		background: #fff5f5;
	}

	.balance-card.combined {
		border-color: #bfdbfe;
		background: #eff6ff;
	}

	.balance-card.combined.negative {
		border-color: #fca5a5;
		background: #fff5f5;
	}

	.balance-label {
		font-size: 0.8125rem;
		font-weight: 600;
		text-transform: uppercase;
		color: #64748b;
		letter-spacing: 0.05em;
		margin-bottom: 10px;
	}

	.balance-amount {
		font-size: 1.875rem;
		font-weight: 700;
		color: #0f172a;
		margin-bottom: 6px;
	}

	.balance-amount.negative-amount {
		color: #dc2626;
	}

	.negative-badge {
		display: inline-block;
		font-size: 0.7rem;
		font-weight: 600;
		background: #fee2e2;
		color: #dc2626;
		border: 1px solid #fca5a5;
		border-radius: 4px;
		padding: 2px 7px;
		margin-bottom: 6px;
	}

	.balance-meta {
		font-size: 0.8125rem;
		color: #94a3b8;
		margin-top: 4px;
	}

	/* Report sections */
	.report-section {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 24px;
		margin-bottom: 24px;
	}

	.report-section h2 {
		font-size: 1.0625rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0 0 16px 0;
	}

	.period-label {
		font-size: 0.875rem;
		font-weight: 400;
		color: #64748b;
	}

	.empty-state {
		color: #94a3b8;
		font-size: 0.9375rem;
		text-align: center;
		padding: 24px 0;
	}

	.transfer-note {
		font-size: 0.8125rem;
		color: #94a3b8;
		margin-top: 12px;
		margin-bottom: 0;
	}

	/* Tables */
	.report-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.report-table th {
		text-align: left;
		padding: 8px 12px;
		font-size: 0.8125rem;
		font-weight: 600;
		color: #64748b;
		border-bottom: 2px solid #e2e8f0;
	}

	.report-table td {
		padding: 10px 12px;
		border-bottom: 1px solid #f1f5f9;
		color: #1e293b;
		vertical-align: middle;
	}

	.report-table tr:last-child td {
		border-bottom: none;
	}

	.report-table tfoot td {
		border-top: 2px solid #e2e8f0;
		border-bottom: none;
		padding-top: 12px;
	}

	.total-row td {
		background: #f8fafc;
	}

	.amount-col {
		text-align: right;
		white-space: nowrap;
	}

	.count-col {
		text-align: center;
		color: #64748b;
		white-space: nowrap;
	}

	.date-col {
		white-space: nowrap;
	}

	.desc-col {
		max-width: 300px;
	}

	/* Colours */
	.positive {
		color: #15803d;
		font-weight: 600;
	}

	.negative-text {
		color: #dc2626;
		font-weight: 600;
	}

	/* Type badges */
	.type-badge {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 4px;
		background: #f1f5f9;
		color: #475569;
	}

	.type-badge.credit {
		background: #dcfce7;
		color: #15803d;
	}

	.type-badge.debit {
		background: #fee2e2;
		color: #b91c1c;
	}

	.type-badge.neutral {
		background: #fef9c3;
		color: #854d0e;
	}

	/* Container badges */
	.container-badge {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 4px;
		background: #f1f5f9;
		color: #475569;
	}

	.container-badge.bank {
		background: #eff6ff;
		color: #1d4ed8;
	}

	.container-badge.cashbox {
		background: #f0fdf4;
		color: #15803d;
	}

	/* Buttons */
	.btn {
		padding: 8px 18px;
		border: none;
		border-radius: 6px;
		font-size: 0.9375rem;
		font-family: inherit;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
	}

	.btn-primary {
		background: #2563eb;
		color: #fff;
	}

	.btn-primary:hover {
		background: #1d4ed8;
	}

	.btn-secondary {
		background: #f1f5f9;
		color: #374151;
		border: 1px solid #cbd5e1;
	}

	.btn-secondary:hover {
		background: #e2e8f0;
	}
</style>
