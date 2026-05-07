<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const today = new Date().toISOString().slice(0, 10);

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
	<title>Финанси</title>
</svelte:head>

<div class="page-header">
	<h1>Финанси</h1>
</div>

<!-- Balance Cards -->
<div class="balance-grid">
	{#if data.bank}
		<div class="balance-card" class:negative={data.bank.currentBalanceCents < 0}>
			<div class="balance-label">Банка</div>
			<div class="balance-amount" class:negative-amount={data.bank.currentBalanceCents < 0}>
				{formatCents(data.bank.currentBalanceCents)}
			</div>
			<div class="balance-opening">
				Начален баланс: {formatCents(data.bank.openingBalanceCents)}
			</div>

			{#if data.isAdmin}
				<form
					method="POST"
					action="?/setOpeningBalance"
					use:enhance={() => {
						openingBalanceSubmitting = true;
						return async ({ update }) => {
							openingBalanceSubmitting = false;
							await update();
						};
					}}
					class="opening-balance-form"
				>
					<input type="hidden" name="containerId" value={data.bank.id} />
					<div class="form-row-inline">
						<input
							type="number"
							name="openingBalance"
							step="0.01"
							value={(data.bank.openingBalanceCents / 100).toFixed(2)}
							class="input-sm"
							placeholder="0.00"
						/>
						<button type="submit" class="btn-sm btn-secondary" disabled={openingBalanceSubmitting}>
							Начален баланс
						</button>
					</div>
				</form>
			{/if}
		</div>
	{/if}

	{#if data.cashbox}
		<div class="balance-card" class:negative={data.cashbox.currentBalanceCents < 0}>
			<div class="balance-label">Каса</div>
			<div class="balance-amount" class:negative-amount={data.cashbox.currentBalanceCents < 0}>
				{formatCents(data.cashbox.currentBalanceCents)}
				{#if data.cashbox.currentBalanceCents < 0}
					<span class="negative-badge">Отрицателно салдо</span>
				{/if}
			</div>
			<div class="balance-opening">
				Начален баланс: {formatCents(data.cashbox.openingBalanceCents)}
			</div>

			{#if data.isAdmin}
				<form
					method="POST"
					action="?/setOpeningBalance"
					use:enhance={() => {
						openingBalanceSubmitting = true;
						return async ({ update }) => {
							openingBalanceSubmitting = false;
							await update();
						};
					}}
					class="opening-balance-form"
				>
					<input type="hidden" name="containerId" value={data.cashbox.id} />
					<div class="form-row-inline">
						<input
							type="number"
							name="openingBalance"
							step="0.01"
							value={(data.cashbox.openingBalanceCents / 100).toFixed(2)}
							class="input-sm"
							placeholder="0.00"
						/>
						<button type="submit" class="btn-sm btn-secondary" disabled={openingBalanceSubmitting}>
							Начален баланс
						</button>
					</div>
				</form>
			{/if}
		</div>
	{/if}
</div>

{#if form?.openingBalanceError}
	<p class="error-msg">{form.openingBalanceError}</p>
{/if}
{#if form?.openingBalanceSuccess}
	<p class="success-msg">{form.openingBalanceSuccess}</p>
{/if}

<!-- Forms Section -->
<div class="forms-grid">
	<!-- Standalone Income -->
	<section class="form-section">
		<h2>Приходи</h2>
		<p class="section-desc">Запис на директен приход към банка или каса</p>

		{#if form?.incomeError}
			<p class="error-msg">{form.incomeError}</p>
		{/if}
		{#if form?.incomeSuccess}
			<p class="success-msg">{form.incomeSuccess}</p>
		{/if}

		<form
			method="POST"
			action="?/recordStandaloneIncome"
			use:enhance={() => {
				incomeSubmitting = true;
				return async ({ update }) => {
					incomeSubmitting = false;
					await update();
				};
			}}
		>
			<div class="form-group">
				<label for="income-container">Контейнер</label>
				<select id="income-container" name="containerId" class="input" required>
					{#if data.bank}
						<option value={data.bank.id}>Банка</option>
					{/if}
					{#if data.cashbox}
						<option value={data.cashbox.id}>Каса</option>
					{/if}
				</select>
			</div>

			<div class="form-group">
				<label for="income-description">Описание</label>
				<input
					id="income-description"
					type="text"
					name="description"
					class="input"
					required
					maxlength="500"
					placeholder="Описание на прихода"
				/>
			</div>

			<div class="form-row">
				<div class="form-group">
					<label for="income-amount">Сума (лв.)</label>
					<input
						id="income-amount"
						type="number"
						name="amount"
						class="input"
						required
						min="0.01"
						step="0.01"
						placeholder="0.00"
					/>
				</div>

				<div class="form-group">
					<label for="income-date">Дата</label>
					<input
						id="income-date"
						type="date"
						name="incomeDate"
						class="input"
						required
						value={today}
					/>
				</div>
			</div>

			<div class="form-group">
				<label for="income-notes">Бележки (незадължително)</label>
				<textarea
					id="income-notes"
					name="notes"
					class="input"
					rows="2"
					placeholder="Допълнителни бележки"
				></textarea>
			</div>

			<button type="submit" class="btn btn-primary" disabled={incomeSubmitting}>
				{incomeSubmitting ? 'Запазване...' : 'Запиши приход'}
			</button>
		</form>
	</section>

	<!-- Generic Movement -->
	<section class="form-section">
		<h2>Движения</h2>
		<p class="section-desc">Общо увеличение или намаление на банка / каса</p>

		{#if form?.movementError}
			<p class="error-msg">{form.movementError}</p>
		{/if}
		{#if form?.movementSuccess}
			<p class="success-msg">{form.movementSuccess}</p>
		{/if}

		<form
			method="POST"
			action="?/recordGenericMovement"
			use:enhance={() => {
				movementSubmitting = true;
				return async ({ update }) => {
					movementSubmitting = false;
					await update();
				};
			}}
		>
			<div class="form-group">
				<label for="movement-container">Контейнер</label>
				<select id="movement-container" name="containerId" class="input" required>
					{#if data.bank}
						<option value={data.bank.id}>Банка</option>
					{/if}
					{#if data.cashbox}
						<option value={data.cashbox.id}>Каса</option>
					{/if}
				</select>
			</div>

			<div class="form-group">
				<label for="movement-direction">Посока</label>
				<select id="movement-direction" name="direction" class="input" required>
					<option value="credit">Приход (увеличение)</option>
					<option value="debit">Разход (намаление)</option>
				</select>
			</div>

			<div class="form-group">
				<label for="movement-description">Описание</label>
				<input
					id="movement-description"
					type="text"
					name="description"
					class="input"
					required
					maxlength="500"
					placeholder="Описание на движението"
				/>
			</div>

			<div class="form-row">
				<div class="form-group">
					<label for="movement-amount">Сума (лв.)</label>
					<input
						id="movement-amount"
						type="number"
						name="amount"
						class="input"
						required
						min="0.01"
						step="0.01"
						placeholder="0.00"
					/>
				</div>

				<div class="form-group">
					<label for="movement-date">Дата</label>
					<input
						id="movement-date"
						type="date"
						name="movementDate"
						class="input"
						required
						value={today}
					/>
				</div>
			</div>

			<button type="submit" class="btn btn-primary" disabled={movementSubmitting}>
				{movementSubmitting ? 'Запазване...' : 'Запиши движение'}
			</button>
		</form>
	</section>

	<!-- Transfer -->
	<section class="form-section">
		<h2>Трансфери</h2>
		<p class="section-desc">Прехвърляне на средства между банка и каса</p>

		{#if form?.transferError}
			<p class="error-msg">{form.transferError}</p>
		{/if}
		{#if form?.transferSuccess}
			<p class="success-msg">{form.transferSuccess}</p>
		{/if}

		<form
			method="POST"
			action="?/recordTransfer"
			use:enhance={() => {
				transferSubmitting = true;
				return async ({ update }) => {
					transferSubmitting = false;
					await update();
				};
			}}
		>
			<div class="form-row">
				<div class="form-group">
					<label for="transfer-source">От</label>
					<select id="transfer-source" name="sourceId" class="input" required>
						{#if data.bank}
							<option value={data.bank.id}>Банка</option>
						{/if}
						{#if data.cashbox}
							<option value={data.cashbox.id}>Каса</option>
						{/if}
					</select>
				</div>

				<div class="form-group">
					<label for="transfer-destination">Към</label>
					<select id="transfer-destination" name="destinationId" class="input" required>
						{#if data.cashbox}
							<option value={data.cashbox.id}>Каса</option>
						{/if}
						{#if data.bank}
							<option value={data.bank.id}>Банка</option>
						{/if}
					</select>
				</div>
			</div>

			<div class="form-row">
				<div class="form-group">
					<label for="transfer-amount">Сума (лв.)</label>
					<input
						id="transfer-amount"
						type="number"
						name="amount"
						class="input"
						required
						min="0.01"
						step="0.01"
						placeholder="0.00"
					/>
				</div>

				<div class="form-group">
					<label for="transfer-date">Дата</label>
					<input
						id="transfer-date"
						type="date"
						name="transferDate"
						class="input"
						required
						value={today}
					/>
				</div>
			</div>

			<button type="submit" class="btn btn-primary" disabled={transferSubmitting}>
				{transferSubmitting ? 'Запазване...' : 'Запиши трансфер'}
			</button>
		</form>
	</section>
</div>

<!-- Recent Ledger Entries -->
<section class="ledger-section">
	<h2>Движения</h2>

	<form method="GET" class="filter-bar">
		<select name="containerId" onchange="this.form.submit()">
			<option value="" selected={!data.filters.containerId}>Всички сметки</option>
			{#if data.bank}
				<option value={data.bank.id} selected={data.filters.containerId === data.bank.id}>Банка</option>
			{/if}
			{#if data.cashbox}
				<option value={data.cashbox.id} selected={data.filters.containerId === data.cashbox.id}>Каса</option>
			{/if}
		</select>

		<select name="entryType" onchange="this.form.submit()">
			<option value="" selected={!data.filters.entryType}>Всички типове</option>
			{#each Object.entries(entryTypeLabels) as [value, label]}
				<option value={value} selected={data.filters.entryType === value}>{label}</option>
			{/each}
		</select>

		<input
			type="date"
			name="dateFrom"
			value={data.filters.dateFrom}
			title="От дата"
		/>
		<input
			type="date"
			name="dateTo"
			value={data.filters.dateTo}
			title="До дата"
		/>

		<input
			type="text"
			name="search"
			value={data.filters.search}
			placeholder="Търсене в описание"
			class="search-input"
		/>

		<button type="submit" class="btn btn-secondary">Филтрирай</button>
		<a href="/cashflow" class="btn btn-secondary">Изчисти</a>
	</form>

	{#if data.recentEntries.length === 0}
		<p class="empty-state">Няма записани движения.</p>
	{:else}
		<table class="ledger-table">
			<thead>
				<tr>
					<th>Дата</th>
					<th>Контейнер</th>
					<th>Тип</th>
					<th>Описание</th>
					<th class="amount-col">Сума</th>
				</tr>
			</thead>
			<tbody>
				{#each data.recentEntries as entry}
					<tr>
						<td>{formatDate(entry.entryDate)}</td>
						<td>{entry.container.name}</td>
						<td>
							<span class="entry-type-badge" class:credit={entry.amountCents > 0} class:debit={entry.amountCents < 0}>
								{entryTypeLabels[entry.entryType] ?? entry.entryType}
							</span>
						</td>
						<td>{entry.description}</td>
						<td class="amount-col" class:positive={entry.amountCents > 0} class:negative-text={entry.amountCents < 0}>
							{formatCents(entry.amountCents)}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.filter-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		margin-bottom: 16px;
		padding: 12px 16px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
	}

	.filter-bar select,
	.filter-bar input[type='date'],
	.filter-bar input[type='text'] {
		padding: 6px 10px;
		border: 1px solid #cbd5e1;
		border-radius: 5px;
		font-size: 0.875rem;
		font-family: inherit;
		background: white;
		width: auto;
	}

	.filter-bar .search-input {
		min-width: 180px;
	}

	.page-header {
		margin-bottom: 24px;
	}

	.page-header h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0;
	}

	.balance-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
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

	.balance-label {
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: uppercase;
		color: #64748b;
		letter-spacing: 0.05em;
		margin-bottom: 8px;
	}

	.balance-amount {
		font-size: 2rem;
		font-weight: 700;
		color: #0f172a;
		margin-bottom: 6px;
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.balance-amount.negative-amount {
		color: #dc2626;
	}

	.negative-badge {
		font-size: 0.75rem;
		font-weight: 600;
		background: #fee2e2;
		color: #dc2626;
		border: 1px solid #fca5a5;
		border-radius: 4px;
		padding: 2px 8px;
	}

	.balance-opening {
		font-size: 0.8125rem;
		color: #94a3b8;
		margin-bottom: 14px;
	}

	.opening-balance-form {
		margin-top: 12px;
	}

	.form-row-inline {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.input-sm {
		width: 120px;
		padding: 5px 8px;
		border: 1px solid #cbd5e1;
		border-radius: 5px;
		font-size: 0.875rem;
		font-family: inherit;
	}

	.btn-sm {
		padding: 5px 12px;
		font-size: 0.8125rem;
		border-radius: 5px;
		border: 1px solid #94a3b8;
		background: #f8fafc;
		color: #475569;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.15s;
	}

	.btn-sm:hover:not(:disabled) {
		background: #e2e8f0;
	}

	.btn-sm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.forms-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 24px;
		margin-bottom: 40px;
	}

	.form-section {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 24px;
	}

	.form-section h2 {
		font-size: 1.0625rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0 0 4px 0;
	}

	.section-desc {
		font-size: 0.8125rem;
		color: #64748b;
		margin: 0 0 20px 0;
	}

	.form-group {
		margin-bottom: 14px;
	}

	.form-group label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 600;
		color: #374151;
		margin-bottom: 5px;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	.input {
		width: 100%;
		padding: 7px 10px;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		font-size: 0.9375rem;
		font-family: inherit;
		box-sizing: border-box;
		background: #fff;
		color: #0f172a;
		transition: border-color 0.15s;
	}

	.input:focus {
		outline: none;
		border-color: #3b82f6;
	}

	textarea.input {
		resize: vertical;
	}

	.btn {
		padding: 9px 20px;
		border: none;
		border-radius: 6px;
		font-size: 0.9375rem;
		font-family: inherit;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-primary {
		background: #2563eb;
		color: #fff;
	}

	.btn-primary:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: #f1f5f9;
		color: #374151;
		border: 1px solid #cbd5e1;
	}

	.error-msg {
		color: #dc2626;
		font-size: 0.875rem;
		margin-bottom: 12px;
		background: #fee2e2;
		border: 1px solid #fca5a5;
		border-radius: 6px;
		padding: 8px 12px;
	}

	.success-msg {
		color: #15803d;
		font-size: 0.875rem;
		margin-bottom: 12px;
		background: #dcfce7;
		border: 1px solid #86efac;
		border-radius: 6px;
		padding: 8px 12px;
	}

	.ledger-section {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 24px;
	}

	.ledger-section h2 {
		font-size: 1.0625rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0 0 16px 0;
	}

	.empty-state {
		color: #94a3b8;
		font-size: 0.9375rem;
		text-align: center;
		padding: 24px 0;
	}

	.ledger-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.ledger-table th {
		text-align: left;
		padding: 8px 12px;
		font-size: 0.8125rem;
		font-weight: 600;
		color: #64748b;
		border-bottom: 2px solid #e2e8f0;
	}

	.ledger-table td {
		padding: 10px 12px;
		border-bottom: 1px solid #f1f5f9;
		color: #1e293b;
		vertical-align: middle;
	}

	.ledger-table tr:last-child td {
		border-bottom: none;
	}

	.amount-col {
		text-align: right;
		white-space: nowrap;
	}

	.positive {
		color: #15803d;
		font-weight: 600;
	}

	.negative-text {
		color: #dc2626;
		font-weight: 600;
	}

	.entry-type-badge {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 4px;
		background: #f1f5f9;
		color: #475569;
	}

	.entry-type-badge.credit {
		background: #dcfce7;
		color: #15803d;
	}

	.entry-type-badge.debit {
		background: #fee2e2;
		color: #b91c1c;
	}
</style>
