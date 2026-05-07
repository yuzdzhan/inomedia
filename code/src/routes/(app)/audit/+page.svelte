<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const eventTypeLabels: Record<string, string> = {
		invoice_issued: 'Издадена фактура',
		invoice_voided: 'Анулирана фактура',
		invoice_draft_updated: 'Обновена чернова',
		invoice_draft_recalculated: 'Преизчислена чернова',
		invoice_payment_recorded: 'Записано плащане',
		invoice_payment_method_updated: 'Сменен метод на плащане',
		expense_created: 'Създаден разход',
		expense_updated: 'Обновен разход',
		expense_marked_paid: 'Разход маркиран като платен',
		expense_reopened: 'Разход върнат като неплатен',
		expense_category_created: 'Нова категория разходи',
		expense_category_deactivated: 'Деактивирана категория',
		recurring_expense_template_created: 'Нов повт. шаблон',
		recurring_expense_template_updated: 'Обновен повт. шаблон',
		recurring_expense_template_deactivated: 'Деактивиран повт. шаблон',
		bank_statement_imported: 'Импортирано банково извлечение',
		statement_row_auto_matched: 'Авт. съвпадение на ред',
		statement_row_marked_irrelevant: 'Ред маркиран като неотносим',
		statement_row_converted_to_income: 'Ред превърнат в приход',
		statement_row_manually_matched: 'Ръчно съвпадение на ред',
		statement_row_unresolved: 'Развъзан ред',
		user_created: 'Създаден потребител',
		user_deactivated: 'Деактивиран потребител',
		user_reactivated: 'Реактивиран потребител',
		user_role_changed: 'Сменена роля',
		user_rate_updated: 'Обновена ставка',
		login_success: 'Успешен вход',
		login_failed: 'Неуспешен вход',
		session_expired: 'Изтекла сесия',
		task_time_log_deleted: 'Изтрит времеви запис',
		invoice_task_selection_removed: 'Премахната задача от фактура',
		ledger_entry_created: 'Записан счетоводен ред',
		standalone_income_recorded: 'Записан самостоятелен приход',
		generic_movement_recorded: 'Записано движение',
		transfer_recorded: 'Записан трансфер'
	};

	function formatDateTime(value: Date | string) {
		return new Intl.DateTimeFormat('bg-BG', {
			day: '2-digit', month: 'short', year: 'numeric',
			hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Sofia'
		}).format(new Date(value));
	}

	function labelForEventType(et: string) {
		return eventTypeLabels[et] ?? et;
	}

	function actorName(actor: { firstName: string; lastName: string; email: string } | null) {
		if (!actor) return 'Системно';
		const name = `${actor.firstName} ${actor.lastName}`.trim();
		return name || actor.email;
	}

	function buildTabUrl(tab: string) {
		const params = new URLSearchParams();
		params.set('tab', tab);
		if (data.filters.dateFrom) params.set('dateFrom', data.filters.dateFrom);
		if (data.filters.dateTo) params.set('dateTo', data.filters.dateTo);
		if (data.filters.actorUserId) params.set('actorUserId', data.filters.actorUserId);
		if (data.filters.entityType) params.set('entityType', data.filters.entityType);
		if (data.filters.search) params.set('search', data.filters.search);
		return `/audit?${params.toString()}`;
	}

	function formatJson(value: unknown) {
		try { return JSON.stringify(value, null, 2); } catch { return String(value); }
	}
</script>

<svelte:head>
	<title>Одитен журнал – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Одитен журнал</h1>
		<p class="page-sub">Проследяване на всички чувствителни операции. Само за четене.</p>
	</div>
</div>

