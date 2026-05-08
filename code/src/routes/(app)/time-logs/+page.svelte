<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function fmtMinutes(mins: number): string {
		const h = Math.floor(mins / 60);
		const m = mins % 60;
		return `${h}ч ${String(m).padStart(2, '0')}м`;
	}

	function fmtDate(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit' });
	}

	function fmtAmount(cents: number): string {
		return (cents / 100).toFixed(2).replace('.', ',');
	}

	function fmtRate(cents: number | null): string {
		if (!cents) return '—';
		return (cents / 100).toFixed(0);
	}

	function logAmount(durationMinutes: number, rateCents: number | null): number {
		if (!rateCents) return 0;
		return Math.round((durationMinutes / 60) * rateCents);
	}

	function initials(firstName: string, lastName: string): string {
		return (firstName[0] ?? '') + (lastName[0] ?? '');
	}

	const avatarColors = ['#4f46e5', '#0891b2', '#dc2626', '#ca8a04', '#059669', '#7c3aed'];
	const colorMap = new Map<string, string>();
	let colorIdx = 0;
	function userColor(userId: string): string {
		if (!colorMap.has(userId)) {
			colorMap.set(userId, avatarColors[colorIdx++ % avatarColors.length]);
		}
		return colorMap.get(userId)!;
	}

	let deletingId = $state<string | null>(null);
</script>

<svelte:head>
	<title>Времелог – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Времелог</h1>
		<p class="page-sub">
			{data.logs.length} записа · {fmtMinutes(data.totalMinutes)} общо
			{#if data.totalAmountCents > 0}· {fmtAmount(data.totalAmountCents)} лв.{/if}
		</p>
	</div>
</div>

{#if (form as any)?.deleteError}
	<div class="alert danger" style="margin-bottom:12px;">{(form as any).deleteError}</div>
{/if}
{#if data.hitLimit}
	<div class="alert warning" style="margin-bottom:12px;">Показани са само първите 300 записа. Приложете филтри, за да видите по-стари записи.</div>
{/if}

<!-- Filters -->
<form method="GET" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:12px;">
	<input class="input" type="date" name="dateFrom" value={data.filters.dateFrom} style="width:140px;" title="От дата" />
	<input class="input" type="date" name="dateTo" value={data.filters.dateTo} style="width:140px;" title="До дата" />
	{#if data.users.length > 0}
		<select class="select" name="userId" style="width:auto;">
			<option value="">Всички служители</option>
			{#each data.users as u}
				<option value={u.id} selected={data.filters.userId === u.id}>{u.firstName} {u.lastName}</option>
			{/each}
		</select>
	{/if}
	<select class="select" name="projectId" style="width:auto;">
		<option value="">Всички проекти</option>
		{#each data.projects as p}
			<option value={p.id} selected={data.filters.projectId === p.id}>{p.name}</option>
		{/each}
	</select>
	<select class="select" name="invoiced" style="width:auto;">
		<option value="all" selected={data.filters.invoiced === 'all'}>Всички</option>
		<option value="uninvoiced" selected={data.filters.invoiced === 'uninvoiced'}>Незафактурирано</option>
		<option value="invoiced" selected={data.filters.invoiced === 'invoiced'}>Фактурирано</option>
	</select>
	<button type="submit" class="btn btn-secondary btn-sm">Приложи</button>
	<a href="/time-logs" class="btn btn-ghost btn-sm">Изчисти</a>
</form>

<div class="card">
	<table class="tbl">
		<thead>
			<tr>
				<th style="width:70px;">Дата</th>
				<th>Служител</th>
				<th style="width:20%;">Проект</th>
				<th>Задача / Описание</th>
				<th style="text-align:right;">Време</th>
				<th style="text-align:right;">Ставка</th>
				<th style="text-align:right;">Сума</th>
				<th>Статус</th>
				<th style="width:28px;"></th>
			</tr>
		</thead>
		<tbody>
			{#each data.logs as log}
				{@const project = log.task.taskList.project}
				{@const amt = logAmount(log.durationMinutes, log.snapshotBillableRateCents)}
				{@const locked = log.invoicedAt !== null}
				<tr style={locked ? 'opacity:0.7;' : ''}>
					<td class="amount muted" style="font-size:12px; white-space:nowrap;">{fmtDate(log.workDate)}</td>
					<td>
						<div style="display:flex; align-items:center; gap:6px;">
							<div class="sb-avatar" style="width:20px; height:20px; font-size:9px; background:{userColor(log.user.id)};">
								{initials(log.user.firstName, log.user.lastName)}
							</div>
							<span style="font-size:12px;">{log.user.firstName} {log.user.lastName}</span>
						</div>
					</td>
					<td style="font-size:13px;">
						<a href="/projects/{project.id}" style="color:var(--text); text-decoration:none;">{project.name}</a>
						<div class="muted" style="font-size:11px;">{project.client.legalName}</div>
					</td>
					<td class="muted" style="font-size:12px; max-width:240px;">
						<div style="font-size:13px; color:var(--text);">{log.task.title}</div>
						{#if log.description}<div style="font-size:11px;">{log.description}</div>{/if}
					</td>
					<td class="amount" style="text-align:right; white-space:nowrap;">{fmtMinutes(log.durationMinutes)}</td>
					<td class="amount muted" style="text-align:right; font-size:12px;">{fmtRate(log.snapshotBillableRateCents)}</td>
					<td class="amount" style="text-align:right; font-weight:500;">{amt > 0 ? fmtAmount(amt) : '—'}</td>
					<td>
						{#if locked}
							<span class="badge task-done" style="font-size:10px;">Фактурирано</span>
						{:else}
							<span class="badge task-todo" style="font-size:10px;">Незафактурирано</span>
						{/if}
					</td>
					<td>
						{#if !locked && data.canDelete}
							<form method="POST" action="?/deleteLog" use:enhance={() => {
								deletingId = log.id;
								return async ({ update }) => { deletingId = null; await update(); };
							}}>
								<input type="hidden" name="logId" value={log.id} />
								<button type="submit" class="topbar-icon-btn" disabled={deletingId === log.id} title="Изтрий запис" style="color:var(--danger);">
									<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
								</button>
							</form>
						{/if}
					</td>
				</tr>
			{/each}
			{#if data.logs.length > 0}
				<tr style="background:var(--surface); font-weight:600;">
					<td colspan="4" style="font-size:13px;">Общо за периода</td>
					<td class="amount" style="text-align:right;">{fmtMinutes(data.totalMinutes)}</td>
					<td></td>
					<td class="amount" style="text-align:right;">{data.totalAmountCents > 0 ? fmtAmount(data.totalAmountCents) : '—'}</td>
					<td colspan="2"></td>
				</tr>
			{/if}
			{#if data.logs.length === 0}
				<tr>
					<td colspan="9" style="text-align:center; padding:32px 16px; color:var(--text-muted);">Няма времеви записи за избраните филтри.</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
