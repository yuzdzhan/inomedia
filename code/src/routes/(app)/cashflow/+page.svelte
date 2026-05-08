<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { fmtDate as formatDate } from '$lib/utils/format';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const today = new Date().toISOString().slice(0, 10);

	function formatCents(cents: number): string {
		const sign = cents < 0 ? '-' : '';
		const abs = Math.abs(cents);
		return `${sign}${(abs / 100).toFixed(2)} EUR`;
	}

	const entryTypeLabels: Record<string, string> = {
		invoice_payment: 'Плащане по фактура',
		standalone_income: 'Самостоятелен приход',
		expense_payment: 'Плащане на разход',
		generic_credit: 'Приход',
		generic_debit: 'Разход',
		transfer_out: 'Трансфер (изходящ)',
		transfer_in: 'Трансфер (входящ)'
	};

	let incomeSubmitting = $state(false);
	let movementSubmitting = $state(false);
	let transferSubmitting = $state(false);
	let openingBalanceSubmitting = $state(false);
</script>

<svelte:head>
	<title>Финанси – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Финанси</h1>
		<p class="page-sub">Управление на парични потоци, баланси и движения</p>
	</div>
</div>

{#if (form as any)?.openingBalanceError}
	<div class="alert danger" style="margin-bottom:12px;">{(form as any).openingBalanceError}</div>
{/if}
{#if (form as any)?.openingBalanceSuccess}
	<div class="alert success" style="margin-bottom:12px;">{(form as any).openingBalanceSuccess}</div>
{/if}

<!-- Balance Cards -->
<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; margin-bottom:20px;">
	{#if data.bank}
		<div class="stat" style="padding:16px;">
			<div class="stat-label">Банка</div>
			<div class="amount" style="font-size:26px; font-weight:600; color:{data.bank.currentBalanceCents < 0 ? 'var(--danger)' : 'var(--text)'};">
				{formatCents(data.bank.currentBalanceCents)}
			</div>
			<div class="muted" style="font-size:11px; margin-top:2px;">Начален баланс: {formatCents(data.bank.openingBalanceCents)}</div>
			{#if data.isAdmin}
				<form method="POST" action="?/setOpeningBalance" use:enhance={() => {
					openingBalanceSubmitting = true;
					return async ({ update }) => { openingBalanceSubmitting = false; await update(); };
				}} style="margin-top:10px; display:flex; gap:8px; align-items:center;">
					<input type="hidden" name="containerId" value={data.bank.id} />
					<input class="input" type="number" name="openingBalance" step="0.01"
						value={(data.bank.openingBalanceCents / 100).toFixed(2)}
						style="width:110px; font-family:var(--font-mono); font-size:12px;" />
					<button type="submit" class="btn btn-secondary btn-sm" disabled={openingBalanceSubmitting}>Начален</button>
				</form>
			{/if}
		</div>
	{/if}
	{#if data.cashbox}
		<div class="stat" style="padding:16px;">
			<div class="stat-label">Каса</div>
			<div style="display:flex; align-items:baseline; gap:8px;">
				<div class="amount" style="font-size:26px; font-weight:600; color:{data.cashbox.currentBalanceCents < 0 ? 'var(--danger)' : 'var(--text)'};">
					{formatCents(data.cashbox.currentBalanceCents)}
				</div>
				{#if data.cashbox.currentBalanceCents < 0}
					<span class="badge task-cancelled" style="font-size:10px;">Отрицателно</span>
				{/if}
			</div>
			<div class="muted" style="font-size:11px; margin-top:2px;">Начален баланс: {formatCents(data.cashbox.openingBalanceCents)}</div>
			{#if data.isAdmin}
				<form method="POST" action="?/setOpeningBalance" use:enhance={() => {
					openingBalanceSubmitting = true;
					return async ({ update }) => { openingBalanceSubmitting = false; await update(); };
				}} style="margin-top:10px; display:flex; gap:8px; align-items:center;">
					<input type="hidden" name="containerId" value={data.cashbox.id} />
					<input class="input" type="number" name="openingBalance" step="0.01"
						value={(data.cashbox.openingBalanceCents / 100).toFixed(2)}
						style="width:110px; font-family:var(--font-mono); font-size:12px;" />
					<button type="submit" class="btn btn-secondary btn-sm" disabled={openingBalanceSubmitting}>Начален</button>
				</form>
			{/if}
		</div>
	{/if}
</div>

<!-- Form sections -->
<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin-bottom:24px;">
	<!-- Standalone Income -->
	<div class="card">
		<div class="card-header">
			<div>
				<h3 class="card-title">Приходи</h3>
				<div class="card-sub">Запис на директен приход към банка или каса</div>
			</div>
		</div>
		{#if (form as any)?.incomeError}
			<div class="alert danger" style="margin:8px 16px 0;">{(form as any).incomeError}</div>
		{/if}
		{#if (form as any)?.incomeSuccess}
			<div class="alert success" style="margin:8px 16px 0;">{(form as any).incomeSuccess}</div>
		{/if}
		<form method="POST" action="?/recordStandaloneIncome" use:enhance={() => {
			incomeSubmitting = true;
			return async ({ update }) => { incomeSubmitting = false; await update(); };
		}} style="padding:16px; display:flex; flex-direction:column; gap:10px;">
			<div class="field">
				<label class="label" for="income-container">Контейнер</label>
				<select class="select" id="income-container" name="containerId" required>
					{#if data.bank}<option value={data.bank.id}>Банка</option>{/if}
					{#if data.cashbox}<option value={data.cashbox.id}>Каса</option>{/if}
				</select>
			</div>
			<div class="field">
				<label class="label" for="income-desc">Описание</label>
				<input class="input" id="income-desc" type="text" name="description" required maxlength="500" placeholder="Описание на прихода" />
			</div>
			<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
				<div class="field">
					<label class="label" for="income-amount">Сума (EUR)</label>
					<input class="input" id="income-amount" type="number" name="amount" required min="0.01" step="0.01" placeholder="0.00" style="font-family:var(--font-mono);" />
				</div>
				<div class="field">
					<label class="label" for="income-date">Дата</label>
					<input class="input" id="income-date" type="date" name="incomeDate" required value={today} />
				</div>
			</div>
			<div class="field">
				<label class="label" for="income-notes">Бележки</label>
				<textarea class="input" id="income-notes" name="notes" rows="2" placeholder="Допълнителни бележки" style="resize:vertical;"></textarea>
			</div>
			<button type="submit" class="btn btn-primary btn-sm" disabled={incomeSubmitting}>
				{incomeSubmitting ? 'Запазване…' : 'Запиши приход'}
			</button>
		</form>
	</div>

	<!-- Generic Movement -->
	<div class="card">
		<div class="card-header">
			<div>
				<h3 class="card-title">Движения</h3>
				<div class="card-sub">Общо увеличение или намаление на банка / каса</div>
			</div>
		</div>
		{#if (form as any)?.movementError}
			<div class="alert danger" style="margin:8px 16px 0;">{(form as any).movementError}</div>
		{/if}
		{#if (form as any)?.movementSuccess}
			<div class="alert success" style="margin:8px 16px 0;">{(form as any).movementSuccess}</div>
		{/if}
		<form method="POST" action="?/recordGenericMovement" use:enhance={() => {
			movementSubmitting = true;
			return async ({ update }) => { movementSubmitting = false; await update(); };
		}} style="padding:16px; display:flex; flex-direction:column; gap:10px;">
			<div class="field">
				<label class="label" for="mov-container">Контейнер</label>
				<select class="select" id="mov-container" name="containerId" required>
					{#if data.bank}<option value={data.bank.id}>Банка</option>{/if}
					{#if data.cashbox}<option value={data.cashbox.id}>Каса</option>{/if}
				</select>
			</div>
			<div class="field">
				<label class="label" for="mov-dir">Посока</label>
				<select class="select" id="mov-dir" name="direction" required>
					<option value="credit">Приход (увеличение)</option>
					<option value="debit">Разход (намаление)</option>
				</select>
			</div>
			<div class="field">
				<label class="label" for="mov-desc">Описание</label>
				<input class="input" id="mov-desc" type="text" name="description" required maxlength="500" placeholder="Описание на движението" />
			</div>
			<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
				<div class="field">
					<label class="label" for="mov-amount">Сума (EUR)</label>
					<input class="input" id="mov-amount" type="number" name="amount" required min="0.01" step="0.01" placeholder="0.00" style="font-family:var(--font-mono);" />
				</div>
				<div class="field">
					<label class="label" for="mov-date">Дата</label>
					<input class="input" id="mov-date" type="date" name="movementDate" required value={today} />
				</div>
			</div>
			<button type="submit" class="btn btn-primary btn-sm" disabled={movementSubmitting}>
				{movementSubmitting ? 'Запазване…' : 'Запиши движение'}
			</button>
		</form>
	</div>

	<!-- Transfer -->
	<div class="card">
		<div class="card-header">
			<div>
				<h3 class="card-title">Трансфери</h3>
				<div class="card-sub">Прехвърляне на средства между банка и каса</div>
			</div>
		</div>
		{#if (form as any)?.transferError}
			<div class="alert danger" style="margin:8px 16px 0;">{(form as any).transferError}</div>
		{/if}
		{#if (form as any)?.transferSuccess}
			<div class="alert success" style="margin:8px 16px 0;">{(form as any).transferSuccess}</div>
		{/if}
		<form method="POST" action="?/recordTransfer" use:enhance={() => {
			transferSubmitting = true;
			return async ({ update }) => { transferSubmitting = false; await update(); };
		}} style="padding:16px; display:flex; flex-direction:column; gap:10px;">
			<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
				<div class="field">
					<label class="label" for="xfer-from">От</label>
					<select class="select" id="xfer-from" name="sourceId" required>
						{#if data.bank}<option value={data.bank.id}>Банка</option>{/if}
						{#if data.cashbox}<option value={data.cashbox.id}>Каса</option>{/if}
					</select>
				</div>
				<div class="field">
					<label class="label" for="xfer-to">Към</label>
					<select class="select" id="xfer-to" name="destinationId" required>
						{#if data.cashbox}<option value={data.cashbox.id}>Каса</option>{/if}
						{#if data.bank}<option value={data.bank.id}>Банка</option>{/if}
					</select>
				</div>
			</div>
			<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
				<div class="field">
					<label class="label" for="xfer-amount">Сума (EUR)</label>
					<input class="input" id="xfer-amount" type="number" name="amount" required min="0.01" step="0.01" placeholder="0.00" style="font-family:var(--font-mono);" />
				</div>
				<div class="field">
					<label class="label" for="xfer-date">Дата</label>
					<input class="input" id="xfer-date" type="date" name="transferDate" required value={today} />
				</div>
			</div>
			<button type="submit" class="btn btn-primary btn-sm" disabled={transferSubmitting}>
				{transferSubmitting ? 'Запазване…' : 'Запиши трансфер'}
			</button>
		</form>
	</div>
</div>

<!-- Ledger filter -->
<form method="GET" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:12px;">
	<select class="select" name="containerId" style="width:auto;" onchange={() => (document.activeElement as HTMLSelectElement)?.form?.submit()}>
		<option value="" selected={!data.filters.containerId}>Всички сметки</option>
		{#if data.bank}<option value={data.bank.id} selected={data.filters.containerId === data.bank.id}>Банка</option>{/if}
		{#if data.cashbox}<option value={data.cashbox.id} selected={data.filters.containerId === data.cashbox.id}>Каса</option>{/if}
	</select>
	<select class="select" name="entryType" style="width:auto;" onchange={() => (document.activeElement as HTMLSelectElement)?.form?.submit()}>
		<option value="" selected={!data.filters.entryType}>Всички типове</option>
		{#each Object.entries(entryTypeLabels) as [value, label]}
			<option value={value} selected={data.filters.entryType === value}>{label}</option>
		{/each}
	</select>
	<input class="input" type="date" name="dateFrom" value={data.filters.dateFrom} style="width:140px;" title="От дата" />
	<input class="input" type="date" name="dateTo" value={data.filters.dateTo} style="width:140px;" title="До дата" />
	<input class="input" type="text" name="search" value={data.filters.search} placeholder="Търсене в описание" style="width:180px;" />
	<button type="submit" class="btn btn-secondary btn-sm">Филтрирай</button>
	<a href="/cashflow" class="btn btn-ghost btn-sm">Изчисти</a>
</form>

<div class="card">
	<div class="card-header">
		<h3 class="card-title">Движения</h3>
	</div>
	<table class="tbl">
		<thead>
			<tr>
				<th>Дата</th>
				<th>Сметка</th>
				<th>Тип</th>
				<th>Описание</th>
				<th style="text-align:right;">Сума</th>
			</tr>
		</thead>
		<tbody>
			{#each data.recentEntries as entry}
				<tr>
					<td class="muted amount" style="white-space:nowrap; font-size:12px;">{formatDate(entry.entryDate)}</td>
					<td style="font-size:13px;">{entry.container.name}</td>
					<td>
						<span class="badge {entry.entryType === 'transfer_in' || entry.entryType === 'transfer_out' ? 'outline' : entry.amountCents > 0 ? 'task-done' : 'task-cancelled'}" style="font-size:10px;">
							{entryTypeLabels[entry.entryType] ?? entry.entryType}
						</span>
					</td>
					<td style="font-size:13px; max-width:260px;">{entry.description}</td>
					<td class="amount" style="text-align:right; font-weight:600; white-space:nowrap; color:{entry.amountCents > 0 ? 'var(--success)' : 'var(--danger)'};">
						{formatCents(entry.amountCents)}
					</td>
				</tr>
			{/each}
			{#if data.recentEntries.length === 0}
				<tr>
					<td colspan="5" style="text-align:center; padding:32px 16px; color:var(--text-muted);">Няма записани движения.</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
