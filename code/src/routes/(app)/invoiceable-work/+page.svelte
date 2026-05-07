<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import Icon from '$lib/components/Icon.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const billingTypeLabels: Record<string, string> = {
		all: 'Всички', hourly: 'Часова', flat_fee: 'Фикс. цена'
	};

	const taskStatusLabels: Record<string, string> = {
		todo: 'За изпълнение', in_progress: 'В процес', done: 'Завършена', cancelled: 'Отказана'
	};

	function fmtMoney(cents: number) {
		return `${(cents / 100).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${data.company.currency}`;
	}

	function fmtMinutes(mins: number) {
		const h = Math.floor(mins / 60);
		const m = mins % 60;
		return `${h}ч ${String(m).padStart(2, '0')}м`;
	}

	const clientColors = ['#4f46e5', '#0891b2', '#dc2626', '#ca8a04', '#059669', '#7c3aed'];
</script>

<svelte:head>
	<title>Фактурируема работа – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Фактурируема работа</h1>
		<p class="page-sub">
			{data.grouped.length} клиента ·
			{data.summary.taskCount} задачи готови ·
			{fmtMoney(data.summary.totalAmountCents)} общо
		</p>
	</div>
	<div class="page-header-actions">
		<button class="btn btn-secondary btn-sm"><Icon name="filter" size={13}/>Филтри</button>
	</div>
</div>

{#if (form as any)?.createDraftError}
	<div class="alert danger" style="margin-bottom:12px;">{(form as any).createDraftError}</div>
{/if}

<!-- Filter bar -->
<form method="GET" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; align-items:flex-end;">
	<select class="select" name="clientId" style="width:auto;">
		<option value="all">Всички клиенти</option>
		{#each data.clients as c}
			<option value={c.id} selected={data.filters.clientId === c.id}>{c.legalName}</option>
		{/each}
	</select>
	<select class="select" name="projectId" style="width:auto;">
		<option value="all">Всички проекти</option>
		{#each data.projects as p}
			<option value={p.id} selected={data.filters.projectId === p.id}>{p.name}</option>
		{/each}
	</select>
	<select class="select" name="billingType" style="width:auto;">
		{#each Object.entries(billingTypeLabels) as [val, lbl]}
			<option value={val} selected={data.filters.billingType === val}>{lbl}</option>
		{/each}
	</select>
	{#if data.users.length > 0}
		<select class="select" name="userId" style="width:auto;">
			<option value="all">Всички служители</option>
			{#each data.users as u}
				<option value={u.id} selected={data.filters.userId === u.id}>{u.firstName} {u.lastName}</option>
			{/each}
		</select>
	{/if}
	<input class="input" type="date" name="dateFrom" value={data.filters.dateFrom} style="width:140px;" />
	<input class="input" type="date" name="dateTo" value={data.filters.dateTo} style="width:140px;" />
	<button type="submit" class="btn btn-secondary btn-sm">Приложи</button>
	<a href="/invoiceable-work" class="btn btn-ghost btn-sm">Изчисти</a>
</form>

{#if data.grouped.length === 0}
	<div class="card" style="padding:40px; text-align:center;">
		<div class="muted">Няма задачи готови за фактуриране.</div>
	</div>
{:else}
	<div class="col gap-3">
		{#each data.grouped as clientGroup, gi}
			<div class="card">
				<!-- Client header -->
				<div style="padding:12px 16px; background:var(--accent-subtle); border-bottom:1px solid var(--border); display:flex; align-items:center; gap:12px;">
					<div class="sb-avatar" style="width:28px; height:28px; font-size:11px; background:{clientColors[gi % clientColors.length]};">{clientGroup.legalName[0]}</div>
					<div class="col" style="flex:1;">
						<span style="font-weight:600; font-size:14px;">{clientGroup.legalName}</span>
						<span class="muted amount" style="font-size:11px;">
							{clientGroup.projects.length} {clientGroup.projects.length === 1 ? 'проект' : 'проекта'} ·
							{clientGroup.projects.reduce((s: number, p: any) => s + p.items.length, 0)} задачи
						</span>
					</div>
					<div class="col" style="align-items:flex-end;">
						<span class="amount" style="font-size:16px; font-weight:600;">{fmtMoney(clientGroup.totalAmountCents)}</span>
						<span class="muted" style="font-size:11px;">незафактурирано</span>
					</div>
					{#if data.permissions.canCreateDrafts}
						<form method="POST" action="?/createDraft">
							<input type="hidden" name="clientId" value={clientGroup.id} />
							{#each clientGroup.projects as pg}
								{#each pg.items as item}
									<input type="hidden" name="taskIds" value={item.id} />
								{/each}
							{/each}
							<button type="submit" class="btn btn-accent btn-sm"><Icon name="plus" size={12}/>Създай фактура</button>
						</form>
					{/if}
				</div>

				<!-- Projects -->
				{#each clientGroup.projects as projectGroup}
					<div style="border-top:1px solid var(--border-soft);">
						<div style="padding:8px 16px; background:var(--surface); display:flex; align-items:center; gap:10px; font-size:12px;">
							<Icon name="folder" size={12}/>
							<span style="font-weight:600;">{projectGroup.name}</span>
							<span class="amount muted" style="font-size:11px;">{fmtMoney(projectGroup.totalAmountCents)}</span>
						</div>

						{#each projectGroup.items as item}
							<div style="display:grid; grid-template-columns:1fr 110px 130px 100px 28px; padding:8px 16px; border-top:1px solid var(--border-soft); align-items:center; gap:12px; font-size:13px;">
								<div>
									<a href="/projects/{item.projectId}" style="font-weight:450; color:var(--text);">{item.title}</a>
									{#if item.assignees.length > 0}
										<div class="muted" style="font-size:11px;">{item.assignees.map((a: any) => `${a.firstName} ${a.lastName}`).join(', ')}</div>
									{/if}
								</div>
								<span class="badge outline" style="font-size:10px; justify-self:flex-start;">{billingTypeLabels[item.billingType] ?? item.billingType}</span>
								<span class="amount muted" style="font-size:11px; text-align:right;">
									{#if item.billingType === 'hourly'}
										{fmtMinutes(item.uninvoicedMinutes)}
									{:else}
										Фиксирана
									{/if}
								</span>
								<span class="amount" style="font-weight:500; text-align:right;">{fmtMoney(item.amountCents)}</span>
								<div></div>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	</div>
{/if}
