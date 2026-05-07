<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

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
</script>

<svelte:head>
	<title>Чернови фактури - Иномедия</title>
</svelte:head>

<section class="page-header">
	<div>
		<h1>Чернови фактури</h1>
		<p>Резервирана работа по клиенти, готова за редакция и издаване в следващите стъпки.</p>
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
						<span>{draft.taskSelections.length} задачи</span>
					</div>
				</header>

				<div class="meta-grid">
					<div>
						<span class="meta-label">Период от</span>
						<span>{formatDate(draft.servicePeriodFrom)}</span>
					</div>
					<div>
						<span class="meta-label">Период до</span>
						<span>{formatDate(draft.servicePeriodTo)}</span>
					</div>
					<div>
						<span class="meta-label">Нетно</span>
						<span>{formatMoney(draft.netTotalCents)}</span>
					</div>
					<div>
						<span class="meta-label">ДДС</span>
						<span>{formatMoney(draft.vatTotalCents)}</span>
					</div>
				</div>

				<div class="selection-list">
					{#each draft.taskSelections as selection}
						<div class="selection-row">
							<div>
								<strong>{selection.task.title}</strong>
								<span>{selection.task.taskList.project.name}</span>
							</div>
							<div class="selection-amount">
								{formatMoney(selection.hourlyUninvoicedValueCents ?? selection.flatFeeValueCents ?? 0)}
							</div>
						</div>
					{/each}
				</div>
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

	.btn-secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 10px 14px;
		border: 1px solid #cbd5e1;
		border-radius: 10px;
		background: #fff;
		color: #0f172a;
		font-weight: 700;
		text-decoration: none;
	}

	.alert.success {
		padding: 12px 14px;
		border-radius: 10px;
		margin-bottom: 16px;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: #166534;
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

	.draft-list {
		display: grid;
		gap: 16px;
	}

	.draft-header,
	.selection-row {
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
	.selection-amount,
	.selection-list,
	.meta-grid {
		display: grid;
		gap: 6px;
	}

	.meta-grid {
		grid-template-columns: repeat(4, minmax(0, 1fr));
		margin: 18px 0;
		padding: 14px 0;
		border-top: 1px solid #e2e8f0;
		border-bottom: 1px solid #e2e8f0;
	}

	.selection-list {
		gap: 10px;
	}

	.selection-row {
		padding: 12px 0;
		border-top: 1px solid #eef2f7;
	}

	.selection-row:first-child {
		border-top: none;
	}

	.selection-row span,
	.draft-totals span {
		color: #64748b;
	}

	@media (max-width: 900px) {
		.page-header,
		.draft-header,
		.selection-row {
			flex-direction: column;
		}

		.meta-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
