<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/Icon.svelte';

	let { data }: { data: PageData } = $props();

	const today = new Date();
	const dayNames = ['неделя', 'понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота'];
	const monthNames = ['яну', 'фев', 'март', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'];

	function fmtMoney(cents: number): string {
		return (cents / 100).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	function fmtDate(date: Date | string | null | undefined): string {
		if (!date) return '—';
		const d = new Date(date);
		return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
	}

	function fmtDateShort(date: Date | string | null | undefined): string {
		if (!date) return '—';
		const d = new Date(date);
		return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
	}

	function fmtDuration(minutes: number | null | undefined): string {
		if (!minutes) return '0м';
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		if (h === 0) return `${m}м`;
		if (m === 0) return `${h}ч`;
		return `${h}ч ${m}м`;
	}

	function isOverdue(date: Date | string | null | undefined): boolean {
		if (!date) return false;
		return new Date(date) < today;
	}

	const priorityLabels: Record<string, string> = {
		low: 'Нисък', medium: 'Среден', high: 'Висок'
	};

	const statusLabels: Record<string, string> = {
		todo: 'Чакащо', in_progress: 'В процес', issued: 'Издадена',
		partially_paid: 'Частично', overdue: 'Просрочена', draft: 'Чернова'
	};

	function auditEventLabel(eventType: string): string {
		const labels: Record<string, string> = {
			invoice_draft_created: 'създаде чернова на фактура',
			invoice_issued: 'издаде фактура',
			invoice_payment_recorded: 'записа плащане по фактура',
			project_created: 'създаде проект',
			task_time_log_created: 'логна работно време по',
			task_time_log_deleted: 'изтри запис за работно време',
			bank_import: 'импортира банково извлечение',
			expense_created: 'добави разход',
			user_created: 'добави потребител',
			login_success: 'влезе в системата'
		};
		return labels[eventType] ?? eventType.replace(/_/g, ' ');
	}
</script>

<svelte:head>
	<title>Начало – Иномедия</title>
</svelte:head>

{#if data.role === 'admin'}
	<!-- ── Admin dashboard ─────────────────────────────────────────────────── -->
	<div class="page-header">
		<div>
			<h1 class="page-title">Добре дошъл, {data.firstName}</h1>
			<p class="page-sub">Преглед на дейността · {dayNames[today.getDay()]}, {String(today.getDate()).padStart(2,'0')} {monthNames[today.getMonth()]} {today.getFullYear()}</p>
		</div>
	</div>

	<!-- Stats strip -->
	<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px;">
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Незафактурирано</div>
			<div class="stat-value amount">{fmtMoney(data.uninvoicedTotalCents)}</div>
			<div class="stat-delta">{data.uninvoicedByClient.length} клиента</div>
		</div>
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Постъпления / месец</div>
			<div class="stat-value amount">{fmtMoney(data.monthlyIncomeCents)}</div>
			<div class="stat-delta">текущ месец</div>
		</div>
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Просрочени фактури</div>
			<div class="stat-value amount" style={data.overdueAmountCents > 0 ? 'color:var(--danger)' : ''}>{fmtMoney(data.overdueAmountCents)}</div>
			<div class="stat-delta">{data.overdueInvoiceCount} фактури</div>
		</div>
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Касов баланс</div>
			<div class="stat-value amount">{fmtMoney(data.cashBalanceCents)}</div>
			<div class="stat-delta">{data.balances.map(b => `${b.containerType === 'bank' ? 'Банка' : 'Каса'} ${fmtMoney(b.balance)}`).join(' · ') || 'Без контейнери'}</div>
		</div>
	</div>

	<!-- 2-col grid row 1 -->
	<div style="display:grid; grid-template-columns:1.4fr 1fr; gap:16px; margin-bottom:16px;">
		<!-- Active projects -->
		<div class="card">
			<div class="card-header">
				<div>
					<h3 class="card-title">Активни проекти</h3>
					<div class="card-sub">{data.activeProjects.length} проекта</div>
				</div>
				<a href="/projects" class="btn btn-ghost btn-sm">Виж всички <Icon name="chevron-right" size={12}/></a>
			</div>
			<table class="tbl">
				<thead>
					<tr>
						<th style="width:40%">Проект</th>
						<th>Клиент</th>
						<th style="width:30%">Бюджет</th>
						<th>Статус</th>
					</tr>
				</thead>
				<tbody>
					{#each data.activeProjects as p}
						<tr>
							<td>
								<a href="/projects/{p.id}" style="font-weight:500; color:var(--text); text-decoration:none;" class:hover:underline={true}>{p.name}</a>
							</td>
							<td class="muted">{p.clientName}</td>
							<td>
								{#if p.budgetHours !== null && p.pct !== null}
									<div class="row gap-2" style="align-items:center;">
										<div class="burn-bar" style="flex:1; max-width:100px;">
											<div class="burn-bar-fill {p.pct >= 90 ? 'danger' : p.pct >= 70 ? 'warn' : ''}" style="width:{p.pct}%;"></div>
										</div>
										<span class="amount" style="font-size:11px; color:var(--text-muted); min-width:70px; text-align:right;">{p.loggedHours}ч / {p.budgetHours}ч</span>
									</div>
								{:else}
									<span class="muted" style="font-size:12px;">{p.loggedHours}ч logged</span>
								{/if}
							</td>
							<td>
								{#if p.pct !== null && p.pct >= 90}
									<span class="badge inv-overdue">Над лимита</span>
								{:else if p.pct !== null && p.pct >= 70}
									<span class="badge inv-partial">Близо</span>
								{:else}
									<span class="badge task-progress">В процес</span>
								{/if}
							</td>
						</tr>
					{:else}
						<tr><td colspan="4" class="muted" style="text-align:center; padding:20px;">Няма активни проекти.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Invoiceable work by client -->
		<div class="card">
			<div class="card-header">
				<div>
					<h3 class="card-title">Фактурируема работа</h3>
					<div class="card-sub">Незафактурирано по клиент</div>
				</div>
				<a href="/invoiceable-work" class="btn btn-accent btn-sm">Издай фактури</a>
			</div>
			<div style="padding:0 16px;">
				{#if data.uninvoicedByClient.length > 0}
					{#each data.uninvoicedByClient.slice(0, 5) as client}
						{@const pct = data.uninvoicedTotalCents > 0 ? Math.round((client.totalAmountCents / data.uninvoicedTotalCents) * 100) : 0}
						<div style="padding:12px 0; border-bottom:1px solid var(--border-soft);">
							<div class="row-between" style="margin-bottom:6px;">
								<span style="font-weight:500;">{client.legalName}</span>
								<span class="amount" style="font-weight:500;">{fmtMoney(client.totalAmountCents)} EUR</span>
							</div>
							<div class="row-between">
								<span class="muted" style="font-size:12px;">фактурируемо</span>
								<div class="burn-bar" style="width:100px;">
									<div class="burn-bar-fill" style="width:{pct}%; background:var(--accent);"></div>
								</div>
							</div>
						</div>
					{/each}
					<div style="padding:12px 0; display:flex; justify-content:space-between;">
						<span style="font-weight:500;">Общо незафактурирано</span>
						<span class="amount" style="font-weight:600; font-size:14px;">{fmtMoney(data.uninvoicedTotalCents)} EUR</span>
					</div>
				{:else}
					<div style="padding:20px 0; text-align:center;" class="muted">Няма незафактурирана работа.</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- 2-col grid row 2 -->
	<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
		<!-- Unpaid invoices -->
		<div class="card">
			<div class="card-header">
				<div>
					<h3 class="card-title">Неплатени фактури</h3>
					<div class="card-sub">
						{data.overdueInvoiceCount} просрочени ·
						{data.unpaidInvoices.filter(i => i.status !== 'overdue').length} издадени
					</div>
				</div>
			</div>
			<table class="tbl">
				<thead>
					<tr>
						<th>Номер</th>
						<th>Клиент</th>
						<th>Падеж</th>
						<th class="num">Сума</th>
						<th>Статус</th>
					</tr>
				</thead>
				<tbody>
					{#each data.unpaidInvoices.slice(0, 5) as inv}
						<tr class={inv.status === 'overdue' ? 'highlight-amber' : ''}>
							<td class="amount">
								<a href="/invoices/{inv.id}" style="color:inherit;">{inv.invoiceNumber ?? '—'}</a>
							</td>
							<td>{inv.client.legalName}</td>
							<td class="amount muted">{fmtDate(inv.dueDate)}</td>
							<td class="num">{fmtMoney(inv.grossTotalCents - inv.paidTotalCents)}</td>
							<td>
								{#if inv.status === 'overdue'}
									<span class="badge inv-overdue">Просрочена</span>
								{:else if inv.status === 'partially_paid'}
									<span class="badge inv-partial">Частично</span>
								{:else}
									<span class="badge inv-issued">Издадена</span>
								{/if}
							</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="muted" style="text-align:center; padding:20px;">Няма неплатени фактури.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Bank statement widget -->
		<div class="card">
			<div class="card-header">
				<div>
					<h3 class="card-title">Банково извлечение</h3>
					<div class="card-sub">Последни транзакции</div>
				</div>
				<a href="/bank-statements" class="btn btn-secondary btn-sm">
					<Icon name="upload" size={12}/>Импорт
				</a>
			</div>
			<div style="padding:16px;">
				<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:16px;">
					<div style="padding:12px; background:var(--success-subtle); border-radius:var(--r-md); border:1px solid #a7f3d0;">
						<div class="amount" style="font-size:22px; font-weight:500; color:var(--success);">{data.bankMatchCounts.auto}</div>
						<div style="font-size:11px; color:var(--success); text-transform:uppercase; font-family:var(--font-mono); letter-spacing:0.06em;">Автоматично</div>
					</div>
					<div style="padding:12px; background:var(--warning-subtle); border-radius:var(--r-md); border:1px solid #fde68a;">
						<div class="amount" style="font-size:22px; font-weight:500; color:var(--warning);">{data.bankMatchCounts.review}</div>
						<div style="font-size:11px; color:var(--warning); text-transform:uppercase; font-family:var(--font-mono); letter-spacing:0.06em;">Преглед</div>
					</div>
					<div style="padding:12px; background:var(--surface); border-radius:var(--r-md); border:1px solid var(--border);">
						<div class="amount" style="font-size:22px; font-weight:500;">{data.bankMatchCounts.unmatched}</div>
						<div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-family:var(--font-mono); letter-spacing:0.06em;">Несъвпадащо</div>
					</div>
				</div>
				<div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-family:var(--font-mono); letter-spacing:0.06em; margin-bottom:8px;">Последни транзакции</div>
				{#each data.recentBankRows as row, i}
					<div class="row-between" style="padding:6px 0; font-size:12px; border-top:{i ? '1px solid var(--border-soft)' : 'none'};">
						<span class="amount muted" style="width:44px;">{fmtDateShort(row.transactionDate)}</span>
						<span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin:0 8px;">{row.description}</span>
						<span class="amount" style="font-weight:500; color:{row.amountCents > 0 ? 'var(--success)' : 'var(--text)'};">
							{row.amountCents > 0 ? '+' : ''}{fmtMoney(row.amountCents)}
						</span>
						{#if row.matchState === 'auto_matched'}
							<Icon name="check" size={12} />
						{:else}
							<Icon name="alert" size={12} />
						{/if}
					</div>
				{:else}
					<div class="muted" style="font-size:12px; text-align:center; padding:8px 0;">Няма транзакции.</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Activity feed -->
	<div class="card">
		<div class="card-header">
			<div>
				<h3 class="card-title">Скорошна активност</h3>
				<div class="card-sub">Логове и системни събития</div>
			</div>
			<a href="/audit" class="btn btn-ghost btn-sm">Audit log <Icon name="chevron-right" size={12}/></a>
		</div>
		<div style="padding:4px 16px;">
			{#each data.recentAuditEvents as ev, i}
				{@const actorName = ev.actor ? `${ev.actor.firstName} ${ev.actor.lastName}` : 'Система'}
				{@const evTime = new Date(ev.createdAt)}
				<div class="row" style="padding:10px 0; border-top:{i ? '1px solid var(--border-soft)' : 'none'}; align-items:flex-start;">
					<span class="amount muted" style="font-size:11px; width:40px; margin-top:2px;">{String(evTime.getHours()).padStart(2,'0')}:{String(evTime.getMinutes()).padStart(2,'0')}</span>
					<div style="flex:1;">
						<span style="font-weight:500;">{actorName}</span>
						<span class="muted"> {auditEventLabel(ev.eventType)} </span>
						{#if ev.entityType}<span>{ev.entityType}</span>{/if}
					</div>
				</div>
			{:else}
				<div class="muted" style="padding:16px 0; text-align:center;">Няма активност.</div>
			{/each}
		</div>
	</div>

{:else if data.role === 'manager'}
	<!-- ── Manager dashboard ────────────────────────────────────────────────── -->
	<div class="page-header">
		<div>
			<h1 class="page-title">Добре дошъл</h1>
			<p class="page-sub">Преглед на управляваните проекти</p>
		</div>
	</div>
	<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:24px;">
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Активни проекти</div>
			<div class="stat-value">{data.managedProjects.length}</div>
		</div>
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Просрочени задачи</div>
			<div class="stat-value" style={data.overdueTasks > 0 ? 'color:var(--danger)' : ''}>{data.overdueTasks}</div>
		</div>
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Незафактурирани задачи</div>
			<div class="stat-value" style={data.uninvoicedTaskCount > 0 ? 'color:var(--warning)' : ''}>{data.uninvoicedTaskCount}</div>
		</div>
	</div>
	<div class="card">
		<div class="card-header">
			<h3 class="card-title">Активни проекти</h3>
		</div>
		<table class="tbl">
			<thead>
				<tr><th>Проект</th><th>Клиент</th><th>Списъци</th></tr>
			</thead>
			<tbody>
				{#each data.managedProjects as p}
					<tr>
						<td><a href="/projects/{p.id}">{p.name}</a></td>
						<td class="muted">{p.client.legalName}</td>
						<td class="amount">{p._count.taskLists}</td>
					</tr>
				{:else}
					<tr><td colspan="3" class="muted" style="text-align:center; padding:20px;">Няма активни проекти.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

{:else if data.role === 'accountant'}
	<!-- ── Accountant dashboard ─────────────────────────────────────────────── -->
	<div class="page-header">
		<div>
			<h1 class="page-title">Добре дошъл</h1>
			<p class="page-sub">Финансов преглед</p>
		</div>
	</div>
	<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:24px;">
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Неплатени фактури</div>
			<div class="stat-value" style={data.unpaidInvoices.length > 0 ? 'color:var(--warning)' : 'color:var(--success)'}>{data.unpaidInvoices.length}</div>
		</div>
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Предстоящи разходи (30 дни)</div>
			<div class="stat-value">{data.upcomingExpenses.length}</div>
		</div>
		<div class="stat" style="padding:14px;">
			<div class="stat-label">За преглед в извлечения</div>
			<div class="stat-value" style={data.statementReviewCount > 0 ? 'color:var(--danger)' : 'color:var(--success)'}>{data.statementReviewCount}</div>
		</div>
	</div>
	<div class="card">
		<div class="card-header">
			<h3 class="card-title">Неплатени фактури</h3>
		</div>
		<table class="tbl">
			<thead>
				<tr><th>Номер</th><th>Клиент</th><th>Статус</th><th>Падеж</th><th class="num">Сума</th></tr>
			</thead>
			<tbody>
				{#each data.unpaidInvoices as inv}
					<tr class={inv.status === 'overdue' ? 'highlight-amber' : ''}>
						<td class="amount"><a href="/invoices/{inv.id}">{inv.invoiceNumber ?? '—'}</a></td>
						<td>{inv.client.legalName}</td>
						<td>
							{#if inv.status === 'overdue'}
								<span class="badge inv-overdue">Просрочена</span>
							{:else}
								<span class="badge inv-issued">Издадена</span>
							{/if}
						</td>
						<td class="amount muted">{fmtDate(inv.dueDate)}</td>
						<td class="num">{fmtMoney(inv.grossTotalCents)}</td>
					</tr>
				{:else}
					<tr><td colspan="5" class="muted" style="text-align:center; padding:20px;">Няма неплатени фактури.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

{:else}
	<!-- ── Employee dashboard ───────────────────────────────────────────────── -->
	<div class="page-header">
		<div>
			<h1 class="page-title">Добре дошъл</h1>
			<p class="page-sub">Моите задачи и работно време</p>
		</div>
	</div>
	<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:24px;">
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Просрочени задачи</div>
			<div class="stat-value" style={data.overdueTasks > 0 ? 'color:var(--danger)' : ''}>{data.overdueTasks}</div>
		</div>
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Незафактурирани записа</div>
			<div class="stat-value">{data.uninvoicedTimeLogs._count}</div>
		</div>
		<div class="stat" style="padding:14px;">
			<div class="stat-label">Незафактурирано работно време</div>
			<div class="stat-value">{fmtDuration(data.uninvoicedTimeLogs._sum.durationMinutes)}</div>
		</div>
	</div>
	<div class="card">
		<div class="card-header">
			<h3 class="card-title">Моите задачи</h3>
		</div>
		<table class="tbl">
			<thead>
				<tr><th>Задача</th><th>Проект</th><th>Приоритет</th><th>Краен срок</th></tr>
			</thead>
			<tbody>
				{#each data.assignedTasks as task}
					<tr>
						<td style="font-weight:500;"><a href="/projects/{task.taskList.projectId}" style="color:inherit;">{task.title}</a></td>
						<td class="muted">{task.taskList.project.name}</td>
						<td><span class="badge outline">{priorityLabels[task.priority] ?? task.priority}</span></td>
						<td class="amount {isOverdue(task.deadlineDate) ? '' : 'muted'}" style={isOverdue(task.deadlineDate) ? 'color:var(--danger)' : ''}>
							{fmtDate(task.deadlineDate)}
						</td>
					</tr>
				{:else}
					<tr><td colspan="4" class="muted" style="text-align:center; padding:20px;">Няма назначени задачи.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
