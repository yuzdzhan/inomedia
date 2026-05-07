<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Track which row has the manual-match dropdown open
	let openMatchRowId = $state<string | null>(null);
	let selectedInvoiceId = $state<Record<string, string>>({});
	let submitting = $state(false);

	function formatDate(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	function formatDateTime(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleString('bg-BG', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatAmount(cents: number): string {
		const sign = cents < 0 ? '-' : '';
		const abs = Math.abs(cents);
		return `${sign}${(abs / 100).toFixed(2)} лв.`;
	}

	function formatAmountEur(cents: number): string {
		const sign = cents < 0 ? '-' : '';
		const abs = Math.abs(cents);
		return `${sign}${(abs / 100).toFixed(2)} EUR`;
	}

	const parseStatusLabels: Record<string, string> = {
		ok: 'Успешен',
		parse_failed: 'Неуспешен разбор',
		partial: 'Частичен'
	};

	const matchStateLabels: Record<string, string> = {
		auto_matched: 'Съвпадение',
		needs_review: 'За преглед',
		unmatched: 'Несъвпадение',
		irrelevant: 'Неотносим'
	};

	const matchStateBadgeClass: Record<string, string> = {
		auto_matched: 'badge-matched',
		needs_review: 'badge-review',
		unmatched: 'badge-unmatched',
		irrelevant: 'badge-irrelevant'
	};

	function toggleMatchPanel(rowId: string) {
		openMatchRowId = openMatchRowId === rowId ? null : rowId;
	}
</script>

<svelte:head>
	<title>Преглед на извлечение — {data.statement.originalFilename}</title>
</svelte:head>

<div class="page-header">
	<a href="/bank-statements" class="back-link">← Банкови извлечения</a>
	<h1>{data.statement.originalFilename}</h1>
	<p class="meta">
		Импортирано на {formatDateTime(data.statement.importedAt)} от {data.statement.importedByName}
		&nbsp;·&nbsp;
		<span class="parse-status">{parseStatusLabels[data.statement.parseStatus] ?? data.statement.parseStatus}</span>
	</p>
</div>

<!-- Auto-match summary -->
<div class="card summary-card">
	<h2 class="section-title">Резултат от автоматично съвпадение</h2>
	<div class="summary-grid">
		<div class="summary-item summary-matched">
			<span class="summary-count">{data.autoMatchCounts.matched}</span>
			<span class="summary-label">Съвпадения</span>
		</div>
		<div class="summary-item summary-review">
			<span class="summary-count">{data.autoMatchCounts.needsReview}</span>
			<span class="summary-label">За преглед</span>
		</div>
		<div class="summary-item summary-unmatched">
			<span class="summary-count">{data.autoMatchCounts.unmatched}</span>
			<span class="summary-label">Несъвпадения</span>
		</div>
		<div class="summary-item summary-irrelevant">
			<span class="summary-count">{data.autoMatchCounts.irrelevant}</span>
			<span class="summary-label">Неотносими</span>
		</div>
	</div>
</div>

{#if form?.success}
	<div class="alert alert-success">{form.success}</div>
{/if}
{#if form?.error}
	<div class="alert alert-error">{form.error}</div>
{/if}

<!-- Needs Review section -->
{#if data.needsReviewRows.length > 0}
	<div class="card">
		<h2 class="section-title section-title-review">За преглед ({data.needsReviewRows.length})</h2>
		<table class="table">
			<thead>
				<tr>
					<th>Дата</th>
					<th>Описание</th>
					<th class="amount-col">Сума</th>
					<th>Статус</th>
					<th>Действия</th>
				</tr>
			</thead>
			<tbody>
				{#each data.needsReviewRows as row}
					<tr>
						<td class="date-cell">{formatDate(row.transactionDate)}</td>
						<td class="desc-cell">{row.description}</td>
						<td class="amount-cell {row.amountCents >= 0 ? 'credit' : 'debit'}">
							{formatAmount(row.amountCents)}
						</td>
						<td>
							<span class="badge {matchStateBadgeClass[row.matchState]}">
								{matchStateLabels[row.matchState]}
							</span>
						</td>
						<td class="actions-cell">
							<form method="POST" action="?/markIrrelevant" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
								<input type="hidden" name="rowId" value={row.id} />
								<button type="submit" class="btn-action btn-secondary" disabled={submitting}>
									Неотносим
								</button>
							</form>
							{#if row.amountCents > 0}
								<form method="POST" action="?/convertToStandaloneIncome" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
									<input type="hidden" name="rowId" value={row.id} />
									<button type="submit" class="btn-action btn-income" disabled={submitting}>
										Превърни в приход
									</button>
								</form>
								<button
									type="button"
									class="btn-action btn-match"
									onclick={() => toggleMatchPanel(row.id)}
								>
									Съвпадение с фактура…
								</button>
								{#if openMatchRowId === row.id}
									<div class="match-panel">
										<form method="POST" action="?/manualMatchInvoice" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; openMatchRowId = null; await update(); }; }}>
											<input type="hidden" name="rowId" value={row.id} />
											<select name="invoiceId" class="invoice-select" bind:value={selectedInvoiceId[row.id]}>
												<option value="">— Изберете фактура —</option>
												{#each data.openInvoices as inv}
													<option value={inv.id}>
														#{inv.invoiceNumber ?? 'черн.'} · {inv.clientName} · {formatAmountEur(inv.remainingCents)} остатък
													</option>
												{/each}
											</select>
											<button type="submit" class="btn-action btn-match" disabled={submitting || !selectedInvoiceId[row.id]}>
												Свържи
											</button>
										</form>
									</div>
								{/if}
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<!-- Unmatched section -->
{#if data.unmatchedRows.length > 0}
	<div class="card">
		<h2 class="section-title section-title-unmatched">Несъвпадения ({data.unmatchedRows.length})</h2>
		<table class="table">
			<thead>
				<tr>
					<th>Дата</th>
					<th>Описание</th>
					<th class="amount-col">Сума</th>
					<th>Статус</th>
					<th>Действия</th>
				</tr>
			</thead>
			<tbody>
				{#each data.unmatchedRows as row}
					<tr>
						<td class="date-cell">{formatDate(row.transactionDate)}</td>
						<td class="desc-cell">{row.description}</td>
						<td class="amount-cell {row.amountCents >= 0 ? 'credit' : 'debit'}">
							{formatAmount(row.amountCents)}
						</td>
						<td>
							<span class="badge {matchStateBadgeClass[row.matchState]}">
								{matchStateLabels[row.matchState]}
							</span>
						</td>
						<td class="actions-cell">
							<form method="POST" action="?/markIrrelevant" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
								<input type="hidden" name="rowId" value={row.id} />
								<button type="submit" class="btn-action btn-secondary" disabled={submitting}>
									Неотносим
								</button>
							</form>
							{#if row.amountCents > 0}
								<form method="POST" action="?/convertToStandaloneIncome" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
									<input type="hidden" name="rowId" value={row.id} />
									<button type="submit" class="btn-action btn-income" disabled={submitting}>
										Превърни в приход
									</button>
								</form>
								<button
									type="button"
									class="btn-action btn-match"
									onclick={() => toggleMatchPanel(row.id)}
								>
									Съвпадение с фактура…
								</button>
								{#if openMatchRowId === row.id}
									<div class="match-panel">
										<form method="POST" action="?/manualMatchInvoice" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; openMatchRowId = null; await update(); }; }}>
											<input type="hidden" name="rowId" value={row.id} />
											<select name="invoiceId" class="invoice-select" bind:value={selectedInvoiceId[row.id]}>
												<option value="">— Изберете фактура —</option>
												{#each data.openInvoices as inv}
													<option value={inv.id}>
														#{inv.invoiceNumber ?? 'черн.'} · {inv.clientName} · {formatAmountEur(inv.remainingCents)} остатък
													</option>
												{/each}
											</select>
											<button type="submit" class="btn-action btn-match" disabled={submitting || !selectedInvoiceId[row.id]}>
												Свържи
											</button>
										</form>
									</div>
								{/if}
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<!-- Matched section -->
{#if data.matchedRows.length > 0}
	<div class="card">
		<h2 class="section-title section-title-matched">Съвпадения ({data.matchedRows.length})</h2>
		<table class="table">
			<thead>
				<tr>
					<th>Дата</th>
					<th>Описание</th>
					<th class="amount-col">Сума</th>
					<th>Статус</th>
					<th>Свързано с</th>
					<th>Действия</th>
				</tr>
			</thead>
			<tbody>
				{#each data.matchedRows as row}
					<tr>
						<td class="date-cell">{formatDate(row.transactionDate)}</td>
						<td class="desc-cell">{row.description}</td>
						<td class="amount-cell {row.amountCents >= 0 ? 'credit' : 'debit'}">
							{formatAmount(row.amountCents)}
						</td>
						<td>
							<span class="badge {matchStateBadgeClass[row.matchState]}">
								{matchStateLabels[row.matchState]}
							</span>
						</td>
						<td class="linked-cell">
							{#if row.invoicePayment}
								<a href="/invoices" class="linked-invoice">
									Фактура #{row.invoicePayment.invoice?.invoiceNumber ?? '—'}
									{#if row.invoicePayment.invoice?.client}
										· {row.invoicePayment.invoice.client.legalName}
									{/if}
								</a>
							{:else if row.standaloneIncome}
								<span class="linked-income">Приход: {row.standaloneIncome.description}</span>
							{:else}
								—
							{/if}
						</td>
						<td class="actions-cell">
							<form method="POST" action="?/unresolveRow" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
								<input type="hidden" name="rowId" value={row.id} />
								<button type="submit" class="btn-action btn-secondary" disabled={submitting}>
									Развъзи
								</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<!-- Irrelevant section -->
{#if data.irrelevantRows.length > 0}
	<div class="card">
		<h2 class="section-title section-title-irrelevant">Неотносими ({data.irrelevantRows.length})</h2>
		<table class="table">
			<thead>
				<tr>
					<th>Дата</th>
					<th>Описание</th>
					<th class="amount-col">Сума</th>
					<th>Статус</th>
					<th>Действия</th>
				</tr>
			</thead>
			<tbody>
				{#each data.irrelevantRows as row}
					<tr class="row-irrelevant">
						<td class="date-cell">{formatDate(row.transactionDate)}</td>
						<td class="desc-cell">{row.description}</td>
						<td class="amount-cell {row.amountCents >= 0 ? 'credit' : 'debit'}">
							{formatAmount(row.amountCents)}
						</td>
						<td>
							<span class="badge {matchStateBadgeClass[row.matchState]}">
								{matchStateLabels[row.matchState]}
							</span>
						</td>
						<td class="actions-cell">
							<form method="POST" action="?/unresolveRow" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
								<input type="hidden" name="rowId" value={row.id} />
								<button type="submit" class="btn-action btn-secondary" disabled={submitting}>
									Развъзи
								</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

{#if data.matchedRows.length === 0 && data.needsReviewRows.length === 0 && data.unmatchedRows.length === 0 && data.irrelevantRows.length === 0}
	<div class="card">
		<p class="empty-text">Извлечението не съдържа редове.</p>
	</div>
{/if}

<style>
	.page-header {
		margin-bottom: 24px;
	}

	.back-link {
		display: inline-block;
		color: #64748b;
		font-size: 0.875rem;
		text-decoration: none;
		margin-bottom: 8px;
	}

	.back-link:hover {
		color: #3b82f6;
	}

	.page-header h1 {
		font-size: 1.4rem;
		font-weight: 700;
		color: #1e293b;
		margin: 0 0 4px;
		font-family: monospace;
	}

	.meta {
		font-size: 0.875rem;
		color: #64748b;
		margin: 0;
	}

	.parse-status {
		font-weight: 500;
	}

	.card {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 24px;
		margin-bottom: 24px;
	}

	.summary-card {
		padding: 20px 24px;
	}

	.section-title {
		font-size: 1rem;
		font-weight: 600;
		color: #1e293b;
		margin: 0 0 16px;
	}

	.section-title-review { color: #92400e; }
	.section-title-unmatched { color: #b91c1c; }
	.section-title-matched { color: #15803d; }
	.section-title-irrelevant { color: #64748b; }

	.summary-grid {
		display: flex;
		gap: 24px;
		flex-wrap: wrap;
	}

	.summary-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 80px;
		padding: 12px 16px;
		border-radius: 8px;
	}

	.summary-count {
		font-size: 1.75rem;
		font-weight: 700;
		line-height: 1;
	}

	.summary-label {
		font-size: 0.8125rem;
		margin-top: 4px;
	}

	.summary-matched { background: #dcfce7; color: #15803d; }
	.summary-review { background: #fef3c7; color: #92400e; }
	.summary-unmatched { background: #fee2e2; color: #b91c1c; }
	.summary-irrelevant { background: #f1f5f9; color: #64748b; }

	.alert {
		padding: 10px 14px;
		border-radius: 6px;
		font-size: 0.9rem;
		margin-bottom: 14px;
	}

	.alert-error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #b91c1c;
	}

	.alert-success {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: #15803d;
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.table th {
		text-align: left;
		padding: 8px 12px;
		font-weight: 600;
		font-size: 0.8125rem;
		color: #64748b;
		border-bottom: 1px solid #e2e8f0;
		white-space: nowrap;
	}

	.table td {
		padding: 10px 12px;
		border-bottom: 1px solid #f1f5f9;
		color: #334155;
		vertical-align: top;
	}

	.table tr:last-child td {
		border-bottom: none;
	}

	.row-irrelevant td {
		opacity: 0.55;
	}

	.date-cell {
		white-space: nowrap;
		font-size: 0.85rem;
		color: #64748b;
	}

	.desc-cell {
		max-width: 320px;
	}

	.amount-col {
		text-align: right;
	}

	.amount-cell {
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		white-space: nowrap;
	}

	.credit { color: #15803d; }
	.debit { color: #b91c1c; }

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 0.8125rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.badge-matched { background: #dcfce7; color: #15803d; }
	.badge-review { background: #fef3c7; color: #92400e; }
	.badge-unmatched { background: #fee2e2; color: #b91c1c; }
	.badge-irrelevant { background: #f1f5f9; color: #64748b; }

	.linked-cell {
		font-size: 0.875rem;
	}

	.linked-invoice {
		color: #3b82f6;
		text-decoration: none;
	}

	.linked-invoice:hover {
		text-decoration: underline;
	}

	.linked-income {
		color: #15803d;
	}

	.actions-cell {
		white-space: nowrap;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: flex-start;
	}

	.btn-action {
		padding: 5px 10px;
		border-radius: 5px;
		font-size: 0.8125rem;
		font-family: inherit;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid transparent;
		transition: background 0.15s, opacity 0.15s;
		white-space: nowrap;
	}

	.btn-action:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: #f1f5f9;
		color: #475569;
		border-color: #cbd5e1;
	}

	.btn-secondary:hover:not(:disabled) {
		background: #e2e8f0;
	}

	.btn-income {
		background: #dcfce7;
		color: #15803d;
		border-color: #bbf7d0;
	}

	.btn-income:hover:not(:disabled) {
		background: #bbf7d0;
	}

	.btn-match {
		background: #eff6ff;
		color: #2563eb;
		border-color: #bfdbfe;
	}

	.btn-match:hover:not(:disabled) {
		background: #dbeafe;
	}

	.match-panel {
		margin-top: 8px;
		padding: 10px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 300px;
	}

	.invoice-select {
		width: 100%;
		padding: 6px 10px;
		border: 1px solid #cbd5e1;
		border-radius: 5px;
		font-size: 0.875rem;
		font-family: inherit;
		color: #334155;
		background: #fff;
	}

	.empty-text {
		color: #94a3b8;
		font-size: 0.9rem;
		margin: 0;
	}
</style>
