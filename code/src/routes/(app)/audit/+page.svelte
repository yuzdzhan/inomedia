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
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'Europe/Sofia'
		}).format(new Date(value));
	}

	function labelForEventType(eventType: string): string {
		return eventTypeLabels[eventType] ?? eventType;
	}

	function actorName(actor: { firstName: string; lastName: string; email: string } | null): string {
		if (!actor) return 'Системно';
		const name = `${actor.firstName} ${actor.lastName}`.trim();
		return name || actor.email;
	}

	function buildTabUrl(tab: string): string {
		const params = new URLSearchParams();
		params.set('tab', tab);
		if (data.filters.dateFrom) params.set('dateFrom', data.filters.dateFrom);
		if (data.filters.dateTo) params.set('dateTo', data.filters.dateTo);
		if (data.filters.actorUserId) params.set('actorUserId', data.filters.actorUserId);
		if (data.filters.entityType) params.set('entityType', data.filters.entityType);
		if (data.filters.search) params.set('search', data.filters.search);
		return `/audit?${params.toString()}`;
	}

	function formatJson(value: unknown): string {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}
</script>

<svelte:head>
	<title>Одитен журнал - Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1>Журнал на промените</h1>
		<p>Проследяване на всички чувствителни операции в системата. Само за четене.</p>
	</div>
</div>

