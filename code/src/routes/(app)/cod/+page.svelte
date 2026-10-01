<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { PageData, ActionData } from './$types';
	import { fmtDate as formatDate } from '$lib/utils/format';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let syncing = $state(false);
	let editingLineId = $state<string | null>(null);

	function formatAmount(cents: number): string {
		const sign = cents < 0 ? '-' : '';
		return `${sign}${(Math.abs(cents) / 100).toFixed(2)} EUR`;
	}

	const courierLabels: Record<string, string> = { econt: 'Еконт', speedy: 'Спиди' };
	const kindLabels: Record<string, string> = {
		unresolved: 'Неразпозната',
		shop_order: 'inobags.com',
		other: 'Ръчна изработка / друг'
	};
	const kindBadge: Record<string, string> = {
		unresolved: 'badge inv-overdue',
		shop_order: 'badge inv-paid',
		other: 'badge inv-partial'
	};

	function changeMonth(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		if (value) goto(`?month=${value}`);
	}
</script>

<svelte:head>
	<title>Наложени платежи</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Наложени платежи</h1>
		<p class="page-sub">Изплащания от Еконт и Спиди, пратките в тях и поръчките от inobags.com</p>
	</div>
	<div class="page-header-actions">
		<input class="input" type="month" value={data.month} onchange={changeMonth} style="width:auto;" />
		<form
			method="POST"
			action="?/sync"
			use:enhance={() => {
				syncing = true;
				return async ({ update }) => {
					syncing = false;
					await update();
				};
			}}
		>
			<input type="hidden" name="month" value={data.month} />
			<button type="submit" class="btn btn-primary btn-sm" disabled={syncing}>
				{syncing ? 'Синхронизиране...' : 'Синхронизирай месеца'}
			</button>
		</form>
	</div>
</div>

