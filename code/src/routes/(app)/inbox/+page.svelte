<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { fmtDate as formatDate, fmtDateTime as formatDateTime } from '$lib/utils/format';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let syncing = $state(false);
	let openId = $state<string | null>(null);

	const kindLabels: Record<string, string> = {
		invoice: 'Фактура',
		credit_note: 'Кредитно известие',
		payroll_dues: 'Вноски към НАП',
		payroll_sheet: 'Ведомост',
		unknown: 'Неразпознат'
	};
	const statusLabels: Record<string, string> = {
		pending: 'Чака',
		matched: 'Свързан с банка',
		cash_expense: 'Разход от касата',
		duplicate: 'Дубликат',
		ignored: 'Пропуснат'
	};
	const statusBadge: Record<string, string> = {
		pending: 'badge inv-overdue',
		matched: 'badge inv-paid',
		cash_expense: 'badge inv-paid',
		duplicate: 'badge',
		ignored: 'badge'
	};
	const filters = [
		['pending', 'Чакат'],
		['matched', 'Свързани'],
		['cash_expense', 'От касата'],
		['ignored', 'Пропуснати'],
		['all', 'Всички']
	];

	function amount(cents: number | null, currency: string | null) {
		if (cents == null) return '—';
		return `${(cents / 100).toFixed(2)} ${currency === 'USD' ? 'USD' : 'EUR'}`;
	}
</script>

<svelte:head>
	<title>Входящи документи</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Входящи документи</h1>
		<p class="page-sub">
			Фактури и ведомости от пощата за фактури – проверява се на всеки 30 минути
			{#if data.lastSync}· последно ново писмо {formatDateTime(data.lastSync)}{/if}
		</p>
	</div>
	<div class="page-header-actions">
		<form method="POST" action="?/sync" use:enhance={() => { syncing = true; return async ({ update }) => { syncing = false; await update(); }; }}>
			<button class="btn btn-primary btn-sm" type="submit" disabled={syncing || !data.configured}>{syncing ? 'Проверявам...' : 'Провери пощата'}</button>
		</form>
	</div>
</div>

{#if !data.configured}
	<div class="alert warning" style="margin-bottom:16px;">Пощата не е настроена – добавете IMAP_HOST, IMAP_USER и IMAP_PASSWORD в средата.</div>
{/if}
{#if form?.error}<div class="alert danger" style="margin-bottom:16px;">{form.error}</div>{/if}
{#if form?.success}<div class="alert success" style="margin-bottom:16px;">{form.success}</div>{/if}
{#if form && 'warnings' in form && form.warnings?.length}
	<div class="alert warning" style="margin-bottom:16px;">{#each form.warnings as w}<div>{w}</div>{/each}</div>
{/if}

<div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
	{#each filters as [key, label]}
		<a href="?status={key}" class="btn btn-sm {data.filter === key ? 'btn-secondary' : 'btn-ghost'}">
			{label}{#if key !== 'all' && data.counts[key]} ({data.counts[key]}){/if}
		</a>
	{/each}
</div>

<div class="card">
	{#if data.documents.length === 0}
		<div class="card-body"><p class="muted">Няма документи в този изглед.</p></div>
	{:else}
		<table class="tbl">
			<thead>
				<tr><th>Документ</th><th>Доставчик / период</th><th>Дата</th><th class="num">Сума</th><th>Статус</th><th></th></tr>
			</thead>
			<tbody>
				{#each data.documents as d (d.id)}
					<tr>
						<td>
							<a href="/inbox/{d.id}/file" target="_blank">{kindLabels[d.kind] ?? d.kind}{d.documentNumber ? ` ${d.documentNumber}` : ''}</a>
							<div class="muted" style="font-size:11px;">{d.filename} · {d.message.subject ?? ''}</div>
						</td>
						<td>{d.supplier ?? (d.period ? `за ${d.period.split('-').reverse().join('.')}` : '—')}</td>
						<td class="muted">{d.documentDate ? formatDate(d.documentDate) : '—'}</td>
						<td class="num amount">{amount(d.totalCents, d.currency)}</td>
						<td>
							<span class={statusBadge[d.status]}>{statusLabels[d.status]}</span>
							{#if d.note}<div class="muted" style="font-size:11px;">{d.note}</div>{/if}
							{#if d.expense}<div class="muted" style="font-size:11px;">→ {d.expense.description}</div>{/if}
						</td>
						<td style="text-align:right; white-space:nowrap;">
							{#if d.status === 'pending'}
								<button class="btn btn-ghost btn-sm" type="button" onclick={() => (openId = openId === d.id ? null : d.id)}>Действия</button>
							{:else if d.status === 'ignored'}
								<form method="POST" action="?/setStatus" use:enhance style="display:inline;">
									<input type="hidden" name="documentId" value={d.id} /><input type="hidden" name="status" value="pending" />
									<button class="btn btn-ghost btn-sm" type="submit">Върни</button>
								</form>
							{/if}
						</td>
					</tr>
					{#if openId === d.id}
						<tr>
							<td colspan="6">
								<div style="display:flex; gap:16px; flex-wrap:wrap; padding:8px 0; align-items:center;">
									<form method="POST" action="?/retry" use:enhance>
										<input type="hidden" name="documentId" value={d.id} />
										<button class="btn btn-secondary btn-sm" type="submit">Търси пак в банката</button>
									</form>
									<form method="POST" action="?/cashExpense" use:enhance style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
										<input type="hidden" name="documentId" value={d.id} />
										<select class="select" name="categoryId" required style="width:auto;">
											{#each data.categories as c}<option value={c.id}>{c.name}</option>{/each}
										</select>
										<input class="input" name="amount" inputmode="decimal" placeholder="Сума EUR" value={d.totalCents != null && d.currency !== 'USD' ? (d.totalCents / 100).toFixed(2) : ''} style="width:110px;" required />
										<input class="input" type="date" name="date" value={d.documentDate ? new Date(d.documentDate).toISOString().slice(0, 10) : ''} style="width:auto;" required />
										<button class="btn btn-secondary btn-sm" type="submit">Платена в брой от касата</button>
									</form>
									<form method="POST" action="?/setStatus" use:enhance style="display:flex; gap:6px;">
										<input type="hidden" name="documentId" value={d.id} /><input type="hidden" name="status" value="ignored" />
										<input class="input" name="note" placeholder="Причина (по избор)" style="width:180px;" />
										<button class="btn btn-ghost btn-sm" type="submit">Пропусни</button>
									</form>
								</div>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	{/if}
</div>
