<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { fmtDate as formatDate, fmtDateTime as formatDateTime } from '$lib/utils/format';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let openMatchRowId = $state<string | null>(null);
	let openExpenseRowId = $state<string | null>(null);
	let openNewExpenseRowId = $state<string | null>(null);
	let openIncomeRowId = $state<string | null>(null);
	let openExpenseAttachmentRowId = $state<string | null>(null);
	let selectedInvoiceId = $state<Record<string, string>>({});
	let selectedExpenseId = $state<Record<string, string>>({});
	let submitting = $state(false);


	function formatAmount(cents: number): string {
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

	function matchBadgeCls(state: string): string {
		const map: Record<string, string> = {
			auto_matched: 'badge task-done',
			needs_review: 'badge task-progress',
			unmatched: 'badge task-cancelled',
			irrelevant: 'badge outline'
		};
		return map[state] ?? 'badge outline';
	}

	function toggleMatchPanel(rowId: string) {
		openMatchRowId = openMatchRowId === rowId ? null : rowId;
		openExpenseRowId = null;
		openIncomeRowId = null;
		openExpenseAttachmentRowId = null;
	}

	function toggleExpensePanel(rowId: string) {
		openExpenseRowId = openExpenseRowId === rowId ? null : rowId;
		openMatchRowId = null;
		openNewExpenseRowId = null;
		openIncomeRowId = null;
		openExpenseAttachmentRowId = null;
	}

	function toggleNewExpensePanel(rowId: string) {
		openNewExpenseRowId = openNewExpenseRowId === rowId ? null : rowId;
		openExpenseRowId = null;
		openMatchRowId = null;
		openIncomeRowId = null;
		openExpenseAttachmentRowId = null;
	}

	function toggleIncomePanel(rowId: string) {
		openIncomeRowId = openIncomeRowId === rowId ? null : rowId;
		openMatchRowId = null;
		openExpenseRowId = null;
		openNewExpenseRowId = null;
		openExpenseAttachmentRowId = null;
	}

	function toggleExpenseAttachmentPanel(rowId: string) {
		openExpenseAttachmentRowId = openExpenseAttachmentRowId === rowId ? null : rowId;
		openMatchRowId = null;
		openExpenseRowId = null;
		openNewExpenseRowId = null;
		openIncomeRowId = null;
	}
</script>

<svelte:head>
	<title>Извлечение — {data.statement.originalFilename} – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<div style="margin-bottom:6px;">
			<a href="/bank-statements" class="muted" style="font-size:12px; text-decoration:none; color:var(--text-muted);">← Банкови извлечения</a>
		</div>
		<h1 class="page-title" style="font-family:var(--font-mono);">{data.statement.originalFilename}</h1>
		<p class="page-sub">
			Импортирано на {formatDateTime(data.statement.importedAt)} от {data.statement.importedByName}
			·
			<span style="font-weight:500;">{parseStatusLabels[data.statement.parseStatus] ?? data.statement.parseStatus}</span>
		</p>
	</div>
</div>

{#if form?.success}
	<div class="alert success" style="margin-bottom:12px;">{form.success}</div>
{/if}
{#if form?.error}
	<div class="alert danger" style="margin-bottom:12px;">{form.error}</div>
{/if}

<!-- Auto-match summary -->
<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px;">
	<div class="stat" style="padding:14px; border-color:var(--success);">
		<div class="stat-label">Съвпадения</div>
		<div class="amount" style="font-size:28px; font-weight:700; color:var(--success);">{data.autoMatchCounts.matched}</div>
	</div>
	<div class="stat" style="padding:14px; border-color:var(--accent);">
		<div class="stat-label">За преглед</div>
		<div class="amount" style="font-size:28px; font-weight:700; color:var(--accent);">{data.autoMatchCounts.needsReview}</div>
	</div>
	<div class="stat" style="padding:14px; border-color:var(--danger);">
		<div class="stat-label">Несъвпадения</div>
		<div class="amount" style="font-size:28px; font-weight:700; color:var(--danger);">{data.autoMatchCounts.unmatched}</div>
	</div>
	<div class="stat" style="padding:14px;">
		<div class="stat-label">Неотносими</div>
		<div class="amount" style="font-size:28px; font-weight:700; color:var(--text-muted);">{data.autoMatchCounts.irrelevant}</div>
	</div>
</div>

<!-- Needs Review -->
{#if data.needsReviewRows.length > 0}
	<div class="card" style="margin-bottom:16px;">
		<div class="card-header">
			<div>
				<h3 class="card-title" style="color:var(--accent);">За преглед</h3>
				<div class="card-sub">{data.needsReviewRows.length} реда изискват действие</div>
			</div>
		</div>
		<table class="tbl">
			<thead>
				<tr>
					<th>Дата</th>
					<th>Описание</th>
					<th style="text-align:right;">Сума</th>
					<th>Статус</th>
					<th>Действия</th>
				</tr>
			</thead>
			<tbody>
				{#each data.needsReviewRows as row}
					<tr>
						<td class="muted" style="font-size:12px; white-space:nowrap;">{formatDate(row.transactionDate)}</td>
						<td style="font-size:13px; max-width:300px;">{row.description}</td>
						<td class="amount" style="text-align:right; font-weight:600; white-space:nowrap; color:{row.amountCents >= 0 ? 'var(--success)' : 'var(--danger)'};">
							{formatAmount(row.amountCents)}
						</td>
						<td><span class="{matchBadgeCls(row.matchState)}" style="font-size:10px;">{matchStateLabels[row.matchState]}</span></td>
						<td>
							<div style="display:flex; flex-wrap:wrap; gap:6px; align-items:flex-start;">
								<form method="POST" action="?/markIrrelevant" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
									<input type="hidden" name="rowId" value={row.id} />
									<button type="submit" class="btn btn-ghost btn-sm" disabled={submitting}>Неотносим</button>
								</form>
								{#if row.amountCents > 0}
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => toggleIncomePanel(row.id)} style="color:var(--success);">
										Превърни в приход…
									</button>
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => toggleMatchPanel(row.id)}>
										Съвпадение с фактура…
									</button>
									{#if openIncomeRowId === row.id}
										<div style="margin-top:4px; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md); min-width:340px;">
											<form method="POST" action="?/convertToStandaloneIncome" enctype="multipart/form-data"
												style="display:flex; flex-direction:column; gap:8px;"
												use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; openIncomeRowId = null; await update(); }; }}>
												<input type="hidden" name="rowId" value={row.id} />
												<input class="input" name="source" type="text" placeholder="Източник (напр. Shopify, Физически магазин)" />
												<input class="input" name="description" type="text" placeholder="Описание" required value={row.description} />
												<label style="font-size:12px; color:var(--text-muted); display:flex; flex-direction:column; gap:4px;">
													Прикачени файлове (по избор)
													<input type="file" name="attachment" accept="application/pdf" multiple />
												</label>
												<button type="submit" class="btn btn-primary btn-sm" disabled={submitting}>Превърни в приход</button>
											</form>
										</div>
									{/if}
									{#if openMatchRowId === row.id}
										<div style="margin-top:4px; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md); display:flex; flex-direction:column; gap:8px; min-width:300px;">
											<form method="POST" action="?/manualMatchInvoice" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; openMatchRowId = null; await update(); }; }}>
												<input type="hidden" name="rowId" value={row.id} />
												<select class="select" name="invoiceId" bind:value={selectedInvoiceId[row.id]} style="width:100%; margin-bottom:8px;">
													<option value="">— Изберете фактура —</option>
													{#each data.openInvoices as inv}
														<option value={inv.id}>#{inv.invoiceNumber ?? 'черн.'} · {inv.clientName} · {formatAmount(inv.remainingCents)} остатък</option>
													{/each}
												</select>
												<button type="submit" class="btn btn-primary btn-sm" disabled={submitting || !selectedInvoiceId[row.id]}>Свържи</button>
											</form>
										</div>
									{/if}
								{:else}
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => toggleExpensePanel(row.id)}>
										Свържи с разход…
									</button>
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => toggleNewExpensePanel(row.id)}>
										Нов разход…
									</button>
									{#if openExpenseRowId === row.id}
										<div style="margin-top:4px; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md); display:flex; flex-direction:column; gap:8px; min-width:320px;">
											<form method="POST" action="?/matchExpense" enctype="multipart/form-data"
												style="display:flex; flex-direction:column; gap:8px;"
												use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; openExpenseRowId = null; await update(); }; }}>
												<input type="hidden" name="rowId" value={row.id} />
												<select class="select" name="expenseId" bind:value={selectedExpenseId[row.id]} style="width:100%;">
													<option value="">— Изберете разход —</option>
													{#each data.unpaidExpenses as exp}
														<option value={exp.id}>{exp.categoryName} · {exp.description} · {formatAmount(exp.amountCents)}</option>
													{/each}
												</select>
												<label style="font-size:12px; color:var(--text-muted); display:flex; flex-direction:column; gap:4px;">
													Прикачени файлове (по избор)
													<input type="file" name="attachment" accept="application/pdf" multiple />
												</label>
												<button type="submit" class="btn btn-primary btn-sm" disabled={submitting || !selectedExpenseId[row.id]}>Свържи</button>
											</form>
										</div>
									{/if}
									{#if openNewExpenseRowId === row.id}
										<div style="margin-top:4px; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md); min-width:340px;">
											<form method="POST" action="?/createAndMatchExpense" enctype="multipart/form-data"
												style="display:flex; flex-direction:column; gap:8px;"
												use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; openNewExpenseRowId = null; await update(); }; }}>
												<input type="hidden" name="rowId" value={row.id} />
												<select class="select" name="categoryId" required>
													<option value="">— Категория —</option>
													{#each data.expenseCategories as cat}
														<option value={cat.id}>{cat.name}</option>
													{/each}
												</select>
												<input class="input" name="description" type="text" placeholder="Описание" required
													value={row.description} />
												<div style="display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center;">
													<input class="input" name="amount" type="number" step="0.01" min="0.01"
														placeholder="Сума" required
														value={(Math.abs(row.amountCents) / 100).toFixed(2)}
														style="font-family:var(--font-mono);" />
													<span style="font-size:13px; color:var(--text-muted);">EUR</span>
												</div>
												<input class="input" name="incurredDate" type="date" required
													value={row.transactionDate instanceof Date
														? row.transactionDate.toISOString().slice(0, 10)
														: String(row.transactionDate).slice(0, 10)} />
												<label style="font-size:12px; color:var(--text-muted); display:flex; flex-direction:column; gap:4px;">
													Прикачени файлове (по избор)
													<input type="file" name="attachment" accept="application/pdf" multiple />
												</label>
												<button type="submit" class="btn btn-primary btn-sm" disabled={submitting}>Създай и свържи</button>
											</form>
										</div>
									{/if}
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<!-- Unmatched -->
{#if data.unmatchedRows.length > 0}
	<div class="card" style="margin-bottom:16px;">
		<div class="card-header">
			<div>
				<h3 class="card-title" style="color:var(--danger);">Несъвпадения</h3>
				<div class="card-sub">{data.unmatchedRows.length} реда без съвпадение</div>
			</div>
		</div>
		<table class="tbl">
			<thead>
				<tr>
					<th>Дата</th>
					<th>Описание</th>
					<th style="text-align:right;">Сума</th>
					<th>Статус</th>
					<th>Действия</th>
				</tr>
			</thead>
			<tbody>
				{#each data.unmatchedRows as row}
					<tr>
						<td class="muted" style="font-size:12px; white-space:nowrap;">{formatDate(row.transactionDate)}</td>
						<td style="font-size:13px; max-width:300px;">{row.description}</td>
						<td class="amount" style="text-align:right; font-weight:600; white-space:nowrap; color:{row.amountCents >= 0 ? 'var(--success)' : 'var(--danger)'};">
							{formatAmount(row.amountCents)}
						</td>
						<td><span class="{matchBadgeCls(row.matchState)}" style="font-size:10px;">{matchStateLabels[row.matchState]}</span></td>
						<td>
							<div style="display:flex; flex-wrap:wrap; gap:6px; align-items:flex-start;">
								<form method="POST" action="?/markIrrelevant" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
									<input type="hidden" name="rowId" value={row.id} />
									<button type="submit" class="btn btn-ghost btn-sm" disabled={submitting}>Неотносим</button>
								</form>
								{#if row.amountCents > 0}
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => toggleIncomePanel(row.id)} style="color:var(--success);">
										Превърни в приход…
									</button>
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => toggleMatchPanel(row.id)}>
										Съвпадение с фактура…
									</button>
									{#if openIncomeRowId === row.id}
										<div style="margin-top:4px; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md); min-width:340px;">
											<form method="POST" action="?/convertToStandaloneIncome" enctype="multipart/form-data"
												style="display:flex; flex-direction:column; gap:8px;"
												use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; openIncomeRowId = null; await update(); }; }}>
												<input type="hidden" name="rowId" value={row.id} />
												<input class="input" name="source" type="text" placeholder="Източник (напр. Shopify, Физически магазин)" />
												<input class="input" name="description" type="text" placeholder="Описание" required value={row.description} />
												<label style="font-size:12px; color:var(--text-muted); display:flex; flex-direction:column; gap:4px;">
													Прикачени файлове (по избор)
													<input type="file" name="attachment" accept="application/pdf" multiple />
												</label>
												<button type="submit" class="btn btn-primary btn-sm" disabled={submitting}>Превърни в приход</button>
											</form>
										</div>
									{/if}
									{#if openMatchRowId === row.id}
										<div style="margin-top:4px; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md); display:flex; flex-direction:column; gap:8px; min-width:300px;">
											<form method="POST" action="?/manualMatchInvoice" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; openMatchRowId = null; await update(); }; }}>
												<input type="hidden" name="rowId" value={row.id} />
												<select class="select" name="invoiceId" bind:value={selectedInvoiceId[row.id]} style="width:100%; margin-bottom:8px;">
													<option value="">— Изберете фактура —</option>
													{#each data.openInvoices as inv}
														<option value={inv.id}>#{inv.invoiceNumber ?? 'черн.'} · {inv.clientName} · {formatAmount(inv.remainingCents)} остатък</option>
													{/each}
												</select>
												<button type="submit" class="btn btn-primary btn-sm" disabled={submitting || !selectedInvoiceId[row.id]}>Свържи</button>
											</form>
										</div>
									{/if}
								{:else}
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => toggleExpensePanel(row.id)}>
										Свържи с разход…
									</button>
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => toggleNewExpensePanel(row.id)}>
										Нов разход…
									</button>
									{#if openExpenseRowId === row.id}
										<div style="margin-top:4px; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md); display:flex; flex-direction:column; gap:8px; min-width:320px;">
											<form method="POST" action="?/matchExpense" enctype="multipart/form-data"
												style="display:flex; flex-direction:column; gap:8px;"
												use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; openExpenseRowId = null; await update(); }; }}>
												<input type="hidden" name="rowId" value={row.id} />
												<select class="select" name="expenseId" bind:value={selectedExpenseId[row.id]} style="width:100%;">
													<option value="">— Изберете разход —</option>
													{#each data.unpaidExpenses as exp}
														<option value={exp.id}>{exp.categoryName} · {exp.description} · {formatAmount(exp.amountCents)}</option>
													{/each}
												</select>
												<label style="font-size:12px; color:var(--text-muted); display:flex; flex-direction:column; gap:4px;">
													Прикачени файлове (по избор)
													<input type="file" name="attachment" accept="application/pdf" multiple />
												</label>
												<button type="submit" class="btn btn-primary btn-sm" disabled={submitting || !selectedExpenseId[row.id]}>Свържи</button>
											</form>
										</div>
									{/if}
									{#if openNewExpenseRowId === row.id}
										<div style="margin-top:4px; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md); min-width:340px;">
											<form method="POST" action="?/createAndMatchExpense" enctype="multipart/form-data"
												style="display:flex; flex-direction:column; gap:8px;"
												use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; openNewExpenseRowId = null; await update(); }; }}>
												<input type="hidden" name="rowId" value={row.id} />
												<select class="select" name="categoryId" required>
													<option value="">— Категория —</option>
													{#each data.expenseCategories as cat}
														<option value={cat.id}>{cat.name}</option>
													{/each}
												</select>
												<input class="input" name="description" type="text" placeholder="Описание" required
													value={row.description} />
												<div style="display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center;">
													<input class="input" name="amount" type="number" step="0.01" min="0.01"
														placeholder="Сума" required
														value={(Math.abs(row.amountCents) / 100).toFixed(2)}
														style="font-family:var(--font-mono);" />
													<span style="font-size:13px; color:var(--text-muted);">EUR</span>
												</div>
												<input class="input" name="incurredDate" type="date" required
													value={row.transactionDate instanceof Date
														? row.transactionDate.toISOString().slice(0, 10)
														: String(row.transactionDate).slice(0, 10)} />
												<label style="font-size:12px; color:var(--text-muted); display:flex; flex-direction:column; gap:4px;">
													Прикачени файлове (по избор)
													<input type="file" name="attachment" accept="application/pdf" multiple />
												</label>
												<button type="submit" class="btn btn-primary btn-sm" disabled={submitting}>Създай и свържи</button>
											</form>
										</div>
									{/if}
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<!-- Matched -->
{#if data.matchedRows.length > 0}
	<div class="card" style="margin-bottom:16px;">
		<div class="card-header">
			<div>
				<h3 class="card-title" style="color:var(--success);">Съвпадения</h3>
				<div class="card-sub">{data.matchedRows.length} реда съвпаднати</div>
			</div>
		</div>
		<table class="tbl">
			<thead>
				<tr>
					<th>Дата</th>
					<th>Описание</th>
					<th style="text-align:right;">Сума</th>
					<th>Статус</th>
					<th>Свързано с</th>
					<th>Действия</th>
				</tr>
			</thead>
			<tbody>
				{#each data.matchedRows as row}
					<tr>
						<td class="muted" style="font-size:12px; white-space:nowrap;">{formatDate(row.transactionDate)}</td>
						<td style="font-size:13px; max-width:260px;">{row.description}</td>
						<td class="amount" style="text-align:right; font-weight:600; white-space:nowrap; color:{row.amountCents >= 0 ? 'var(--success)' : 'var(--danger)'};">
							{formatAmount(row.amountCents)}
						</td>
						<td><span class="{matchBadgeCls(row.matchState)}" style="font-size:10px;">{matchStateLabels[row.matchState]}</span></td>
						<td style="font-size:12px; max-width:200px;">
							{#if row.invoicePayment}
								<a href="/invoices" style="color:var(--accent); text-decoration:none;">
									Фактура #{row.invoicePayment.invoice?.invoiceNumber ?? '—'}
									{#if row.invoicePayment.invoice?.client}· {row.invoicePayment.invoice.client.legalName}{/if}
								</a>
							{:else if row.standaloneIncome}
								<span style="color:var(--success);">Приход: {row.standaloneIncome.description}</span>
							{:else if row.expense}
								<div>
									<span style="color:var(--danger);">Разход: {row.expense.category.name} · {row.expense.description}</span>
									{#if row.expense.attachments.length > 0}
										<div style="margin-top:4px; display:flex; flex-direction:column; gap:2px;">
											{#each row.expense.attachments as att}
												<a href="/bank-statements/attachments/pdf/expense/{att.id}" target="_blank"
													style="color:var(--accent); text-decoration:none; font-size:11px; white-space:nowrap;">
													↗ {att.originalFilename}
												</a>
											{/each}
										</div>
									{/if}
								</div>
							{:else}
								<span class="muted">—</span>
							{/if}
						</td>
						<td>
							<div style="display:flex; flex-wrap:wrap; gap:6px; align-items:flex-start;">
								<form method="POST" action="?/unresolveRow" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
									<input type="hidden" name="rowId" value={row.id} />
									<button type="submit" class="btn btn-ghost btn-sm" disabled={submitting}>Развъзи</button>
								</form>
								{#if row.expense}
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => toggleExpenseAttachmentPanel(row.id)}>
										Прикачи PDF…
									</button>
									{#if openExpenseAttachmentRowId === row.id}
										<div style="margin-top:4px; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md); min-width:300px;">
											<form method="POST" action="?/addExpenseAttachment" enctype="multipart/form-data"
												style="display:flex; flex-direction:column; gap:8px;"
												use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; openExpenseAttachmentRowId = null; await update(); }; }}>
												<input type="hidden" name="expenseId" value={row.expense.id} />
												<label style="font-size:12px; color:var(--text-muted); display:flex; flex-direction:column; gap:4px;">
													Изберете файлове
													<input type="file" name="attachment" accept="application/pdf" multiple required />
												</label>
												<button type="submit" class="btn btn-primary btn-sm" disabled={submitting}>Прикачи</button>
											</form>
										</div>
									{/if}
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<!-- Irrelevant -->
{#if data.irrelevantRows.length > 0}
	<div class="card" style="margin-bottom:16px;">
		<div class="card-header">
			<div>
				<h3 class="card-title">Неотносими</h3>
				<div class="card-sub">{data.irrelevantRows.length} маркирани като неотносими</div>
			</div>
		</div>
		<table class="tbl">
			<thead>
				<tr>
					<th>Дата</th>
					<th>Описание</th>
					<th style="text-align:right;">Сума</th>
					<th>Статус</th>
					<th>Действия</th>
				</tr>
			</thead>
			<tbody>
				{#each data.irrelevantRows as row}
					<tr style="opacity:0.6;">
						<td class="muted" style="font-size:12px; white-space:nowrap;">{formatDate(row.transactionDate)}</td>
						<td style="font-size:13px; max-width:300px;">{row.description}</td>
						<td class="amount" style="text-align:right; white-space:nowrap;">{formatAmount(row.amountCents)}</td>
						<td><span class="{matchBadgeCls(row.matchState)}" style="font-size:10px;">{matchStateLabels[row.matchState]}</span></td>
						<td>
							<form method="POST" action="?/unresolveRow" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
								<input type="hidden" name="rowId" value={row.id} />
								<button type="submit" class="btn btn-ghost btn-sm" disabled={submitting}>Развъзи</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

{#if data.matchedRows.length === 0 && data.needsReviewRows.length === 0 && data.unmatchedRows.length === 0 && data.irrelevantRows.length === 0}
	<div class="card" style="padding:40px; text-align:center;">
		<div class="muted">Извлечението не съдържа редове.</div>
	</div>
{/if}