<div class="tabs" style="margin-bottom:16px;">
	{#if data.canViewSecurity}
		<a href={buildTabUrl('all')} class="tab" class:active={data.filters.tab === 'all'}>Всички</a>
	{/if}
	<a href={buildTabUrl('finance')} class="tab" class:active={data.filters.tab === 'finance'}>Финансови</a>
	{#if data.canViewSecurity}
		<a href={buildTabUrl('security')} class="tab" class:active={data.filters.tab === 'security'}>Сигурност</a>
	{/if}
</div>

<!-- Filter bar -->
<form method="GET" action="/audit" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:16px;">
	<input type="hidden" name="tab" value={data.filters.tab} />
	<input class="input" type="date" name="dateFrom" value={data.filters.dateFrom} style="width:140px;" title="От дата" />
	<input class="input" type="date" name="dateTo" value={data.filters.dateTo} style="width:140px;" title="До дата" />
	<select class="select" name="actorUserId" style="width:auto;">
		<option value="">Всички потребители</option>
		{#each data.actors as actor}
			<option value={actor.id} selected={data.filters.actorUserId === actor.id}>{actorName(actor)}</option>
		{/each}
	</select>
	<select class="select" name="entityType" style="width:auto;">
		<option value="">Всички обекти</option>
		{#each data.entityTypes as et}
			<option value={et} selected={data.filters.entityType === et}>{et}</option>
		{/each}
	</select>
	<input class="input" name="search" type="text" placeholder="Търси в действие…"
		value={data.filters.search} style="width:180px;" />
	<button type="submit" class="btn btn-secondary btn-sm">Приложи</button>
	<a href="/audit?tab={data.filters.tab}" class="btn btn-ghost btn-sm">Изчисти</a>
</form>

<div class="muted" style="font-size:12px; margin-bottom:8px;">
	{#if data.totalCount === 0}
		Няма намерени записи.
	{:else if data.totalCount > data.events.length}
		Показани {data.events.length} от {data.totalCount} записа
	{:else}
		{data.totalCount} {data.totalCount === 1 ? 'запис' : 'записа'}
	{/if}
</div>

<div class="card">
	<table class="tbl">
		<thead>
			<tr>
				<th>Дата и час</th>
				<th>Действие</th>
				<th>Извършено от</th>
				<th>Обект</th>
				<th>IP</th>
				<th>Детайли</th>
			</tr>
		</thead>
		<tbody>
			{#each data.events as event}
				<tr>
					<td class="amount muted" style="white-space:nowrap; font-size:12px;">{formatDateTime(event.createdAt)}</td>
					<td>
						<div style="font-size:13px; font-weight:500;">{labelForEventType(event.eventType)}</div>
						{#if labelForEventType(event.eventType) !== event.eventType}
							<div class="amount muted" style="font-size:10px;">{event.eventType}</div>
						{/if}
					</td>
					<td style="font-size:13px; white-space:nowrap;">{actorName(event.actor)}</td>
					<td>
						{#if event.entityType || event.entityId}
							<div class="amount" style="font-size:11px; font-weight:500;">{event.entityType ?? '—'}</div>
							{#if event.entityId}
								<div class="amount muted" style="font-size:10px;" title={event.entityId}>{event.entityId.slice(0, 8)}…</div>
							{/if}
						{:else}
							<span class="muted">—</span>
						{/if}
					</td>
					<td class="amount muted" style="font-size:11px; white-space:nowrap;">{event.ipAddress ?? '—'}</td>
					<td style="max-width:280px;">
						{#if event.newValueJson !== null && event.newValueJson !== undefined}
							<details>
								<summary style="font-size:12px; cursor:pointer; color:var(--accent); font-weight:500; list-style:none;">Детайли</summary>
								<pre style="margin:6px 0 2px; padding:8px 10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-sm); font-size:10px; overflow-x:auto; max-width:260px; white-space:pre;">{formatJson(event.newValueJson)}</pre>
							</details>
						{:else if event.oldValueJson !== null && event.oldValueJson !== undefined}
							<details>
								<summary style="font-size:12px; cursor:pointer; color:var(--accent); font-weight:500; list-style:none;">Детайли</summary>
								<pre style="margin:6px 0 2px; padding:8px 10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-sm); font-size:10px; overflow-x:auto; max-width:260px; white-space:pre;">{formatJson(event.oldValueJson)}</pre>
							</details>
						{:else if event.reason}
							<span class="muted" style="font-size:12px; font-style:italic;">{event.reason}</span>
						{:else}
							<span class="muted">—</span>
						{/if}
					</td>
				</tr>
			{/each}
			{#if data.events.length === 0}
				<tr>
					<td colspan="6" style="text-align:center; padding:32px 16px; color:var(--text-muted);">
						Няма записи, отговарящи на зададените филтри.
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
