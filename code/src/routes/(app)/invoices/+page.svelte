<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function draftFormState() {
		return form as
			| {
					draftId?: string;
					draftError?: string;
					draftSuccess?: string;
			  }
			| null;
	}

	function paymentFormState() {
		return form as
			| {
					paymentInvoiceId?: string;
					paymentError?: string;
					paymentSuccess?: string;
					paymentMethodInvoiceId?: string;
					paymentMethodError?: string;
					paymentMethodSuccess?: string;
			  }
			| null;
	}

	function formatMoney(value: number) {
		return `${(value / 100).toFixed(2)} ${data.company.currency}`;
	}

	function formatDate(value: string | Date | null) {
		if (!value) {
			return 'Няма';
		}

		return new Intl.DateTimeFormat('bg-BG', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(value));
	}

	function dateInputValue(value: string | Date | null) {
		if (!value) {
			return '';
		}

		return new Date(value).toISOString().slice(0, 10);
	}

	function lineAmount(selection: {
		hourlyUninvoicedValueCents: number | null;
		flatFeeValueCents: number | null;
	}) {
		return selection.hourlyUninvoicedValueCents ?? selection.flatFeeValueCents ?? 0;
	}

	function invoiceStatusLabel(status: string) {
		const labels: Record<string, string> = {
			issued: 'Издадена',
			partially_paid: 'Частично платена',
			paid: 'Платена',
			overdue: 'Просрочена',
			draft: 'Чернова',
			voided: 'Анулирана'
		};
		return labels[status] ?? status;
	}

	function paymentMethodLabel(method: string) {
		return method === 'cash' ? 'В брой' : 'Банков превод';
	}

	function isFinanceUser() {
		return data.user?.role === 'admin' || data.user?.role === 'accountant';
	}

	function todayInputValue() {
		return new Date().toISOString().slice(0, 10);
	}
</script>

<svelte:head>
	<title>Фактури - Иномедия</title>
</svelte:head>

<section class="page-header">
	<div>
		<h1>Фактури</h1>
		<p>Преглед, редакция и издаване на клиентски фактури.</p>
	</div>
	<a class="btn-secondary" href="/invoiceable-work">Към работа за фактуриране</a>
</section>