<div class="tabs">
	{#if data.canViewSecurity}
		<a href={buildTabUrl('all')} class="tab" class:active={data.filters.tab === 'all'}>Всички</a>
	{/if}
	<a href={buildTabUrl('finance')} class="tab" class:active={data.filters.tab === 'finance'}>Финансови</a>
	{#if data.canViewSecurity}
		<a href={buildTabUrl('security')} class="tab" class:active={data.filters.tab === 'security'}>Сигурност</a>
	{/if}
</div>

<form method="GET" action="/audit" class="filter-bar card">
	<input type="hidden" name="tab" value={data.filters.tab} />
	<div class="filter-grid">
		<div class="field">
			<label for="dateFrom">От дата</label>
			<input id="dateFrom" name="dateFrom" type="date" value={data.filters.dateFrom} />
		</div>
		<div class="field">
			<label for="dateTo">До дата</label>
			<input id="dateTo" name="dateTo" type="date" value={data.filters.dateTo} />
		</div>
		<div class="field">
			<label for="actorUserId">Извършено от</label>
			<select id="actorUserId" name="actorUserId">
				<option value="">Всички потребители</option>
				{#each data.actors as actor}
					<option value={actor.id} selected={data.filters.actorUserId === actor.id}>
						{actorName(actor)}
					</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="entityType">Тип обект</label>
			<select id="entityType" name="entityType">
				<option value="">Всички обекти</option>
				{#each data.entityTypes as et}
					<option value={et} selected={data.filters.entityType === et}>{et}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="search">Търсене в действие</label>
			<input id="search" name="search" type="text" placeholder="напр. invoice_issued" value={data.filters.search} />
		</div>
		<div class="field filter-actions">
			<button type="submit" class="btn-primary">Приложи</button>
			<a href="/audit?tab={data.filters.tab}" class="btn-secondary">Изчисти</a>
		</div>
	</div>
</form>

<div class="result-count">
	{#if data.totalCount === 0}
		Няма намерени записи.
	{:else if data.totalCount > data.events.length}
		Показани {data.events.length} от {data.totalCount} записа (последните {data.events.length})
	{:else}
		{data.totalCount} {data.totalCount === 1 ? 'запис' : 'записа'}
	{/if}
</div>

<section class="card table-wrap">
	<table>
		<thead>
			<tr>
				<th>Дата и час</th>
				<th>Действие</th>
				<th>Извършено от</th>
				<th>Обект</th>
				<th>Детайли</th>
			</tr>
		</thead>
		<tbody>
			{#each data.events as event}
				<tr>
					<td class="cell-date">{formatDateTime(event.createdAt)}</td>
					<td class="cell-action">
						<span class="event-label">{labelForEventType(event.eventType)}</span>
						{#if labelForEventType(event.eventType) !== event.eventType}
							<span class="event-raw">{event.eventType}</span>
						{/if}
					</td>
					<td class="cell-actor">
						{actorName(event.actor)}
					</td>
					<td class="cell-entity">
						{#if event.entityType || event.entityId}
							<span class="entity-type">{event.entityType ?? '—'}</span>
							{#if event.entityId}
								<span class="entity-id" title={event.entityId}>{event.entityId.slice(0, 8)}…</span>
							{/if}
						{:else}
							<span class="empty-cell">—</span>
						{/if}
					</td>
					<td class="cell-details">
						{#if event.newValueJson !== null && event.newValueJson !== undefined}
							<details>
								<summary>Детайли</summary>
								<pre class="json-block">{formatJson(event.newValueJson)}</pre>
							</details>
						{:else if event.oldValueJson !== null && event.oldValueJson !== undefined}
							<details>
								<summary>Детайли</summary>
								<pre class="json-block">{formatJson(event.oldValueJson)}</pre>
							</details>
						{:else if event.reason}
							<span class="reason-text">{event.reason}</span>
						{:else}
							<span class="empty-cell">—</span>
						{/if}
					</td>
				</tr>
			{/each}
			{#if data.events.length === 0}
				<tr>
					<td colspan="5" class="empty-row">Няма записи, отговарящи на зададените филтри.</td>
				</tr>
			{/if}
		</tbody>
	</table>
</section>

<style>
	.page-header {
		margin-bottom: 20px;
	}

	.page-header p {
		margin: 6px 0 0;
		color: #64748b;
	}

	h1 {
		margin: 0;
		color: #0f172a;
	}

	.tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 16px;
		border-bottom: 2px solid #e2e8f0;
		padding-bottom: 0;
	}

	.tab {
		padding: 8px 18px;
		font-size: 0.9375rem;
		font-weight: 600;
		color: #64748b;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		text-decoration: none;
		transition: color 0.15s, border-color 0.15s;
	}

	.tab:hover {
		color: #1e293b;
	}

	.tab.active {
		color: #2563eb;
		border-bottom-color: #2563eb;
	}

	.card {
		background: #fff;
		border-radius: 12px;
		box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
		padding: 20px 24px;
		margin-bottom: 20px;
	}

	.filter-bar {
		padding: 16px 20px;
	}

	.filter-grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1.5fr 1.5fr 1.5fr auto;
		gap: 12px;
		align-items: end;
	}

	.field {
		display: grid;
		gap: 5px;
	}

	label {
		font-size: 0.8rem;
		font-weight: 600;
		color: #475569;
	}

	input,
	select,
	button,
	a.btn-secondary {
		font: inherit;
	}

	input,
	select {
		width: 100%;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		padding: 8px 10px;
		background: #fff;
		color: #0f172a;
		font-size: 0.9rem;
	}

	input:focus,
	select:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}

	.filter-actions {
		display: flex;
		gap: 8px;
		align-items: end;
	}

	.btn-primary {
		padding: 8px 16px;
		background: #2563eb;
		color: #fff;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
		white-space: nowrap;
		text-decoration: none;
		display: inline-block;
	}

	.btn-primary:hover {
		background: #1d4ed8;
	}

	.btn-secondary {
		padding: 8px 14px;
		background: #f1f5f9;
		color: #475569;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
		white-space: nowrap;
		text-decoration: none;
		display: inline-block;
		font-size: 0.9rem;
	}

	.btn-secondary:hover {
		background: #e2e8f0;
	}

	.result-count {
		font-size: 0.875rem;
		color: #64748b;
		margin-bottom: 12px;
	}

	.table-wrap {
		padding: 0;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		padding: 12px 16px;
		text-align: left;
		vertical-align: top;
		border-bottom: 1px solid #e2e8f0;
	}

	th {
		font-size: 0.76rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #64748b;
		background: #f8fafc;
		white-space: nowrap;
	}

	tr:last-child td {
		border-bottom: none;
	}

	tr:hover td {
		background: #f8fafc;
	}

	.cell-date {
		white-space: nowrap;
		font-size: 0.875rem;
		color: #475569;
		min-width: 130px;
	}

	.cell-action {
		min-width: 180px;
	}

	.event-label {
		display: block;
		font-weight: 600;
		color: #0f172a;
		font-size: 0.9rem;
	}

	.event-raw {
		display: block;
		font-size: 0.75rem;
		color: #94a3b8;
		font-family: monospace;
		margin-top: 2px;
	}

	.cell-actor {
		white-space: nowrap;
		font-size: 0.9rem;
		color: #334155;
		min-width: 120px;
	}

	.cell-entity {
		min-width: 120px;
	}

	.entity-type {
		display: block;
		font-size: 0.82rem;
		font-weight: 600;
		color: #475569;
		font-family: monospace;
	}

	.entity-id {
		display: block;
		font-size: 0.75rem;
		color: #94a3b8;
		font-family: monospace;
		margin-top: 2px;
	}

	.empty-cell {
		color: #cbd5e1;
	}

	.cell-details {
		min-width: 160px;
		max-width: 340px;
	}

	details {
		cursor: pointer;
	}

	summary {
		font-size: 0.85rem;
		font-weight: 600;
		color: #2563eb;
		user-select: none;
		list-style: none;
	}

	summary::before {
		content: '▶ ';
		font-size: 0.7rem;
	}

	details[open] summary::before {
		content: '▼ ';
	}

	.json-block {
		margin: 8px 0 4px;
		padding: 10px 12px;
		background: #f1f5f9;
		border: 1px solid #e2e8f0;
		border-radius: 6px;
		font-size: 0.76rem;
		line-height: 1.5;
		overflow-x: auto;
		max-width: 320px;
		white-space: pre;
		color: #334155;
	}

	.reason-text {
		font-size: 0.875rem;
		color: #475569;
		font-style: italic;
	}

	.empty-row {
		text-align: center;
		color: #94a3b8;
		padding: 32px 16px;
	}

	@media (max-width: 1200px) {
		.filter-grid {
			grid-template-columns: 1fr 1fr 1fr;
		}
	}

	@media (max-width: 768px) {
		.filter-grid {
			grid-template-columns: 1fr 1fr;
		}

		.filter-actions {
			grid-column: 1 / -1;
		}
	}
</style>
