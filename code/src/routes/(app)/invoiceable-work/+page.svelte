<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const billingTypeLabels: Record<string, string> = {
		all: 'Всички',
		hourly: 'Почасово',
		flat_fee: 'Фиксирана цена'
	};

	const taskStatusLabels: Record<string, string> = {
		todo: 'За изпълнение',
		in_progress: 'В процес',
		done: 'Завършена',
		cancelled: 'Отказана'
	};

	function formatMoney(value: number) {
		return `${(value / 100).toFixed(2)} ${data.company.currency}`;
	}

	function formatMinutes(value: number) {
		const hours = Math.floor(value / 60);
		const minutes = value % 60;
		return `${hours}ч ${minutes.toString().padStart(2, '0')}м`;
	}

	function assigneeNames(
		assignees: Array<{
			firstName: string;
			lastName: string;
		}>
	) {
		return assignees.length > 0
			? assignees.map((assignee) => `${assignee.firstName} ${assignee.lastName}`).join(', ')
			: 'Няма назначени';
	}
</script>

<svelte:head>
	<title>Работа за фактуриране - Иномедия</title>
</svelte:head>

<section class="page-header">
	<div>
		<h1>Работа за фактуриране</h1>
		<p>Преглед на готовата за фактуриране работа с филтри по клиент, проект и тип таксуване.</p>
	</div>
</section>

