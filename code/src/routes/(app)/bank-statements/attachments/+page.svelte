<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { fmtDate } from '$lib/utils/format';

	let { data }: { data: PageData } = $props();

	let selectedYear = $state(data.year);
	let selectedMonth = $state(data.month);
	let printing = $state(false);

	const monthNames = [
		'Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
		'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'
	];

	const currentYear = new Date().getFullYear();
	const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

	function navigate() {
		goto(`/bank-statements/attachments?month=${selectedYear}-${String(selectedMonth).padStart(2, '0')}`);
	}

	function formatAmount(cents: number): string {
		return `${(Math.abs(cents) / 100).toFixed(2)} EUR`;
	}

	type Attachment = { id: string; originalFilename: string };
	type Row = {
		id: string;
		type: 'income' | 'expense';
		date: Date;
		label: string;
		description: string;
		amountCents: number;
		attachments: Attachment[];
	};

	const allRecords: Row[] = $derived([
		...data.incomes.map((i) => ({
			id: i.id,
			type: 'income' as const,
			date: new Date(i.date),
			label: i.source ?? '—',
			description: i.description,
			amountCents: i.amountCents,
			attachments: i.attachments
		})),
		...data.expenses.map((e) => ({
			id: e.id,
			type: 'expense' as const,
			date: new Date(e.date),
			label: e.categoryName,
			description: e.description,
			amountCents: e.amountCents,
			attachments: e.attachments
		}))
	].sort((a, b) => a.date.getTime() - b.date.getTime()));

	type PrintItem = { type: 'income' | 'expense'; id: string };
	const allAttachments: PrintItem[] = $derived(
		allRecords.flatMap((r) => r.attachments.map((a) => ({ type: r.type, id: a.id })))
	);

	async function printAll() {
		if (allAttachments.length === 0) return;
		printing = true;

		try {
			const items = allAttachments.map((a) => `${a.type}:${a.id}`).join(',');
			const mergedUrl = `/bank-statements/attachments/merged?items=${encodeURIComponent(items)}`;
			window.open(mergedUrl, '_blank');
		} finally {
			printing = false;
		}
	}
</script>

<svelte:head>
	<title>Прикачени файлове — {monthNames[data.month - 1]} {data.year} – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<div style="margin-bottom:6px;">
			<a href="/bank-statements" style="font-size:12px; text-decoration:none; color:var(--text-muted);">← Банкови извлечения</a>
		</div>
		<h1 class="page-title">Прикачени файлове</h1>
		<p class="page-sub">Приходи и разходи с документи за {monthNames[data.month - 1]} {data.year}</p>
	</div>
	<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
		<select class="select" bind:value={selectedMonth} onchange={navigate}>
			{#each monthNames as name, i}
				<option value={i + 1}>{name}</option>
			{/each}
		</select>
		<select class="select" bind:value={selectedYear} onchange={navigate}>
			{#each years as y}
				<option value={y}>{y}</option>
			{/each}
		</select>
		<button class="btn btn-primary" onclick={printAll} disabled={printing || allAttachments.length === 0}>
			{printing ? 'Зарежда…' : `Принтирай PDF (${allAttachments.length})`}
		</button>
	</div>
</div>

{#if allRecords.length === 0}
	<div class="card" style="padding:40px; text-align:center;">
		<div class="muted">Няма записи за {monthNames[data.month - 1]} {data.year}.</div>
	</div>
{:else}
	<div class="card">
		<table class="tbl">
			<thead>
				<tr>
					<th>Дата</th>
					<th>Тип</th>
					<th>Категория / Източник</th>
					<th>Описание</th>
					<th style="text-align:right;">Сума</th>
					<th>Файлове</th>
				</tr>
			</thead>
			<tbody>
				{#each allRecords as r}
					<tr>
						<td class="muted" style="font-size:12px; white-space:nowrap;">{fmtDate(r.date)}</td>
						<td>
							<span class="badge {r.type === 'income' ? 'task-done' : 'task-cancelled'}" style="font-size:10px;">
								{r.type === 'income' ? 'Приход' : 'Разход'}
							</span>
						</td>
						<td style="font-size:13px;">{r.label}</td>
						<td style="font-size:13px; max-width:220px;">{r.description}</td>
						<td class="amount" style="text-align:right; font-weight:600; white-space:nowrap; color:{r.type === 'income' ? 'var(--success)' : 'var(--danger)'};">
							{r.type === 'income' ? '+' : '-'}{formatAmount(r.amountCents)}
						</td>
						<td style="font-size:12px;">
							{#if r.attachments.length === 0}
								<span class="muted">—</span>
							{:else}
								<div style="display:flex; flex-direction:column; gap:2px;">
									{#each r.attachments as att}
										<a href="/bank-statements/attachments/pdf/{r.type}/{att.id}" target="_blank"
											style="color:var(--accent); text-decoration:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px; display:block;"
											title={att.originalFilename}>
											↗ {att.originalFilename}
										</a>
									{/each}
								</div>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
