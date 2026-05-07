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
</script>

<svelte:head>
	<title>Чернови фактури - Иномедия</title>
</svelte:head>

<section class="page-header">
	<div>
		<h1>Чернови фактури</h1>
		<p>Преглед и редакция на чернови фактури преди издаване.</p>
	</div>
	<a class="btn-secondary" href="/invoiceable-work">Към работа за фактуриране</a>
</section>

{#if data.draftCreated}
	<div class="alert success">Черновата е създадена.</div>
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
						<div class="eyebrow">Клиент</div>
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
							<span class="meta-label">Общо</span>
							<strong>{formatMoney(draft.netTotalCents)}</strong>
							<small>Нетно</small>
						</div>
						<div class="field totals-field">
							<span class="meta-label">ДДС</span>
							<strong>{formatMoney(draft.vatTotalCents)}</strong>
							<small>{(draft.vatRateBasisPoints / 100).toFixed(2)}%</small>
						</div>
						<div class="field totals-field">
							<span class="meta-label">Крайна сума</span>
							<strong>{formatMoney(draft.grossTotalCents)}</strong>
							<small>С ДДС</small>
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
							<button class="btn-primary" type="submit" formaction="?/saveDraft">
								Запази чернова
							</button>
						</div>
					</div>
				</form>
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

	.page-header p {
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
	.draft-card {
		padding: 20px;
	}

	.draft-list,
	.draft-form,
	.selection-list {
		display: grid;
		gap: 16px;
	}

	.draft-header,
	.selection-head,
	.draft-actions,
	.draft-buttons {
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
	textarea {
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

	.totals-field strong {
		font-size: 1.05rem;
		color: #0f172a;
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
		display: grid;
		gap: 12px;
	}

	.selection-amount {
		font-weight: 700;
		color: #0f172a;
	}

	.draft-actions {
		align-items: center;
		padding-top: 4px;
	}

	.draft-buttons {
		justify-content: flex-end;
	}

	@media (max-width: 960px) {
		.page-header,
		.draft-header,
		.selection-head,
		.draft-actions,
		.draft-buttons {
			flex-direction: column;
		}

		.meta-grid {
			grid-template-columns: 1fr;
		}

		.selection-amount,
		.draft-totals {
			text-align: left;
		}
	}
</style>
