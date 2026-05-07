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
		const order = ['invoice_payment','standalone_income','expense_payment','generic_credit','generic_debit','transfer_in','transfer_out'];
		return [...map.values()].sort((a, b) => order.indexOf(a.entryType) - order.indexOf(b.entryType));
	});

	const totalMovementCents = $derived(summaryByType.reduce((s, r) => s + r.totalCents, 0));

	function typeBadgeCls(entryType: string, totalCents: number): string {
		if (entryType === 'transfer_in' || entryType === 'transfer_out') return 'badge outline';
		return totalCents > 0 ? 'badge task-done' : 'badge task-cancelled';
	}
</script>

<svelte:head>
	<title>Парична позиция – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Парична позиция</h1>
		<p class="page-sub">Баланси към избрана дата и история на движенията за период</p>
	</div>
</div>

<!-- Filter bar -->
<form method="GET" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:16px;">
	<div>
		<div class="label" style="margin-bottom:4px; font-size:11px;">Баланс към дата</div>
		<input class="input" type="date" name="asOfDate" value={data.filters.asOfDate} style="width:140px;" />
	</div>
	<div style="width:1px; background:var(--border); align-self:stretch; margin:0 4px;"></div>
	<div>
		<div class="label" style="margin-bottom:4px; font-size:11px;">Движения от</div>
		<input class="input" type="date" name="dateFrom" value={data.filters.dateFrom} style="width:140px;" />
	</div>
	<div>
		<div class="label" style="margin-bottom:4px; font-size:11px;">до</div>
		<input class="input" type="date" name="dateTo" value={data.filters.dateTo} style="width:140px;" />
	</div>
	<button type="submit" class="btn btn-secondary btn-sm" style="align-self:flex-end;">Приложи</button>
	<a href="/reports/cash-position" class="btn btn-ghost btn-sm" style="align-self:flex-end;">Изчисти</a>
</form>

