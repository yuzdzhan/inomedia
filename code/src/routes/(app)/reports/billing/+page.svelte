<script lang="ts">
	import type { PageData } from './$types';
	import { fmtDate as formatDate } from '$lib/utils/format';

	let { data }: { data: PageData } = $props();

	function formatCents(cents: number): string {
		return (cents / 100).toFixed(2) + ' EUR';
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

	function invoiceBadgeCls(status: string): string {
		const map: Record<string, string> = {
			issued: 'badge task-progress',
			partially_paid: 'badge task-todo',
			paid: 'badge task-done',
			overdue: 'badge task-cancelled',
			voided: 'badge outline'
		};
		return map[status] ?? 'badge outline';
	}
</script>

<svelte:head>
	<title>Отчети: Фактуриране – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Отчети: Фактуриране</h1>
		<p class="page-sub">Преглед на фактури и плащания</p>
	</div>
</div>

<!-- Filter bar -->
<form method="GET" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:16px;">
	<input class="input" type="date" name="dateFrom" value={data.filters.dateFrom} style="width:140px;" title="От дата" />
	<input class="input" type="date" name="dateTo" value={data.filters.dateTo} style="width:140px;" title="До дата" />
	<select class="select" name="clientId" style="width:auto;">
		<option value="">Всички клиенти</option>
		{#each data.clients as client}
			<option value={client.id} selected={data.filters.clientId === client.id}>{client.legalName}</option>
		{/each}
	</select>
	<select class="select" name="status" style="width:auto;">
		<option value="">Всички статуси</option>
		<option value="issued" selected={data.filters.status === 'issued'}>Издадена</option>
		<option value="partially_paid" selected={data.filters.status === 'partially_paid'}>Частично платена</option>
		<option value="paid" selected={data.filters.status === 'paid'}>Платена</option>
		<option value="overdue" selected={data.filters.status === 'overdue'}>Просрочена</option>
	</select>
	<button type="submit" class="btn btn-secondary btn-sm">Приложи</button>
	<a href="/reports/billing" class="btn btn-ghost btn-sm">Изчисти</a>
</form>

<!-- Summary stats -->
<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px;">
	<div class="stat" style="padding:14px;">
		<div class="stat-label">Издадени приходи</div>
		<div class="amount" style="font-size:20px; font-weight:500;">{formatCents(data.summary.issuedGrossCents)}</div>
		<div class="muted" style="font-size:11px;">Брутна сума по издадени фактури</div>
	</div>
	<div class="stat" style="padding:14px;">
		<div class="stat-label">Събрани приходи</div>
		<div class="amount" style="font-size:20px; font-weight:500; color:var(--success);">{formatCents(data.summary.collectedCents)}</div>
		<div class="muted" style="font-size:11px;">Реално постъпили плащания</div>
	</div>
	<div class="stat" style="padding:14px;">
		<div class="stat-label">Незавършени плащания</div>
		<div class="amount" style="font-size:20px; font-weight:500;">{formatCents(data.summary.outstandingCents)}</div>
		<div class="muted" style="font-size:11px;">Разлика между издадено и събрано</div>
	</div>
	<div class="stat" style="padding:14px;">
		<div class="stat-label">Просрочени фактури</div>
		<div class="amount" style="font-size:20px; font-weight:500; color:{data.summary.overdueCount > 0 ? 'var(--danger)' : 'var(--text)'};">{data.summary.overdueCount}</div>
		<div class="muted" style="font-size:11px;">Брой просрочени фактури</div>
	</div>
</div>

<!-- Client breakdown -->
{#if data.clientBreakdown.length > 0}
	<div class="card" style="margin-bottom:16px;">
		<div class="card-header">
			<h3 class="card-title">Разбивка по клиент</h3>
		</div>
		<table class="tbl">
			<thead>
				<tr>
					<th>Клиент</th>
					<th style="text-align:right;">Издадено</th>
					<th style="text-align:right;">Събрано</th>
					<th style="text-align:right;">Остатък</th>
				</tr>
			</thead>
			<tbody>
				{#each data.clientBreakdown as row}
					<tr>
						<td style="font-size:13px;">{row.legalName}</td>
						<td class="amount" style="text-align:right;">{formatCents(row.issuedCents)}</td>
						<td class="amount" style="text-align:right; color:var(--success);">{formatCents(row.collectedCents)}</td>
						<td class="amount" style="text-align:right; font-weight:{row.outstandingCents > 0 ? '600' : '400'};">{formatCents(row.outstandingCents)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<!-- Invoices -->
<div class="card" style="margin-bottom:16px;">
	<div class="card-header">
		<h3 class="card-title">Фактури</h3>
	</div>
	<table class="tbl">
		<thead>
			<tr>
				<th>#</th>
				<th>Дата</th>
				<th>Клиент</th>
				<th>Статус</th>
				<th style="text-align:right;">Брутна сума</th>
				<th style="text-align:right;">Платено</th>
			</tr>
		</thead>
		<tbody>
			{#each data.invoices as invoice}
				<tr>
					<td class="amount muted" style="font-family:var(--font-mono); font-size:12px;">{invoice.invoiceNumber ?? '—'}</td>
					<td class="muted" style="font-size:12px; white-space:nowrap;">{formatDate(invoice.issueDate)}</td>
					<td style="font-size:13px;">{invoice.client.legalName}</td>
					<td><span class="{invoiceBadgeCls(invoice.status)}" style="font-size:10px;">{statusLabels[invoice.status] ?? invoice.status}</span></td>
					<td class="amount" style="text-align:right;">{formatCents(invoice.grossTotalCents)}</td>
					<td class="amount" style="text-align:right;">{formatCents(invoice.paidTotalCents)}</td>
				</tr>
			{/each}
			{#if data.invoices.length === 0}
				<tr><td colspan="6" style="text-align:center; padding:32px 16px; color:var(--text-muted);">Няма фактури за избраните филтри.</td></tr>
			{/if}
		</tbody>
	</table>
</div>

<!-- Payments -->
<div class="card">
	<div class="card-header">
		<h3 class="card-title">Плащания</h3>
	</div>
	<table class="tbl">
		<thead>
			<tr>
				<th>Дата</th>
				<th>Фактура #</th>
				<th>Клиент</th>
				<th style="text-align:right;">Сума</th>
				<th>Метод</th>
			</tr>
		</thead>
		<tbody>
			{#each data.payments as payment}
				<tr>
					<td class="muted" style="font-size:12px; white-space:nowrap;">{formatDate(payment.paymentDate)}</td>
					<td class="amount muted" style="font-family:var(--font-mono); font-size:12px;">{payment.invoice.invoiceNumber ?? '—'}</td>
					<td style="font-size:13px;">{payment.invoice.client.legalName}</td>
					<td class="amount" style="text-align:right;">{formatCents(payment.amountCents)}</td>
					<td style="font-size:12px;">{paymentMethodLabels[payment.paymentMethod] ?? payment.paymentMethod}</td>
				</tr>
			{/each}
			{#if data.payments.length === 0}
				<tr><td colspan="5" style="text-align:center; padding:32px 16px; color:var(--text-muted);">Няма плащания за избраните филтри.</td></tr>
			{/if}
		</tbody>
	</table>
</div>