{#if (form as any)?.createDraftError}
	<div class="alert error">{(form as any).createDraftError}</div>
{/if}

<section class="summary-grid">
	<div class="summary-card">
		<span class="summary-label">Задачи</span>
		<strong>{data.summary.taskCount}</strong>
	</div>
	<div class="summary-card">
		<span class="summary-label">Обща стойност</span>
		<strong>{formatMoney(data.summary.totalAmountCents)}</strong>
	</div>
	<div class="summary-card">
		<span class="summary-label">Нефактурирано време</span>
		<strong>{formatMinutes(data.summary.totalUninvoicedMinutes)}</strong>
	</div>
</section>

<section class="card filter-card">
	<form method="GET" class="filter-grid">
		<div class="field">
			<label for="clientId">Клиент</label>
			<select id="clientId" name="clientId">
				<option value="all">Всички клиенти</option>
				{#each data.clients as client}
					<option value={client.id} selected={data.filters.clientId === client.id}>{client.legalName}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="projectId">Проект</label>
			<select id="projectId" name="projectId">
				<option value="all">Всички проекти</option>
				{#each data.projects as project}
					<option value={project.id} selected={data.filters.projectId === project.id}>
						{project.name}
					</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="billingType">Тип таксуване</label>
			<select id="billingType" name="billingType">
				{#each Object.entries(billingTypeLabels) as [value, label]}
					<option value={value} selected={data.filters.billingType === value}>{label}</option>
				{/each}
			</select>
		</div>
		{#if data.users.length > 0}
			<div class="field">
				<label for="userId">Изпълнител</label>
				<select id="userId" name="userId">
					<option value="all" selected={data.filters.userId === 'all'}>Всички изпълнители</option>
					{#each data.users as u}
						<option value={u.id} selected={data.filters.userId === u.id}>
							{u.firstName} {u.lastName}
						</option>
					{/each}
				</select>
			</div>
		{/if}
		<div class="field">
			<label for="dateFrom">Работа от дата</label>
			<input id="dateFrom" type="date" name="dateFrom" value={data.filters.dateFrom} />
		</div>
		<div class="field">
			<label for="dateTo">Работа до дата</label>
			<input id="dateTo" type="date" name="dateTo" value={data.filters.dateTo} />
		</div>
		<div class="filter-actions">
			<button type="submit" class="btn-primary">Приложи</button>
			<a class="btn-secondary" href="/invoiceable-work">Изчисти</a>
		</div>
	</form>
</section>

{#if data.grouped.length === 0}
	<section class="card empty-card">
		<h2>Няма резултати</h2>
		<p>Няма задачи, които отговарят на избраните филтри и са готови за фактуриране.</p>
	</section>
{:else}
	<div class="group-list">
		{#each data.grouped as clientGroup}
			<section class="card client-card">
				<header class="group-header">
					<div>
						<div class="eyebrow">Клиент</div>
						<h2>{clientGroup.legalName}</h2>
					</div>
					<strong>{formatMoney(clientGroup.totalAmountCents)}</strong>
				</header>

				<form method="POST" action="?/createDraft" class="project-groups">
					<input type="hidden" name="clientId" value={clientGroup.id} />
					{#each clientGroup.projects as projectGroup}
						<section class="project-card">
							<header class="project-header">
								<div>
									<div class="eyebrow">Проект</div>
									<h3>{projectGroup.name}</h3>
								</div>
								<div class="project-total">{formatMoney(projectGroup.totalAmountCents)}</div>
							</header>

							<div class="table-head">
								<span></span>
								<span>Задача</span>
								<span>Тип</span>
								<span>Статус</span>
								<span>Обхват</span>
								<span>Стойност</span>
							</div>

							{#each projectGroup.items as item}
								<label class="task-row">
									<span class="task-select">
										<input type="checkbox" name="taskIds" value={item.id} />
									</span>
									<span class="task-main">
										<a class="task-link" href={`/projects/${item.projectId}`}>{item.title}</a>
										<small>{assigneeNames(item.assignees)}</small>
									</span>
									<span>{billingTypeLabels[item.billingType]}</span>
									<span>{taskStatusLabels[item.status]}</span>
									<span>
										{#if item.billingType === 'hourly'}
											{formatMinutes(item.uninvoicedMinutes)} · {item.uninvoicedLogCount} записа
											<br />
											<small>{item.firstWorkDate} - {item.lastWorkDate}</small>
										{:else}
											Фиксирана цена
										{/if}
									</span>
									<span class="amount">{formatMoney(item.amountCents)}</span>
								</label>
							{/each}
						</section>
					{/each}

					{#if data.permissions.canCreateDrafts}
						<div class="draft-actions">
							<button type="submit" class="btn-primary">Създай чернова за клиента</button>
						</div>
					{/if}
				</form>
			</section>
		{/each}
	</div>
{/if}

<style>
	.page-header {
		margin-bottom: 24px;
	}

	.page-header h1,
	h2,
	h3 {
		margin: 0;
		color: #0f172a;
	}

	.page-header p {
		margin: 8px 0 0;
		color: #64748b;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
		margin-bottom: 20px;
	}

	.summary-card,
	.card {
		background: #fff;
		border-radius: 14px;
		box-shadow: 0 2px 16px rgba(15, 23, 42, 0.06);
	}

	.alert {
		padding: 12px 14px;
		border-radius: 10px;
		margin-bottom: 16px;
	}

	.alert.error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #b91c1c;
	}

	.summary-card {
		display: grid;
		gap: 6px;
		padding: 18px 20px;
	}

	.summary-label,
	.eyebrow {
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #64748b;
	}

	.filter-card,
	.client-card {
		padding: 20px;
	}

	.filter-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 14px;
		align-items: end;
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

	select,
	button {
		font: inherit;
	}

	select {
		width: 100%;
		border: 1px solid #cbd5e1;
		border-radius: 10px;
		padding: 10px 12px;
		background: #fff;
		color: #0f172a;
	}

	.filter-actions {
		display: flex;
		gap: 10px;
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

	.group-list,
	.project-groups {
		display: grid;
		gap: 16px;
	}

	.group-header,
	.project-header,
	.task-row,
	.table-head {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 16px;
		align-items: center;
	}

	.project-card {
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		overflow: hidden;
	}

	.project-header,
	.table-head {
		padding: 16px 18px;
	}

	.table-head,
	.task-row {
		grid-template-columns: 56px 2fr 1fr 1fr 1.3fr 1fr;
	}

	.table-head {
		border-top: 1px solid #e2e8f0;
		background: #f8fafc;
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #64748b;
	}

	.task-row {
		padding: 16px 18px;
		border-top: 1px solid #eef2f7;
		color: inherit;
		text-decoration: none;
		cursor: pointer;
	}

	.task-row:hover {
		background: #f8fafc;
	}

	.task-main {
		display: grid;
		gap: 4px;
	}

	.task-select {
		display: flex;
		align-items: flex-start;
		justify-content: center;
	}

	.task-select input {
		margin-top: 4px;
	}

	.task-link {
		color: #0f172a;
		font-weight: 700;
	}

	.task-main small,
	.task-row small {
		color: #64748b;
	}

	.amount,
	.project-total {
		font-weight: 700;
		color: #0f172a;
	}

	.empty-card {
		padding: 24px;
	}

	.draft-actions {
		display: flex;
		justify-content: flex-end;
		padding-top: 4px;
	}

	@media (max-width: 960px) {
		.summary-grid,
		.filter-grid,
		.table-head,
		.task-row {
			grid-template-columns: 1fr;
		}

		.filter-actions {
			flex-direction: column;
		}
	}
</style>