<!-- Balance cards -->
<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; margin-bottom:20px;">
	{#if data.bank}
		<div class="stat" style="padding:16px;">
			<div class="stat-label">Банкова сметка</div>
			<div class="amount" style="font-size:24px; font-weight:600; color:{data.bank.balanceCents < 0 ? 'var(--danger)' : 'var(--text)'};">
				{formatCents(data.bank.balanceCents)}
			</div>
			{#if data.bank.balanceCents < 0}
				<span class="badge task-cancelled" style="font-size:10px; margin-top:4px; display:inline-block;">Отрицателно салдо</span>
			{/if}
			<div class="muted" style="font-size:11px; margin-top:4px;">към {formatDate(data.filters.asOfDate)}</div>
		</div>
	{/if}
	{#if data.cashbox}
		<div class="stat" style="padding:16px;">
			<div class="stat-label">Каса</div>
			<div class="amount" style="font-size:24px; font-weight:600; color:{data.cashbox.balanceCents < 0 ? 'var(--danger)' : 'var(--text)'};">
				{formatCents(data.cashbox.balanceCents)}
			</div>
			{#if data.cashbox.balanceCents < 0}
				<span class="badge task-cancelled" style="font-size:10px; margin-top:4px; display:inline-block;">Отрицателно салдо</span>
			{/if}
			<div class="muted" style="font-size:11px; margin-top:4px;">към {formatDate(data.filters.asOfDate)}</div>
		</div>
	{/if}
	<div class="stat" style="padding:16px; border-color:var(--accent); background:var(--accent-subtle);">
		<div class="stat-label">Обща позиция</div>
		<div class="amount" style="font-size:24px; font-weight:600; color:{data.combinedBalanceCents < 0 ? 'var(--danger)' : 'var(--accent)'};">
			{formatCents(data.combinedBalanceCents)}
		</div>
		{#if data.combinedBalanceCents < 0}
			<span class="badge task-cancelled" style="font-size:10px; margin-top:4px; display:inline-block;">Отрицателно салдо</span>
		{/if}
		<div class="muted" style="font-size:11px; margin-top:4px;">Банка + Каса към {formatDate(data.filters.asOfDate)}</div>
	</div>
</div>

<!-- Movement breakdown -->
<div class="card" style="margin-bottom:16px;">
	<div class="card-header">
		<div>
			<h3 class="card-title">Разбивка по тип</h3>
			{#if data.filters.dateFrom || data.filters.dateTo}
				<div class="card-sub">
					{data.filters.dateFrom ? formatDate(data.filters.dateFrom) : '—'} →
					{data.filters.dateTo ? formatDate(data.filters.dateTo) : 'днес'}
				</div>
			{/if}
		</div>
	</div>
	{#if summaryByType.length === 0}
		<div style="padding:32px 16px; text-align:center; color:var(--text-muted);">Няма движения за избрания период.</div>
	{:else}
		<table class="tbl">
			<thead>
				<tr>
					<th>Тип движение</th>
					<th style="text-align:right;">Банка</th>
					<th style="text-align:right;">Каса</th>
					<th style="text-align:right;">Общо</th>
					<th style="text-align:center;">Брой</th>
				</tr>
			</thead>
			<tbody>
				{#each summaryByType as row}
					<tr>
						<td>
							<span class="{typeBadgeCls(row.entryType, row.totalCents)}" style="font-size:10px;">
								{entryTypeLabels[row.entryType] ?? row.entryType}
							</span>
						</td>
						<td class="amount" style="text-align:right; color:{row.bankCents > 0 ? 'var(--success)' : row.bankCents < 0 ? 'var(--danger)' : 'var(--text-muted)'};">
							{row.bankCents !== 0 ? formatCents(row.bankCents) : '—'}
						</td>
						<td class="amount" style="text-align:right; color:{row.cashboxCents > 0 ? 'var(--success)' : row.cashboxCents < 0 ? 'var(--danger)' : 'var(--text-muted)'};">
							{row.cashboxCents !== 0 ? formatCents(row.cashboxCents) : '—'}
						</td>
						<td class="amount" style="text-align:right; font-weight:600; color:{row.totalCents > 0 ? 'var(--success)' : row.totalCents < 0 ? 'var(--danger)' : 'var(--text)'};">
							{formatCents(row.totalCents)}
						</td>
						<td class="muted" style="text-align:center; font-size:12px;">{row.count}</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr style="border-top:2px solid var(--border); background:var(--surface);">
					<td style="font-size:13px; font-weight:600;">Нетно движение</td>
					<td></td>
					<td></td>
					<td class="amount" style="text-align:right; font-weight:700; color:{totalMovementCents > 0 ? 'var(--success)' : totalMovementCents < 0 ? 'var(--danger)' : 'var(--text)'};">
						{formatCents(totalMovementCents)}
					</td>
					<td></td>
				</tr>
			</tfoot>
		</table>
		<div class="muted" style="font-size:11px; padding:8px 16px;">* Трансферите не влияят на общата позиция, но са включени в баланса.</div>
	{/if}
</div>

<!-- Detailed ledger -->
<div class="card">
	<div class="card-header">
		<div>
			<h3 class="card-title">Детайлни движения</h3>
			{#if data.filters.dateFrom || data.filters.dateTo}
				<div class="card-sub">
					{data.filters.dateFrom ? formatDate(data.filters.dateFrom) : '—'} →
					{data.filters.dateTo ? formatDate(data.filters.dateTo) : 'днес'}
				</div>
			{/if}
		</div>
	</div>
	{#if data.ledgerEntries.length === 0}
		<div style="padding:32px 16px; text-align:center; color:var(--text-muted);">Няма движения за избрания период.</div>
	{:else}
		<table class="tbl">
			<thead>
				<tr>
					<th>Дата</th>
					<th>Сметка</th>
					<th>Тип</th>
					<th>Описание</th>
					<th style="text-align:right;">Сума</th>
					<th style="text-align:right;">Салдо</th>
				</tr>
			</thead>
			<tbody>
				{#each data.ledgerEntries as entry}
					<tr>
						<td class="muted amount" style="font-size:12px; white-space:nowrap;">{formatDate(entry.entryDate)}</td>
						<td>
							<span class="badge {entry.containerType === 'bank' ? 'task-progress' : 'task-done'}" style="font-size:10px;">{entry.containerName}</span>
						</td>
						<td>
							<span class="{typeBadgeCls(entry.entryType, entry.amountCents)}" style="font-size:10px;">
								{entryTypeLabels[entry.entryType] ?? entry.entryType}
							</span>
						</td>
						<td style="font-size:13px; max-width:260px;">{entry.description}</td>
						<td class="amount" style="text-align:right; font-weight:600; white-space:nowrap; color:{entry.amountCents > 0 ? 'var(--success)' : 'var(--danger)'};">
							{formatCents(entry.amountCents)}
						</td>
						<td class="amount" style="text-align:right; white-space:nowrap; color:{entry.runningBalanceCents >= 0 ? 'var(--text)' : 'var(--danger)'};">
							{formatCents(entry.runningBalanceCents)}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