{#if data.draftCreated}
	<div class="alert success">Черновата е създадена.</div>
{/if}

{#if data.issuedInvoiceId}
	<div class="alert success">
		Фактурата е издадена.
		<a href={`/invoices/${data.issuedInvoiceId}/pdf`} target="_blank" rel="noreferrer">Отвори PDF</a>
	</div>
{/if}

{#if data.drafts.length === 0}
	<section class="card empty-card">
		<h2>Няма чернови</h2>
		<p>Създайте първата чернова от екрана за работа за фактуриране.</p>
	</section>
{:else}
	<div class="draft-list">
		{#each data.drafts as draft}
			<section class="card draft-card">
				<header class="draft-header">
					<div>
						<div class="eyebrow">Чернова</div>
						<h2>{draft.client.legalName}</h2>
						<p>Създадена от {draft.createdByUser.firstName} {draft.createdByUser.lastName}</p>
					</div>
					<div class="draft-totals">
						<strong>{formatMoney(draft.grossTotalCents)}</strong>
						<span>{draft.taskSelections.length} реда по задачи</span>
					</div>
				</header>

				{#if draftFormState()?.draftId === draft.id && draftFormState()?.draftError}
					<div class="alert error">{draftFormState()?.draftError}</div>
				{/if}

				{#if draftFormState()?.draftId === draft.id && draftFormState()?.draftSuccess}
					<div class="alert success">{draftFormState()?.draftSuccess}</div>
				{/if}

				<form method="POST" class="draft-form">
					<input type="hidden" name="invoiceId" value={draft.id} />

					<div class="meta-grid">
						<div class="field">
							<label for={`servicePeriodFrom-${draft.id}`}>Период от</label>
							<input
								id={`servicePeriodFrom-${draft.id}`}
								name="servicePeriodFrom"
								type="date"
								value={dateInputValue(draft.servicePeriodFrom)}
							/>
						</div>
						<div class="field">
							<label for={`servicePeriodTo-${draft.id}`}>Период до</label>
							<input
								id={`servicePeriodTo-${draft.id}`}
								name="servicePeriodTo"
								type="date"
								value={dateInputValue(draft.servicePeriodTo)}
							/>
						</div>
						<div class="field">
							<label for={`dueDate-${draft.id}`}>Падеж</label>
							<input
								id={`dueDate-${draft.id}`}
								name="dueDate"
								type="date"
								value={dateInputValue(draft.dueDate)}
							/>
						</div>
						<div class="field totals-field">
							<span class="meta-label">Нетно</span>
							<strong>{formatMoney(draft.netTotalCents)}</strong>
						</div>
						<div class="field totals-field">
							<span class="meta-label">ДДС</span>
							<strong>{formatMoney(draft.vatTotalCents)}</strong>
							<small>{(draft.vatRateBasisPoints / 100).toFixed(2)}%</small>
						</div>
						<div class="field totals-field">
							<span class="meta-label">Крайна сума</span>
							<strong>{formatMoney(draft.grossTotalCents)}</strong>
						</div>
					</div>

					<div class="selection-list">
						{#each draft.taskSelections as selection}
							<section class="selection-card">
								<div class="selection-head">
									<div>
										<strong>{selection.task.title}</strong>
										<span>{selection.task.taskList.project.name}</span>
									</div>
									<div class="selection-amount">{formatMoney(lineAmount(selection))}</div>
								</div>

								<div class="field">
									<label for={`description-${selection.id}`}>Описание на реда</label>
									<textarea
										id={`description-${selection.id}`}
										name={`description:${selection.id}`}
										rows="3"
									>{selection.description}</textarea>
								</div>
							</section>
						{/each}
					</div>

					<div class="draft-actions">
						<div class="draft-note">
							<span>Последна промяна: {formatDate(draft.lastUpdatedAt)}</span>
						</div>
						<div class="draft-buttons">
							<button class="btn-secondary" type="submit" formaction="?/recalculateDraft">
								Преизчисли
							</button>
							<button class="btn-secondary" type="submit" formaction="?/saveDraft">
								Запази
							</button>
							<button class="btn-primary" type="submit" formaction="?/issueDraft">
								Издай фактура
							</button>
						</div>
					</div>
				</form>
			</section>
		{/each}
	</div>
{/if}

<section class="issued-section">
	<h2 class="section-title">Издадени фактури</h2>

	<form method="GET" class="filter-bar">
		<select name="status" onchange={() => (document.activeElement as HTMLSelectElement)?.form?.submit()}>
			<option value="" selected={!data.filters.status}>Всички статуси</option>
			<option value="issued" selected={data.filters.status === 'issued'}>Издадена</option>
			<option value="partially_paid" selected={data.filters.status === 'partially_paid'}>Частично платена</option>
			<option value="paid" selected={data.filters.status === 'paid'}>Платена</option>
			<option value="overdue" selected={data.filters.status === 'overdue'}>Просрочена</option>
			<option value="voided" selected={data.filters.status === 'voided'}>Анулирана</option>
		</select>

		<select name="clientId" onchange={() => (document.activeElement as HTMLSelectElement)?.form?.submit()}>
			<option value="" selected={!data.filters.clientId}>Всички клиенти</option>
			{#each data.clients as client}
				<option value={client.id} selected={data.filters.clientId === client.id}>{client.legalName}</option>
			{/each}
		</select>

		<input
			type="date"
			name="dateFrom"
			value={data.filters.dateFrom}
			placeholder="От дата"
			title="Издадена от"
		/>

		<input
			type="date"
			name="dateTo"
			value={data.filters.dateTo}
			placeholder="До дата"
			title="Издадена до"
		/>

		<input
			type="text"
			name="search"
			value={data.filters.search}
			placeholder="Търсене по номер или клиент"
		/>

		<button type="submit" class="btn-secondary">Филтрирай</button>
		<a href="/invoices" class="btn-secondary">Изчисти</a>
	</form>
</section>

{#if data.issuedInvoices.length > 0}
	<div class="issued-list">
		{#each data.issuedInvoices as invoice}
			<section class="card issued-card">
				<header class="issued-card-header">
					<div class="issued-card-title">
						<div class="eyebrow">№ {invoice.invoiceNumber ?? 'Без номер'}</div>
						<h2>{invoice.client.legalName}</h2>
						<div class="issued-meta">
							Издадена: {formatDate(invoice.issueDate)}
							{#if invoice.dueDate} · Падеж: {formatDate(invoice.dueDate)}{/if}
						</div>
					</div>
					<div class="issued-summary">
						<div class="summary-item">
							<span class="meta-label">Обща сума</span>
							<strong>{formatMoney(invoice.grossTotalCents)}</strong>
						</div>
						<div class="summary-item">
							<span class="meta-label">Платено</span>
							<strong class="paid-amount">{formatMoney(invoice.paidTotalCents)}</strong>
						</div>
						<div class="summary-item">
							<span class="meta-label">Остатък</span>
							<strong class="remaining-amount">{formatMoney(invoice.grossTotalCents - invoice.paidTotalCents)}</strong>
						</div>
						<div class="summary-item">
							<span class="meta-label">Статус</span>
							<span class="status-badge status-{invoice.status}">{invoiceStatusLabel(invoice.status)}</span>
						</div>
					</div>
					<div class="issued-card-actions">
						<a class="btn-secondary" href={`/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
					</div>
				</header>

				{#if paymentFormState()?.paymentInvoiceId === invoice.id && paymentFormState()?.paymentError}
					<div class="alert error">{paymentFormState()?.paymentError}</div>
				{/if}
				{#if paymentFormState()?.paymentInvoiceId === invoice.id && paymentFormState()?.paymentSuccess}
					<div class="alert success">{paymentFormState()?.paymentSuccess}</div>
				{/if}
				{#if paymentFormState()?.paymentMethodInvoiceId === invoice.id && paymentFormState()?.paymentMethodError}
					<div class="alert error">{paymentFormState()?.paymentMethodError}</div>
				{/if}
				{#if paymentFormState()?.paymentMethodInvoiceId === invoice.id && paymentFormState()?.paymentMethodSuccess}
					<div class="alert success">{paymentFormState()?.paymentMethodSuccess}</div>
				{/if}

				{#if invoice.payments.length > 0}
					<div class="payments-section">
						<div class="eyebrow payments-title">Плащания</div>
						<div class="payments-list">
							{#each invoice.payments as payment}
								<div class="payment-row">
									<span class="payment-date">{formatDate(payment.paymentDate)}</span>
									<span class="payment-method">{paymentMethodLabel(payment.paymentMethod)}</span>
									{#if payment.notes}<span class="payment-notes">{payment.notes}</span>{/if}
									<span class="payment-amount">{formatMoney(payment.amountCents)}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if isFinanceUser() && invoice.payments.length === 0 && invoice.status === 'issued'}
					<form method="POST" action="?/updatePaymentMethod" class="payment-method-form">
						<input type="hidden" name="invoiceId" value={invoice.id} />
						<div class="field">
							<label for={`paymentMethod-${invoice.id}`}>Метод на плащане</label>
							<select id={`paymentMethod-${invoice.id}`} name="paymentMethod">
								<option value="bank_transfer" selected={invoice.paymentMethod === 'bank_transfer'}>Банков превод</option>
								<option value="cash" selected={invoice.paymentMethod === 'cash'}>В брой</option>
							</select>
						</div>
						<button class="btn-secondary" type="submit">Запази метод</button>
					</form>
				{:else if invoice.payments.length === 0}
					<div class="payment-method-display">
						<span class="meta-label">Метод на плащане</span>
						<span>{paymentMethodLabel(invoice.paymentMethod)}</span>
					</div>
				{/if}

				{#if isFinanceUser() && (invoice.status === 'issued' || invoice.status === 'partially_paid')}
					<form method="POST" action="?/recordPayment" class="record-payment-form">
						<input type="hidden" name="invoiceId" value={invoice.id} />
						<div class="payment-fields">
							<div class="field">
								<label for={`amount-${invoice.id}`}>Сума (EUR)</label>
								<input
									id={`amount-${invoice.id}`}
									name="amount"
									type="number"
									min="0.01"
									step="0.01"
									placeholder="0.00"
									required
								/>
							</div>
							<div class="field">
								<label for={`paymentDate-${invoice.id}`}>Дата</label>
								<input
									id={`paymentDate-${invoice.id}`}
									name="paymentDate"
									type="date"
									value={todayInputValue()}
									required
								/>
							</div>
							<div class="field">
								<label for={`recordPaymentMethod-${invoice.id}`}>Метод</label>
								<select id={`recordPaymentMethod-${invoice.id}`} name="paymentMethod">
									<option value="bank_transfer" selected={invoice.paymentMethod === 'bank_transfer'}>Банков превод</option>
									<option value="cash" selected={invoice.paymentMethod === 'cash'}>В брой</option>
								</select>
							</div>
							<div class="field">
								<label for={`notes-${invoice.id}`}>Бележки (по желание)</label>
								<input
									id={`notes-${invoice.id}`}
									name="notes"
									type="text"
									placeholder="Бележка към плащането"
								/>
							</div>
						</div>
						<div class="record-payment-footer">
							<button class="btn-primary" type="submit">Запиши плащане</button>
						</div>
					</form>
				{/if}
			</section>
		{/each}
	</div>
{/if}

<style>
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 24px;
	}

	h1,
	h2 {
		margin: 0;
		color: #0f172a;
	}

	.page-header p,
	.issued-meta {
		margin: 8px 0 0;
		color: #64748b;
	}

	.btn-primary,
	.btn-secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 10px 14px;
		border-radius: 10px;
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
		font: inherit;
	}

	.btn-primary {
		border: none;
		background: #2563eb;
		color: #fff;
	}

	.btn-secondary {
		border: 1px solid #cbd5e1;
		background: #fff;
		color: #0f172a;
	}

	.alert {
		padding: 12px 14px;
		border-radius: 10px;
		margin-bottom: 16px;
	}

	.alert a {
		font-weight: 700;
		margin-left: 8px;
	}

	.alert.success {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: #166534;
	}

	.alert.error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #b91c1c;
	}

	.card {
		background: #fff;
		border-radius: 14px;
		box-shadow: 0 2px 16px rgba(15, 23, 42, 0.06);
	}

	.empty-card,
	.draft-card,
	.issued-card {
		padding: 20px;
	}

	.draft-list,
	.draft-form,
	.selection-list,
	.issued-list {
		display: grid;
		gap: 16px;
	}

	.draft-header,
	.selection-head,
	.draft-actions,
	.draft-buttons,
	.section-header {
		display: flex;
		justify-content: space-between;
		gap: 16px;
	}

	.eyebrow,
	.meta-label {
		display: block;
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #64748b;
	}

	.draft-totals,
	.selection-amount {
		display: grid;
		gap: 6px;
		text-align: right;
	}

	.meta-grid {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 14px;
		padding: 16px 0;
		border-top: 1px solid #e2e8f0;
		border-bottom: 1px solid #e2e8f0;
	}

	.field {
		display: grid;
		gap: 6px;
	}

	label {
		font-size: 0.88rem;
		font-weight: 600;
		color: #334155;
	}

	input,
	textarea,
	select {
		width: 100%;
		border: 1px solid #cbd5e1;
		border-radius: 10px;
		padding: 10px 12px;
		background: #fff;
		color: #0f172a;
		font: inherit;
	}

	textarea {
		resize: vertical;
		min-height: 88px;
	}

	.totals-field {
		align-content: start;
	}

	.totals-field strong,
	.selection-amount {
		font-size: 1.05rem;
		color: #0f172a;
		font-weight: 700;
	}

	.totals-field small,
	.selection-head span,
	.draft-totals span,
	.draft-note {
		color: #64748b;
	}

	.selection-card {
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		padding: 16px;
	}

	.selection-card {
		display: grid;
		gap: 12px;
	}

	.draft-actions {
		align-items: center;
		padding-top: 4px;
	}

	.draft-buttons {
		justify-content: flex-end;
		align-items: center;
	}

	/* Issued invoices */

	.issued-card {
		display: grid;
		gap: 16px;
	}

	.issued-card-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
	}

	.issued-card-title h2 {
		margin: 4px 0;
	}

	.issued-summary {
		display: flex;
		gap: 20px;
		align-items: flex-start;
	}

	.summary-item {
		display: grid;
		gap: 4px;
		text-align: right;
	}

	.summary-item strong {
		font-size: 1rem;
		color: #0f172a;
		font-weight: 700;
	}

	.paid-amount {
		color: #166534;
	}

	.remaining-amount {
		color: #92400e;
	}

	.issued-card-actions {
		display: flex;
		gap: 8px;
		align-items: flex-start;
	}

	.status-badge {
		display: inline-block;
		padding: 3px 10px;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 700;
	}

	.status-issued {
		background: #eff6ff;
		color: #1d4ed8;
	}

	.status-partially_paid {
		background: #fffbeb;
		color: #92400e;
	}

	.status-paid {
		background: #f0fdf4;
		color: #166534;
	}

	.status-overdue {
		background: #fef2f2;
		color: #b91c1c;
	}

	.payments-section {
		border-top: 1px solid #e2e8f0;
		padding-top: 14px;
	}

	.payments-title {
		margin-bottom: 10px;
	}

	.payments-list {
		display: grid;
		gap: 8px;
	}

	.payment-row {
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 10px 14px;
		background: #f8fafc;
		border-radius: 10px;
		font-size: 0.92rem;
	}

	.payment-date {
		font-weight: 600;
		color: #0f172a;
	}

	.payment-method {
		color: #64748b;
	}

	.payment-notes {
		color: #64748b;
		flex: 1;
		font-style: italic;
	}

	.payment-amount {
		font-weight: 700;
		color: #0f172a;
		margin-left: auto;
	}

	.payment-method-form {
		display: flex;
		align-items: flex-end;
		gap: 12px;
		padding-top: 8px;
		border-top: 1px solid #e2e8f0;
	}

	.payment-method-form .field {
		flex: 0 0 200px;
	}

	.payment-method-display {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-top: 8px;
		border-top: 1px solid #e2e8f0;
		font-size: 0.92rem;
	}

	.record-payment-form {
		border-top: 1px solid #e2e8f0;
		padding-top: 14px;
		display: grid;
		gap: 12px;
	}

	.payment-fields {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}

	.record-payment-footer {
		display: flex;
		justify-content: flex-end;
	}

	.issued-section {
		margin-bottom: 0;
	}

	.section-title {
		margin-bottom: 12px;
	}

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
		border-radius: 5px;
	}

	.filter-bar input[type='text'] {
		min-width: 200px;
	}

	@media (max-width: 960px) {
		.page-header,
		.draft-header,
		.selection-head,
		.draft-actions,
		.draft-buttons,
		.issued-card-header,
		.issued-summary,
		.section-header {
			flex-direction: column;
		}

		.meta-grid,
		.payment-fields {
			grid-template-columns: 1fr;
		}

		.selection-amount,
		.draft-totals {
			text-align: left;
		}

		.summary-item {
			text-align: left;
		}

		.payment-method-form {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