{#if form?.error}
	<div class="alert danger" style="margin-bottom: 16px;">{form.error}</div>
{/if}
{#if form?.success}
	<div class="alert success" style="margin-bottom: 16px;">{form.success}</div>
{/if}
{#if form && 'warnings' in form && form.warnings?.length}
	<div class="alert warning" style="margin-bottom: 16px;">
		{#each form.warnings as w}<div>{w}</div>{/each}
	</div>
{/if}

<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:20px;">
	<div class="stat" style="padding:16px;">
		<div class="stat-label">Изплащания</div>
		<div class="amount" style="font-size:22px; font-weight:600;">{data.summary.payoutCount}</div>
		<div class="muted" style="font-size:11px;">{formatAmount(data.summary.totalCents)}</div>
	</div>
	<div class="stat" style="padding:16px;">
		<div class="stat-label">Без банков ред</div>
		<div class="amount" style="font-size:22px; font-weight:600; color:{data.summary.unmatchedPayouts ? 'var(--danger)' : 'var(--text)'};">
			{data.summary.unmatchedPayouts}
		</div>
	</div>
	<div class="stat" style="padding:16px;">
		<div class="stat-label">Пратки</div>
		<div class="amount" style="font-size:22px; font-weight:600;">{data.summary.lineCount}</div>
		<div class="muted" style="font-size:11px;">
			{data.summary.shopOrderLines} inobags · {data.summary.otherLines} други
		</div>
	</div>
	<div class="stat" style="padding:16px;">
		<div class="stat-label">За обяснение</div>
		<div class="amount" style="font-size:22px; font-weight:600; color:{data.summary.unresolvedLines ? 'var(--danger)' : 'var(--text)'};">
			{data.summary.unresolvedLines}
		</div>
		{#if data.summary.missingPdf}
			<div class="muted" style="font-size:11px;">{data.summary.missingPdf} поръчки без PDF</div>
		{/if}
	</div>
</div>

{#if data.payouts.length === 0}
	<div class="card">
		<div class="card-body">
			<p class="muted">Няма изплащания за този месец. Натиснете „Синхронизирай месеца“.</p>
		</div>
	</div>
{/if}

{#each data.payouts as payout (payout.id)}
	<div class="card" style="margin-bottom: 16px;">
		<div class="card-header">
			<div>
				<h2 class="card-title">
					{courierLabels[payout.courier]} · {formatDate(payout.payoutDate)} · {formatAmount(payout.amountCents)}
				</h2>
				<span class="card-sub">
					{#if payout.courier === 'speedy'}Документ {payout.externalRef} · {/if}{payout.lines.length} пратки
				</span>
			</div>
			{#if payout.statementRow}
				<a href="/bank-statements/{payout.statementRow.statementId}" class="badge inv-paid" title={payout.statementRow.description}>
					Банка {formatDate(payout.statementRow.transactionDate)} · {formatAmount(payout.statementRow.amountCents)}
				</a>
			{:else if payout.paidInCash}
				<span class="badge inv-partial">В брой · каса</span>
			{:else}
				<span class="badge inv-overdue">Няма банков ред</span>
			{/if}
		</div>
		<table class="tbl">
			<thead>
				<tr>
					<th>Товарителница</th>
					<th>Получател</th>
					<th class="num">Сума</th>
					<th>Вид</th>
					<th>Документ / обяснение</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each payout.lines as line (line.id)}
					<tr>
						<td class="amount" style="font-size:12px;">{line.waybillNumber}</td>
						<td class="muted">{line.shopOrder?.customerName ?? line.recipient ?? '—'}</td>
						<td class="num amount">{formatAmount(line.amountCents)}</td>
						<td><span class={kindBadge[line.kind]}>{kindLabels[line.kind]}</span></td>
						<td>
							{#if line.shopOrder}
								Поръчка #{line.shopOrder.orderNumber}
								{#if line.shopOrder.pdfFilename}
									· <a href="/cod/orders/{line.shopOrder.id}/pdf" target="_blank">документ {line.shopOrder.documentNumber ?? ''}</a>
								{:else}
									· <span style="color:var(--danger);">няма PDF</span>
								{/if}
								{#if line.shopOrder.totalCents !== line.amountCents}
									<div class="muted" style="font-size:11px;">Поръчката е {formatAmount(line.shopOrder.totalCents)}</div>
								{/if}
							{:else if line.note}
								{line.note}
							{:else if line.reference}
								<span class="muted">Реф. {line.reference} (няма такава поръчка)</span>
							{:else}
								<span class="muted">—</span>
							{/if}
						</td>
						<td style="text-align:right;">
							<button type="button" class="btn btn-ghost btn-sm" onclick={() => (editingLineId = editingLineId === line.id ? null : line.id)}>
								{editingLineId === line.id ? 'Затвори' : 'Промени'}
							</button>
						</td>
					</tr>
					{#if editingLineId === line.id}
						<tr>
							<td colspan="6">
								<div style="display:flex; gap:16px; flex-wrap:wrap; padding:8px 0;">
									<form method="POST" action="?/resolveLine" use:enhance={() => async ({ update }) => { editingLineId = null; await update(); }} style="display:flex; gap:8px; align-items:center;">
										<input type="hidden" name="lineId" value={line.id} />
										<input type="hidden" name="kind" value="shop_order" />
										<input class="input" name="orderNumber" placeholder="№ поръчка" style="width:120px;" />
										<button class="btn btn-secondary btn-sm" type="submit">Свържи с поръчка</button>
									</form>
									<form method="POST" action="?/resolveLine" use:enhance={() => async ({ update }) => { editingLineId = null; await update(); }} style="display:flex; gap:8px; align-items:center; flex:1; min-width:260px;">
										<input type="hidden" name="lineId" value={line.id} />
										<input type="hidden" name="kind" value="other" />
										<input class="input" name="note" placeholder="Напр. ръчна изработка – гривна" value={line.note ?? ''} style="flex:1;" />
										<button class="btn btn-secondary btn-sm" type="submit">Ръчна изработка / друг</button>
									</form>
									{#if line.kind !== 'unresolved'}
										<form method="POST" action="?/resolveLine" use:enhance={() => async ({ update }) => { editingLineId = null; await update(); }}>
											<input type="hidden" name="lineId" value={line.id} />
											<input type="hidden" name="kind" value="unresolved" />
											<button class="btn btn-ghost btn-sm" type="submit">Нулирай</button>
										</form>
									{/if}
								</div>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>
{/each}
