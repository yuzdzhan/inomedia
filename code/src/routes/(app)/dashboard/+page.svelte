<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const dateFormatter = new Intl.DateTimeFormat('bg-BG', {
		day: '2-digit',
		month: 'short',
		year: 'numeric'
	});

	function formatDate(date: Date | string | null | undefined): string {
		if (!date) return '—';
		return dateFormatter.format(new Date(date));
	}

	function formatAmount(cents: number): string {
		return (cents / 100).toFixed(2) + ' EUR';
	}

	function formatDuration(minutes: number | null | undefined): string {
		if (!minutes) return '0м';
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		if (h === 0) return `${m}м`;
		if (m === 0) return `${h}ч`;
		return `${h}ч ${m}м`;
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	function isOverdue(deadline: Date | string | null | undefined): boolean {
		if (!deadline) return false;
		return new Date(deadline) < today;
	}

	const priorityLabels: Record<string, string> = {
		low: 'Ниски',
		medium: 'Средни',
		high: 'Висок'
	};

	const statusLabels: Record<string, string> = {
		todo: 'Чакащо',
		in_progress: 'В процес',
		issued: 'Издадена',
		partially_paid: 'Частично платена',
		overdue: 'Просрочена'
	};

	const containerTypeLabels: Record<string, string> = {
		bank: 'Банка',
		cashbox: 'Каса'
	};

	const ledgerEntryTypeLabels: Record<string, string> = {
		invoice_payment: 'Плащане по фактура',
		standalone_income: 'Самостоятелен приход',
		expense_payment: 'Плащане на разход',
		generic_credit: 'Кредит',
		generic_debit: 'Дебит',
		transfer_out: 'Трансфер изходящ',
		transfer_in: 'Трансфер входящ'
	};
</script>

<svelte:head>
	<title>Начало – Иномедия</title>
</svelte:head>

<h1>Добре дошли!</h1>
<p style="color: #64748b; margin-top: 8px; margin-bottom: 24px;">Системата е активна и готова за работа.</p>

{#if data.role === 'employee'}
	<!-- Employee dashboard -->
	<div class="stat-grid">
		<div class="stat-card {data.overdueTasks > 0 ? 'danger' : ''}">
			<div class="stat-value">{data.overdueTasks}</div>
			<div class="stat-label">Просрочени задачи</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">{data.uninvoicedTimeLogs._count}</div>
			<div class="stat-label">Незафактурирани записа</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">{formatDuration(data.uninvoicedTimeLogs._sum.durationMinutes)}</div>
			<div class="stat-label">Незафактурирано работно време</div>
		</div>
	</div>

	<section class="section">
		<h2>Моите задачи</h2>
		{#if data.assignedTasks.length === 0}
			<p class="empty-state">Няма назначени задачи в момента.</p>
		{:else}
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Задача</th>
							<th>Проект</th>
							<th>Приоритет</th>
							<th>Краен срок</th>
							<th>Статус</th>
						</tr>
					</thead>
					<tbody>
						{#each data.assignedTasks as task}
							<tr>
								<td>
									<a href="/projects/{task.taskList.projectId}">{task.title}</a>
								</td>
								<td>{task.taskList.project.name}</td>
								<td>{priorityLabels[task.priority] ?? task.priority}</td>
								<td>
									{#if task.deadlineDate}
										<span class={isOverdue(task.deadlineDate) ? 'text-danger' : ''}>
											{formatDate(task.deadlineDate)}
											{#if isOverdue(task.deadlineDate)}&nbsp;⚠{/if}
										</span>
									{:else}
										—
									{/if}
								</td>
								<td>{statusLabels[task.status] ?? task.status}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

{:else if data.role === 'manager'}
	<!-- Manager dashboard -->
	<div class="stat-grid">
		<div class="stat-card">
			<div class="stat-value">{data.managedProjects.length}</div>
			<div class="stat-label">Активни проекти</div>
		</div>
		<div class="stat-card {data.overdueTasks > 0 ? 'danger' : ''}">
			<div class="stat-value">{data.overdueTasks}</div>
			<div class="stat-label">Просрочени задачи</div>
		</div>
		<div class="stat-card {data.uninvoicedTaskCount > 0 ? 'warning' : ''}">
			<div class="stat-value">{data.uninvoicedTaskCount}</div>
			<div class="stat-label">Незафактурирани задачи</div>
		</div>
	</div>

	<section class="section">
		<h2>Активни проекти</h2>
		{#if data.managedProjects.length === 0}
			<p class="empty-state">Няма активни проекти в момента.</p>
		{:else}
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Проект</th>
							<th>Клиент</th>
							<th>Списъци задачи</th>
						</tr>
					</thead>
					<tbody>
						{#each data.managedProjects as project}
							<tr>
								<td><a href="/projects/{project.id}">{project.name}</a></td>
								<td>{project.client.legalName}</td>
								<td>{project._count.taskLists}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

{:else if data.role === 'accountant'}
	<!-- Accountant dashboard -->
	<div class="stat-grid">
		<div class="stat-card {data.unpaidInvoices.length > 0 ? 'warning' : 'success'}">
			<div class="stat-value">{data.unpaidInvoices.length}</div>
			<div class="stat-label">Неплатени фактури</div>
		</div>
		<div class="stat-card {data.upcomingExpenses.length > 0 ? 'warning' : ''}">
			<div class="stat-value">{data.upcomingExpenses.length}</div>
			<div class="stat-label">Предстоящи разходи (30 дни)</div>
		</div>
		<div class="stat-card {data.statementReviewCount > 0 ? 'danger' : 'success'}">
			<div class="stat-value">{data.statementReviewCount}</div>
			<div class="stat-label">За преглед в извлечения</div>
		</div>
	</div>

	<section class="section">
		<h2>Неплатени фактури</h2>
		{#if data.unpaidInvoices.length === 0}
			<p class="empty-state">Няма неплатени фактури.</p>
		{:else}
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Номер</th>
							<th>Клиент</th>
							<th>Статус</th>
							<th>Падеж</th>
							<th>Сума</th>
							<th>Платено</th>
						</tr>
					</thead>
					<tbody>
						{#each data.unpaidInvoices as invoice}
							{@const isInvoiceOverdue = invoice.dueDate && new Date(invoice.dueDate) < today}
							<tr>
								<td>
									<a href="/invoices/{invoice.id}">{invoice.invoiceNumber ?? '—'}</a>
								</td>
								<td>{invoice.client.legalName}</td>
								<td>
									<span class="badge {invoice.status === 'overdue' ? 'badge-danger' : 'badge-warning'}">
										{statusLabels[invoice.status] ?? invoice.status}
									</span>
								</td>
								<td>
									{#if invoice.dueDate}
										<span class={isInvoiceOverdue ? 'text-danger' : ''}>
											{formatDate(invoice.dueDate)}
										</span>
									{:else}
										—
									{/if}
								</td>
								<td>{formatAmount(invoice.grossTotalCents)}</td>
								<td>{formatAmount(invoice.paidTotalCents)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section class="section">
		<h2>Предстоящи периодични разходи</h2>
		{#if data.upcomingExpenses.length === 0}
			<p class="empty-state">Няма предстоящи периодични разходи през следващите 30 дни.</p>
		{:else}
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Описание</th>
							<th>Категория</th>
							<th>Дата</th>
							<th>Сума</th>
						</tr>
					</thead>
					<tbody>
						{#each data.upcomingExpenses as expense}
							<tr>
								<td>{expense.description}</td>
								<td>{expense.category.name}</td>
								<td>{formatDate(expense.incurredDate)}</td>
								<td>{formatAmount(expense.amountCents)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

{:else}
	<!-- Admin dashboard -->
	<div class="stat-grid">
		<div class="stat-card {data.unpaidInvoicesCount > 0 ? 'warning' : 'success'}">
			<div class="stat-value">{data.unpaidInvoicesCount}</div>
			<div class="stat-label">Неплатени фактури</div>
		</div>
		<div class="stat-card {data.overdueTaskCount > 0 ? 'danger' : 'success'}">
			<div class="stat-value">{data.overdueTaskCount}</div>
			<div class="stat-label">Просрочени задачи</div>
		</div>
		<div class="stat-card {data.unpaidExpensesCount > 0 ? 'warning' : ''}">
			<div class="stat-value">{data.unpaidExpensesCount}</div>
			<div class="stat-label">Неплатени разходи</div>
		</div>
		<div class="stat-card {data.statementReviewCount > 0 ? 'danger' : 'success'}">
			<div class="stat-value">{data.statementReviewCount}</div>
			<div class="stat-label">За преглед в извлечения</div>
		</div>
		{#each data.balances as bal}
			<div class="stat-card {bal.balance < 0 ? 'danger' : 'success'}">
				<div class="stat-value">{formatAmount(bal.balance)}</div>
				<div class="stat-label">{containerTypeLabels[bal.containerType] ?? bal.containerType}: {bal.name}</div>
			</div>
		{/each}
	</div>

	{#if data.balances.length === 0}
		<p class="empty-state" style="margin-bottom: 24px;">Няма конфигурирани финансови контейнери.</p>
	{/if}

	<section class="section">
		<h2>Последни счетоводни записи</h2>
		{#if data.recentLedgerEntries.length === 0}
			<p class="empty-state">Няма счетоводни записи.</p>
		{:else}
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Дата</th>
							<th>Вид</th>
							<th>Описание</th>
							<th>Сметка</th>
							<th>Сума</th>
						</tr>
					</thead>
					<tbody>
						{#each data.recentLedgerEntries as entry}
							<tr>
								<td>{formatDate(entry.entryDate)}</td>
								<td>{ledgerEntryTypeLabels[entry.entryType] ?? entry.entryType}</td>
								<td>{entry.description}</td>
								<td>{entry.container.name}</td>
								<td class={entry.amountCents < 0 ? 'text-danger' : 'text-success'}>
									{formatAmount(entry.amountCents)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #1e293b;
	}

	h2 {
		font-size: 1.125rem;
		font-weight: 600;
		color: #1e293b;
		margin-bottom: 14px;
	}

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 16px;
		margin-bottom: 24px;
	}

	.stat-card {
		background: white;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 20px;
	}

	.stat-card .stat-value {
		font-size: 2rem;
		font-weight: 700;
		color: #1e293b;
	}

	.stat-card .stat-label {
		font-size: 0.875rem;
		color: #64748b;
		margin-top: 4px;
	}

	.stat-card.warning .stat-value {
		color: #d97706;
	}

	.stat-card.danger .stat-value {
		color: #dc2626;
	}

	.stat-card.success .stat-value {
		color: #16a34a;
	}

	.section {
		margin-bottom: 32px;
	}

	.table-wrap {
		overflow-x: auto;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	thead {
		background: #f8fafc;
	}

	th {
		text-align: left;
		padding: 10px 14px;
		font-weight: 600;
		color: #475569;
		font-size: 0.8125rem;
		border-bottom: 1px solid #e2e8f0;
	}

	td {
		padding: 10px 14px;
		color: #334155;
		border-bottom: 1px solid #f1f5f9;
	}

	tbody tr:last-child td {
		border-bottom: none;
	}

	tbody tr:hover {
		background: #f8fafc;
	}

	a {
		color: #2563eb;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	.empty-state {
		color: #94a3b8;
		font-size: 0.9375rem;
		padding: 20px 0;
	}

	.text-danger {
		color: #dc2626;
	}

	.text-success {
		color: #16a34a;
	}

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.badge-warning {
		background: #fef3c7;
		color: #92400e;
	}

	.badge-danger {
		background: #fee2e2;
		color: #991b1b;
	}
</style>
